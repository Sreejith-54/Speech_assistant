"""
REST API Endpoint — Deaf Mode
POST /deaf

Accepts: plain text (required) or audio file (optional)
Returns: JSON with response_text and sign_tokens (+ optional audio)

This is a STATELESS endpoint — the caller manages conversation history.
Pass previous turns in `conversation_history` (JSON array) for multi-turn support.

External usage examples are in the /docs Swagger UI.
"""

import asyncio
import base64
import json
import logging
import numpy as np  # type: ignore
import os
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile  # type: ignore
from fastapi.responses import FileResponse  # type: ignore
from pydantic import BaseModel  # type: ignore

from ..services.llm import LLMClient  # type: ignore
from ..services.tts import TTSClient  # type: ignore
from ..services.transcription import WhisperTranscriber  # type: ignore
from ..services.sign_generator import SignGenerator  # type: ignore
from ..services.sigml_generator import get_sigml_generator  # type: ignore
from ..services.hybrid_sign_service import get_hybrid_sign_service  # type: ignore

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Deaf Mode"])

# ─── Request / Response models ────────────────────────────────────────────────

class DeafResponse(BaseModel):
    """Response returned by POST /deaf"""
    response_text: str
    """The AI assistant's text response"""
    sign_tokens: List[str]
    """ASL tokens to animate. Each token is one uppercase word/phrase (e.g. 'HELLO', 'THANK-YOU')"""
    sigml_xml: Optional[str] = None
    """SiGML XML for JASigning 3D avatar (optional, generated when generate_signs=true)"""
    audio_base64: Optional[str] = None
    """Base64-encoded WAV audio (only present when include_audio=true)"""
    conversation_history: List[Dict[str, Any]]
    """Updated conversation history for the next request"""

# ─── Dependency injection ─────────────────────────────────────────────────────

_transcription_service: Optional[WhisperTranscriber] = None
_llm_service: Optional[LLMClient] = None
_tts_service: Optional[TTSClient] = None
_sign_generator: SignGenerator = SignGenerator()


def init_deaf_router(
    transcription_svc: WhisperTranscriber,
    llm_svc: LLMClient,
    tts_svc: TTSClient,
) -> None:
    """Called from main.py startup to wire global service instances."""
    global _transcription_service, _llm_service, _tts_service
    _transcription_service = transcription_svc
    _llm_service = llm_svc
    _tts_service = tts_svc
    logger.info("[/deaf] Services registered")


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
        "You are a helpful, friendly assistant for deaf and hard-of-hearing users. "
        "Communicate in clear, concise text."
    )

# ─── Endpoint ─────────────────────────────────────────────────────────────────

@router.post(
    "/deaf",
    response_model=DeafResponse,
    summary="Deaf AI Assistant",
    description=(
        "Send text (or audio) and receive a text response with ASL sign tokens.\n\n"
        "This endpoint is **stateless**: pass previous turns as `conversation_history`.\n\n"
        "**cURL:**\n"
        "```bash\n"
        "curl -X POST http://localhost:8000/deaf \\\n"
        "  -F 'text=Hello, how are you?' | jq\n"
        "```\n\n"
        "**JavaScript:**\n"
        "```javascript\n"
        "const res = await fetch('http://localhost:8000/deaf', {\n"
        "  method: 'POST',\n"
        "  headers: {'Content-Type': 'application/json'},\n"
        "  body: JSON.stringify({ text: 'Hello', conversation_history: '[]' })\n"
        "});\n"
        "const data = await res.json();\n"
        "console.log(data.response_text, data.sign_tokens);\n"
        "```\n\n"
        "**Python:**\n"
        "```python\n"
        "import requests\n"
        "r = requests.post('http://localhost:8000/deaf',\n"
        "    data={'text': 'What is your name?'})\n"
        "print(r.json()['response_text'])\n"
        "print(r.json()['sign_tokens'])\n"
        "```"
    ),
)
async def deaf_endpoint(
    text: Optional[str] = Form(None, description="User's text message"),
    audio: Optional[UploadFile] = File(
        None,
        description="Audio file (WAV/WebM) — will be transcribed to text",
    ),
    conversation_history: Optional[str] = Form(
        None,
        description="JSON array of previous turns: "
                    '[{"role":"user","content":"..."},{"role":"assistant","content":"..."}]',
    ),
    include_audio: bool = Form(
        False,
        description="Set to true to include base64-encoded TTS audio in the response",
    ),
    generate_signs: bool = Form(
        True,
        description="Set to false to skip ASL sign generation (Chat Mode). Default: true.",
    ),
):
    """
    Deaf mode — text + sign language AI assistant.

    Provide `text` (primary) **or** `audio` (will be transcribed). The endpoint:
    1. Builds the request using the provided conversation history
    2. Calls the LLM (stateless — temp instance per request)
    3. Generates ASL sign tokens for the response
    4. Optionally generates TTS audio
    5. Returns JSON with all fields
    """
    if _llm_service is None or _tts_service is None:
        raise HTTPException(status_code=503, detail="Services not yet initialized")

    # Assign to local non-Optional names so the type checker is satisfied
    llm_svc: LLMClient = _llm_service
    tts_svc: TTSClient = _tts_service

    # ── Step 1: resolve user text ──────────────────────────────────────────────
    user_text: str = ""

    if text:
        user_text = text.strip()
    elif audio is not None:
        if _transcription_service is None:
            raise HTTPException(status_code=503, detail="Transcription service not initialized")
        transcription_svc: WhisperTranscriber = _transcription_service
        audio_bytes = await audio.read()
        audio_array = np.frombuffer(audio_bytes, dtype=np.uint8)
        logger.info(f"[/deaf] Transcribing {len(audio_bytes)} bytes of audio")
        transcript, _ = await asyncio.to_thread(
            transcription_svc.transcribe, audio_array
        )
        user_text = (transcript or "").strip()
        logger.info(f"[/deaf] Transcript: {user_text!r}")

    if not user_text:
        raise HTTPException(
            status_code=400,
            detail="Provide either 'text' (form field) or 'audio' (file upload)",
        )

    # ── Step 2: parse conversation history ────────────────────────────────────
    history: List[Dict[str, Any]] = []
    if conversation_history:
        try:
            parsed = json.loads(conversation_history)
            if isinstance(parsed, list):
                history = parsed
        except Exception:
            logger.warning("[/deaf] Invalid conversation_history JSON — starting fresh")

    # ── Step 3: LLM call — STATELESS (temp instance per request) ─────────────
    system_prompt = _load_system_prompt()
    temp_llm = LLMClient(
        api_endpoint=llm_svc.api_endpoint,
        model=llm_svc.model,
        temperature=llm_svc.temperature,
        max_tokens=llm_svc.max_tokens,
        timeout=llm_svc.timeout,
    )
    temp_llm.text_history = list(history)

    logger.info(f"[/deaf] Calling LLM with {len(history)} prior turns")
    llm_response = await asyncio.to_thread(
        temp_llm.get_response,
        user_text,
        system_prompt,
        True,
        None,
        "text",
    )
    response_text: str = llm_response.get("text", "")
    updated_history = list(temp_llm.text_history)

    # ── Step 4: sign tokens (skipped in Chat mode) ─────────────────────────────
    sign_tokens: list = []
    sigml_xml: Optional[str] = None
    if generate_signs:
        logger.info(f"[/deaf] generate_signs=True, generating sign tokens")
        asl_tokens = await asyncio.to_thread(
            temp_llm.get_asl_tokens, response_text
        )
        sign_tokens = _sign_generator.post_process(asl_tokens)
        if not sign_tokens:
            sign_tokens = _sign_generator.text_to_sign_tokens(response_text)
        logger.info(f"[/deaf] {len(sign_tokens)} sign tokens generated: {sign_tokens[:5]}...")
        
        # Generate SiGML XML for JASigning avatar
        try:
            sigml_gen = get_sigml_generator()
            sigml_xml = sigml_gen.tokens_to_sigml(sign_tokens)
            logger.info(f"[/deaf] Generated SiGML XML ({len(sigml_xml) if sigml_xml else 0} chars)")
            if sigml_xml:
                logger.info(f"[/deaf] SiGML preview: {sigml_xml[:100]}...")
        except Exception as e:
            logger.error(f"[/deaf] Error generating SiGML: {e}", exc_info=True)
            sigml_xml = None
    else:
        logger.info("[/deaf] Skipping sign generation (Chat mode)")

    # ── Step 5: optional TTS ──────────────────────────────────────────────────
    audio_b64: Optional[str] = None
    if include_audio:
        audio_data = await tts_svc.async_text_to_speech(response_text)
        audio_b64 = base64.b64encode(audio_data).decode("utf-8")

    # ── Step 6: return ──────────────────────────────────────────────────────────
    return dict(
        response_text=response_text,
        sign_tokens=sign_tokens,
        sigml_xml=sigml_xml,
        audio_base64=audio_b64,
        conversation_history=updated_history,
    )


# ─── SiGML / JASigning Endpoints ──────────────────────────────────────────────


class SiGMLRequest(BaseModel):
    """Request for SiGML generation"""
    tokens: List[str]
    """List of words/tokens to convert to SiGML (e.g. ['HELLO', 'HOW', 'ARE', 'YOU'])"""


class SiGMLResponse(BaseModel):
    """Response with SiGML XML"""
    sigml: str
    """Complete SiGML XML document ready for JASigning avatar"""
    tokens: List[str]
    """Original tokens requested"""
    status: str
    """'success' or 'partial' if some tokens were fingerspelled"""


@router.post(
    "/generate-sigml",
    response_model=SiGMLResponse,
    summary="Generate SiGML XML from Tokens",
    tags=["SiGML / JASigning"],
    description=(
        "Convert ASL tokens into SiGML (Signing Gesture Markup Language) XML.\n\n"
        "The generated SiGML can be rendered by the JASigning 3D avatar player.\n\n"
        "**Example:**\n"
        "```bash\n"
        "curl -X POST http://localhost:8000/generate-sigml \\\n"
        "  -H 'Content-Type: application/json' \\\n"
        "  -d '{\"tokens\": [\"HELLO\", \"HOW\", \"ARE\", \"YOU\"]}'\n"
        "```"
    ),
)
async def generate_sigml(req: SiGMLRequest):
    """
    Generate SiGML XML from list of tokens.
    
    - Tokens in the lexicon use full HamNoSys sign definitions
    - Unknown tokens are fingerspelled using ASL manual alphabet
    """
    if not req.tokens:
        raise HTTPException(status_code=400, detail="No tokens provided")
    
    sigml_gen = get_sigml_generator()
    
    # Generate SiGML
    sigml_xml = sigml_gen.tokens_to_sigml(req.tokens)
    
    # Determine status (check if any tokens were fingerspelled)
    known_count = sum(1 for t in req.tokens if sigml_gen.has_sign(t))
    status = "success" if known_count == len(req.tokens) else "partial"
    
    logger.info(f"[/generate-sigml] Generated SiGML for {len(req.tokens)} tokens ({known_count} known, {len(req.tokens)-known_count} fingerspelled)")
    
    return {
        "sigml": sigml_xml,
        "tokens": req.tokens,
        "status": status
    }


@router.get(
    "/sigml-stats",
    summary="SiGML Lexicon Statistics",
    tags=["SiGML / JASigning"],
)
async def sigml_stats():
    """
    Get statistics about the SiGML lexicon.
    
    Returns the number of signs available in the SiGML lexicon.
    """
    sigml_gen = get_sigml_generator()
    
    return {
        "lexicon_size": sigml_gen.get_lexicon_size(),
        "status": "ready"
    }


class HybridSignRequest(BaseModel):
    """Request for hybrid sign sequence"""
    tokens: List[str]
    """List of tokens to generate signs for"""


class HybridSignResponse(BaseModel):
    """Response with hybrid sign data"""
    signs: List[Dict[str, Any]]
    """List of sign data, each containing method (video/sigml/fingerspell), video_url or sigml, and token"""
    statistics: Dict[str, Any]
    """Statistics about the sign generation (video count, sigml count, fingerspell count)"""


@router.post(
    "/hybrid-sign-sequence",
    response_model=HybridSignResponse,
    summary="Generate Hybrid Sign Sequence",
    tags=["SiGML / JASigning"],
    description=(
        "Intelligently choose between real videos, SiGML, and fingerspelling.\n\n"
        "Priority:\n"
        "1. Real human ASL videos (best comprehension)\n"
        "2. SiGML 3D avatar signs (unlimited vocabulary)\n"
        "3. Fingerspelling (fallback for unknown words)\n\n"
        "**Example:**\n"
        "```bash\n"
        "curl -X POST http://localhost:8000/hybrid-sign-sequence \\\n"
        "  -H 'Content-Type: application/json' \\\n"
        "  -d '{\"tokens\": [\"HELLO\", \"WORLD\"]}'\n"
        "```"
    ),
)
async def hybrid_sign_sequence(req: HybridSignRequest):
    """
    Generate hybrid sign sequence using intelligent fallback system.
    
    Each token gets the best available representation:
    - Video if available in library
    - SiGML if in lexicon
    - Fingerspelling as last resort
    """
    if not req.tokens:
        raise HTTPException(status_code=400, detail="No tokens provided")
    
    hybrid_service = get_hybrid_sign_service()
    
    # Get sign data for each token
    signs = hybrid_service.get_sign_sequence(req.tokens)
    
    # Calculate statistics
    video_count = sum(1 for s in signs if s["method"] == "video")
    sigml_count = sum(1 for s in signs if s["method"] == "sigml")
    fingerspell_count = sum(1 for s in signs if s["method"] == "fingerspell")
    
    logger.info(f"[/hybrid-sign-sequence] Generated {len(signs)} signs: {video_count} video, {sigml_count} SiGML, {fingerspell_count} fingerspelled")
    
    return {
        "signs": signs,
        "statistics": {
            "total": len(signs),
            "video": video_count,
            "sigml": sigml_count,
            "fingerspell": fingerspell_count
        }
    }


@router.get(
    "/sign-coverage",
    summary="Overall Sign Coverage Statistics",
    tags=["SiGML / JASigning"],
)
async def sign_coverage():
    """
    Get comprehensive statistics about sign language coverage.
    
    Returns counts for:
    - ASL video library
    - SiGML lexicon
    - Total coverage
    """
    hybrid_service = get_hybrid_sign_service()
    stats = hybrid_service.get_statistics()
    
    return stats

