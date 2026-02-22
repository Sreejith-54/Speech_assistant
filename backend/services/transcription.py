"""
Speech-to-Text Transcription Service

Uses Faster Whisper to transcribe speech audio.
"""

import numpy as np # type: ignore
import logging
import io  # For BytesIO
from typing import Dict, Any, List, Optional, Tuple
from faster_whisper import WhisperModel # type: ignore
import time
import torch  # type: ignore

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class WhisperTranscriber:
    """
    Speech-to-Text service using Faster Whisper.
    
    This class handles transcription of speech audio segments.
    """
    
    def __init__(
        self,
        model_size: str = "base",
        device: Optional[str] = None,
        compute_type: Optional[str] = None,
        beam_size: int = 2,
        sample_rate: int = 44100
    ):
        """
        Initialize the transcription service.
        
        Args:
            model_size: Whisper model size (tiny.en, base.en, small.en, medium.en, large)
            device: Device to run model on ('cpu' or 'cuda'), if None will auto-detect
            compute_type: Model computation type (int8, int16, float16, float32), if None will select based on device
            beam_size: Beam size for decoding
            sample_rate: Audio sample rate in Hz
        """
        self.model_size = model_size
        
        # Auto-detect device if not specified
        if device is None:
            self.device: str = "cuda" if torch.cuda.is_available() else "cpu"
        else:
            self.device = device
            
        # Select appropriate compute type based on device if not specified
        if compute_type is None:
            self.compute_type: str = "float16" if self.device == "cuda" else "int8"
        else:
            self.compute_type = compute_type
            
        self.beam_size = beam_size
        self.sample_rate = sample_rate
        self.model: Any = None
        
        # Initialize model
        self._initialize_model()
        
        # State tracking
        self.is_processing = False
        
        logger.info(f"Initialized Whisper Transcriber with model={model_size}, "
                   f"device={self.device}, compute_type={self.compute_type}")
    
    def _initialize_model(self):
        """Initialize Whisper model."""
        try:
            # Load the model
            self.model = WhisperModel(
                self.model_size,  # Pass as positional argument, not keyword
                device=self.device,
                compute_type=self.compute_type
            )
            logger.info(f"Successfully loaded Whisper model: {self.model_size}")
        except Exception as e:
            logger.error(f"Failed to load Whisper model: {e}")
            raise
    
    def transcribe(self, audio: np.ndarray) -> Tuple[str, Dict[str, Any]]:
        """
        Transcribe audio data to text.
        
        Args:
            audio: Audio data as numpy array
            
        Returns:
            Tuple[str, Dict[str, Any]]: 
                - Transcribed text
                - Dictionary with additional information (confidence, language, etc.)
        """
        start_time = time.time()
        self.is_processing = True
        
        try:
            # Handle WAV data (if audio is in uint8 format, it contains WAV headers)
            if audio.dtype == np.uint8:
                # First check the RIFF header to confirm this is WAV data
                header = bytes(audio[:44]) # type: ignore
                if header[:4] == b'RIFF' and header[8:12] == b'WAVE': # type: ignore
                    # Create a file-like object that Whisper can read from
                    audio_file = io.BytesIO(bytes(audio))
                    # The transcribe method expects a file-like object with read method
                    audio = audio_file
                else:
                    # Not a proper WAV header
                    logger.warning("Received audio data with incorrect WAV header")
                    # Attempt to process as raw data
                    audio = audio.astype(np.float32) / np.max(np.abs(audio)) if np.max(np.abs(audio)) > 0 else audio
            else:
                # Normalize audio if it's raw float data
                audio = audio.astype(np.float32) / np.max(np.abs(audio)) if np.max(np.abs(audio)) > 0 else audio
            
            # Transcribe
            segments, info = self.model.transcribe(
                audio, 
                beam_size=self.beam_size,
                language="en",  # Force English language
                vad_filter=True,  # Enable internal VAD to prevent silence hallucinations
                condition_on_previous_text=False  # Prevent looping hallucinations
            )
            
            # Collect all segment texts
            text_segments = [segment.text for segment in segments]
            full_text = " ".join(text_segments).strip()
            
            # Calculate processing time
            processing_time = time.time() - start_time
            logger.info(f"Transcription completed in {processing_time:.2f}s: {full_text[:50]}...") # type: ignore
            
            metadata = {
                "confidence": getattr(info, "avg_logprob", 0),
                "language": getattr(info, "language", "en"),
                "processing_time": processing_time,
                "segments_count": len(text_segments)
            }
            
            return full_text, metadata
            
        except Exception as e:
            logger.error(f"Transcription error: {e}")
            return "", {"error": str(e)}
        finally:
            self.is_processing = False
            
        return "", {"error": "Unknown execution flow"}
    
    def transcribe_streaming(self, audio_generator):
        """
        Stream transcription results from an audio generator.
        
        Args:
            audio_generator: Generator yielding audio chunks
            
        Yields:
            Partial transcription results as they become available
        """
        self.is_processing = True
        
        try:
            # Process the streaming transcription
            segments = self.model.transcribe_with_vad(
                audio_generator,
                language="en"
            )
            
            # Yield each segment as it's transcribed
            for segment in segments:
                yield {
                    "text": segment.text,
                    "start": segment.start,
                    "end": segment.end,
                    "confidence": segment.avg_logprob
                }
                
        except Exception as e:
            logger.error(f"Streaming transcription error: {e}")
            yield {"error": str(e)}
        finally:
            self.is_processing = False

    def transcribe_media_bytes(self, media_bytes: bytes, media_name: str = "media") -> Tuple[str, Dict[str, Any]]:
        """
        Transcribe media bytes (audio/video container such as mp4, wav, mp3) to text.

        Args:
            media_bytes: Raw media bytes
            media_name: Friendly media name for metadata/logging

        Returns:
            Tuple of (transcribed_text, metadata)
        """
        start_time = time.time()
        self.is_processing = True

        try:
            media_stream = io.BytesIO(media_bytes)
            segments, info = self.model.transcribe(
                media_stream,
                beam_size=self.beam_size,
                language="en",
                vad_filter=True,
                condition_on_previous_text=False,
            )

            segment_entries = []
            text_segments = []
            for segment in segments:
                text = (segment.text or "").strip()
                if not text:
                    continue
                text_segments.append(text)
                segment_entries.append({
                    "start": float(getattr(segment, "start", 0.0)),
                    "end": float(getattr(segment, "end", 0.0)),
                    "text": text
                })

            full_text = " ".join(text_segments).strip()

            processing_time = time.time() - start_time
            logger.info(
                "Media transcription completed in %.2fs (%s)",
                processing_time,
                media_name,
            )

            metadata = {
                "confidence": getattr(info, "avg_logprob", 0),
                "language": getattr(info, "language", "en"),
                "processing_time": processing_time,
                "segments_count": len(text_segments),
                "media_name": media_name,
                "media_bytes": len(media_bytes),
                "segments": segment_entries,
            }

            return full_text, metadata

        except Exception as e:
            logger.error(f"Media transcription error ({media_name}): {e}")
            return "", {"error": str(e), "media_name": media_name}
        finally:
            self.is_processing = False
    
    def get_config(self) -> Dict[str, Any]:
        """
        Get the current configuration.
        
        Returns:
            Dict containing the current configuration
        """
        return {
            "model_size": self.model_size,
            "device": self.device,
            "compute_type": self.compute_type,
            "beam_size": self.beam_size,
            "sample_rate": self.sample_rate,
            "is_processing": self.is_processing
        }
