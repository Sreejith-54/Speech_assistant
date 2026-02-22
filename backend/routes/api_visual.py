"""
REST API Endpoint — Visually Challenged Mode
POST /visual

Accepts: audio file (WAV/WebM/MP3) or plain text
Returns: JSON with transcript, response_text, and base64-encoded TTS audio

This is a STATELESS endpoint — the caller manages conversation history.
Pass previous turns in `conversation_history` (JSON array) for multi-turn support.

External usage examples are in the /docs Swagger UI.
"""

import asyncio
import base64
import io
import json
import logging
import numpy as np  # type: ignore
import os
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile  # type: ignore
from fastapi.responses import JSONResponse  # type: ignore
from pydantic import BaseModel  # type: ignore

from ..services.llm import LLMClient  # type: ignore
from ..services.tts import TTSClient  # type: ignore
from ..services.transcription import WhisperTranscriber  # type: ignore

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Visual Mode"])

# ─── Request / Response models ────────────────────────────────────────────────

class VisualResponse(BaseModel):
    """Response returned by POST /visual"""
    transcript: str
    """The text that was transcribed from the audio (empty if text was the input)"""
    response_text: str
    """The AI assistant's text response"""
    audio_base64: str
    """Base64-encoded WAV audio of the AI's spoken response. Decode and play on the client."""
    conversation_history: List[Dict[str, Any]]
    """Updated conversation history including this turn. Pass back on the next request."""

# ─── Dependency injection (services are global singletons in main.py) ─────────

_transcription_service: Optional[WhisperTranscriber] = None
_llm_service: Optional[LLMClient] = None
_tts_service: Optional[TTSClient] = None


def init_visual_router(
    transcription_svc: WhisperTranscriber,
    llm_svc: LLMClient,
    tts_svc: TTSClient,
) -> None:
    """Called from main.py startup to wire global service instances."""
    global _transcription_service, _llm_service, _tts_service
    _transcription_service = transcription_svc
    _llm_service = llm_svc
    _tts_service = tts_svc
    logger.info("[/visual] Services registered")


def _load_system_prompt() -> str:
    path = os.path.join("prompts", "system_prompt.md")
    try:
        if os.path.exists(path):
            content = open(path).read().strip()
            if content:
                return content
    except Exception:
        pass
    return (
        "You are a helpful, friendly, and concise voice assistant. "
        "Keep responses brief and to the point."
    )

# ─── Endpoint ─────────────────────────────────────────────────────────────────

@router.post(
    "/visual",
    response_model=VisualResponse,
    summary="Visually Challenged AI Assistant",
    description=(
        "Send voice audio **or** plain text and receive an AI response with spoken TTS audio.\n\n"
        "This endpoint is **stateless**: pass previous turns as `conversation_history` (JSON array).\n\n"
        "**cURL (audio):**\n"
        "```bash\n"
        "curl -X POST http://localhost:8000/visual \\\n"
        "  -F 'audio=@recording.wav' | jq\n"
        "```\n\n"
        "**cURL (text):**\n"
        "```bash\n"
        "curl -X POST http://localhost:8000/visual \\\n"
        "  -F 'text=Hello, how are you?' | jq\n"
        "```\n\n"
        "**Python:**\n"
        "```python\n"
        "import requests, base64\n"
        "r = requests.post('http://localhost:8000/visual', data={'text': 'Hello'})\n"
        "audio = base64.b64decode(r.json()['audio_base64'])\n"
        "open('reply.wav', 'wb').write(audio)\n"
        "```"
    ),
)
async def visual_endpoint(
    audio: Optional[UploadFile] = File(None, description="Audio file (WAV / WebM / MP3)"),
    text: Optional[str] = Form(None, description="Text input (alternative to audio)"),
    conversation_history: Optional[str] = Form(
        None,
        description="JSON array of previous conversation turns: "
                    '[{"role":"user","content":"..."},{"role":"assistant","content":"..."}]',
    ),
):
    """
    Visual mode — voice-only AI assistant.

    Provide either `audio` (file upload) or `text`. The endpoint:
    1. Transcribes audio with Whisper (if audio provided)
    2. Sends the text to the LLM using the supplied conversation history
    3. Generates TTS audio for the response
    4. Returns transcript + response text + base64-encoded audio
    """
    if _transcription_service is None or _llm_service is None or _tts_service is None:
        raise HTTPException(status_code=503, detail="Services not yet initialized")

    # Assign to local non-Optional names so the type checker is satisfied
    transcription_svc: WhisperTranscriber = _transcription_service
    llm_svc: LLMClient = _llm_service
    tts_svc: TTSClient = _tts_service

    # ── Step 1: resolve user text ──────────────────────────────────────────────
    user_text: str = ""

    if audio is not None:
        audio_bytes = await audio.read()
        audio_array = np.frombuffer(audio_bytes, dtype=np.uint8)
        logger.info(f"[/visual] Transcribing {len(audio_bytes)} bytes of audio")
        transcript, _ = await asyncio.to_thread(
            transcription_svc.transcribe, audio_array
        )
        user_text = (transcript or "").strip()
        logger.info(f"[/visual] Transcript: {user_text!r}")
    elif text:
        user_text = text.strip()

    if not user_text:
        raise HTTPException(
            status_code=400,
            detail="Provide either 'audio' (file upload) or 'text' (form field)",
        )

    # ── Step 2: parse conversation history ────────────────────────────────────
    history: List[Dict[str, Any]] = []
    if conversation_history:
        try:
            parsed = json.loads(conversation_history)
            if isinstance(parsed, list):
                history = parsed
        except (json.JSONDecodeError, Exception):
            logger.warning("[/visual] Invalid conversation_history JSON — starting fresh")

    # ── Step 3: LLM call — STATELESS (temp instance per request) ─────────────
    system_prompt = _load_system_prompt()
    temp_llm = LLMClient(
        api_endpoint=llm_svc.api_endpoint,
        model=llm_svc.model,
        temperature=llm_svc.temperature,
        max_tokens=llm_svc.max_tokens,
        timeout=llm_svc.timeout,
    )
    temp_llm.voice_history = list(history)

    logger.info(f"[/visual] Calling LLM with {len(history)} prior turns")
    llm_response = await asyncio.to_thread(
        temp_llm.get_response,
        user_text,
        system_prompt,
        True,
        None,
        "voice",
    )
    response_text: str = llm_response.get("text", "")
    updated_history = list(temp_llm.voice_history)

    # ── Step 4: TTS ─────────────────────────────────────────────────────
    logger.info(f"[/visual] Generating TTS for {len(response_text)} chars")
    audio_data: bytes = await tts_svc.async_text_to_speech(response_text)
    audio_b64 = base64.b64encode(audio_data).decode("utf-8")

    # ── Step 5: return ──────────────────────────────────────────────────────
    return dict(
        transcript=user_text,
        response_text=response_text,
        audio_base64=audio_b64,
        conversation_history=updated_history,
    )

