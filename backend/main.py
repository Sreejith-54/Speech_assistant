"""
Vocalis Backend Server

FastAPI application entry point.
"""

import logging
import uvicorn # type: ignore
from fastapi import FastAPI, WebSocket, Depends, HTTPException # type: ignore
from fastapi.middleware.cors import CORSMiddleware # type: ignore
from fastapi.staticfiles import StaticFiles # type: ignore
from contextlib import asynccontextmanager

# Import configuration
from . import config # type: ignore

# Import services
from .services.transcription import WhisperTranscriber # type: ignore
from .services.llm import LLMClient # type: ignore
from .services.tts import TTSClient # type: ignore
from .services.vision import vision_service # type: ignore

# Import routes
from .routes.websocket import websocket_endpoint # type: ignore
from .routes.api_visual import router as visual_router, init_visual_router  # type: ignore
from .routes.api_deaf import router as deaf_router, init_deaf_router  # type: ignore

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Global service instances
transcription_service = None
llm_service = None
tts_service = None
# Vision service is a singleton already initialized in its module

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Startup and shutdown events for the FastAPI application.
    """
    # Load configuration
    cfg = config.get_config()
    
    # Initialize services on startup
    logger.info("Initializing services...")
    
    global transcription_service, llm_service, tts_service
    
    # Initialize transcription service
    transcription_service = WhisperTranscriber(
        model_size=cfg["whisper_model"],
        sample_rate=cfg["audio_sample_rate"]
    )
    
    # Initialize LLM service
    llm_service = LLMClient(
        api_endpoint=cfg["llm_api_endpoint"]
    )
    
    # Initialize TTS service
    tts_service = TTSClient(
        api_endpoint=cfg["tts_api_endpoint"],
        model=cfg["tts_model"],
        voice=cfg["tts_voice"],
        output_format=cfg["tts_format"]
    )
    
    # Initialize vision service in background (takes seconds/minutes depending on internet cache)
    logger.info("Initializing vision service in the background...")
    import asyncio
    asyncio.create_task(asyncio.to_thread(vision_service.initialize))
    
    # Wire REST API service instances
    init_visual_router(transcription_service, llm_service, tts_service)
    init_deaf_router(transcription_service, llm_service, tts_service)
    logger.info("REST endpoints registered: POST /visual, POST /deaf")

    logger.info("All services initialized successfully")
    
    yield
    
    # Cleanup on shutdown
    logger.info("Shutting down services...")
    
    # No specific cleanup needed for these services,
    # but we could add resource release code here if needed (maybe in a future release lex 31/03/25)
    
    logger.info("Shutdown complete")

# Create FastAPI application
app = FastAPI(
    title="Vocalis Accessibility API",
    description=(
        "AI-powered accessibility API for visually challenged and deaf users.\n\n"
        "## REST Endpoints\n"
        "- **POST /visual** — Voice/text → TTS audio (no sign language)\n"
        "- **POST /deaf** — Text/voice → Text + ASL sign tokens\n\n"
        "## WebSocket\n"
        "- **ws://host/ws** — Legacy real-time endpoint (still active)\n\n"
        "Both REST endpoints are stateless — pass `conversation_history` for multi-turn."
    ),
    version="2.0.0",
    lifespan=lifespan,
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Service dependency functions
def get_transcription_service():
    return transcription_service

def get_llm_service():
    return llm_service

def get_tts_service():
    return tts_service

# API routes
@app.get("/")
async def root():
    """Root endpoint for health check."""
    return {"status": "ok", "message": "Vocalis backend is running"}

@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "ok",
        "services": {
            "transcription": transcription_service is not None,
            "llm": llm_service is not None,
            "tts": tts_service is not None,
            "vision": vision_service.is_ready()
        },
        "config": {
            "whisper_model": config.WHISPER_MODEL,
            "tts_voice": config.TTS_VOICE,
            "websocket_port": config.WEBSOCKET_PORT
        }
    }

@app.get("/config")
async def get_full_config():
    """Get full configuration."""
    if not all([transcription_service, llm_service, tts_service]) or not vision_service.is_ready():
        raise HTTPException(status_code=503, detail="Services not initialized")
    
    return {
        "transcription": transcription_service.get_config() if transcription_service else {},
        "llm": llm_service.get_config() if llm_service else {},
        "tts": tts_service.get_config() if tts_service else {},
        "system": config.get_config()
    }

# REST API routes (stateless, usable by external applications)
app.include_router(visual_router)
app.include_router(deaf_router)

# WebSocket route (legacy — kept for backward compatibility)
@app.websocket("/ws")
async def websocket_route(websocket: WebSocket):
    """WebSocket endpoint for bidirectional audio streaming."""
    await websocket_endpoint(
        websocket, 
        transcription_service, 
        llm_service, 
        tts_service
    )

# Run server directly if executed as script
if __name__ == "__main__":
    uvicorn.run(
        "backend.main:app",
        host=config.WEBSOCKET_HOST,
        port=config.WEBSOCKET_PORT,
        reload=True
    )
