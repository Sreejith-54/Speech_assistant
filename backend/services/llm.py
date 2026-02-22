"""
LLM Service

Handles communication with the local LLM API endpoint.
"""

import json
import requests # type: ignore
import logging
import os
import time
from typing import Dict, Any, List, Optional
try:
    from openai import OpenAI # type: ignore
except ImportError:
    OpenAI = None

try:
    from groq import Groq # type: ignore
except ImportError:
    Groq = None

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class LLMClient:
    """
    Client for communicating with a local LLM API.
    
    This class handles requests to a locally hosted LLM API that follows
    the OpenAI API format.
    """
    
    def __init__(
        self,
        api_endpoint: str = "http://127.0.0.1:1234/v1/chat/completions",
        model: str = "default",
        temperature: float = 0.7,
        max_tokens: int = 2048,
        timeout: int = 60
    ):
        """
        Initialize the LLM client.
        
        Args:
            api_endpoint: URL of the local LLM API
            model: Model name to use (or 'default' for API default)
            temperature: Sampling temperature (0.0 to 1.0)
            max_tokens: Maximum tokens to generate
            timeout: Request timeout in seconds
        """
        self.api_endpoint = api_endpoint
        self.model = model
        self.temperature = temperature
        self.max_tokens = max_tokens
        self.timeout = timeout
        
        # Determine if we should use Groq or OpenAI
        self.groq_api_key = os.environ.get("GROQ_API_KEY", "")
        self.openai_api_key = os.environ.get("OPENAI_API_KEY", "")
        
        self.use_groq = bool(self.groq_api_key) and Groq is not None
        self.use_openai = bool(self.openai_api_key) and OpenAI is not None
        
        if self.use_groq:
            self.client = Groq(api_key=self.groq_api_key) # type: ignore
            if self.model == "default":
                self.model = "llama-3.1-8b-instant" # Fast model for Groq
            logger.info(f"Initialized LLM Client with Groq API (model: {self.model})")
        elif self.use_openai:
            self.client = OpenAI(api_key=self.openai_api_key) # type: ignore
            if self.model == "default":
                self.model = "gpt-4o-mini" # Default fast model for voice
            logger.info(f"Initialized LLM Client with OpenAI API (model: {self.model})")
        else:
            self.client = None
            logger.info(f"Initialized LLM Client with endpoint={api_endpoint}")
        
        # State tracking
        self.is_processing = False
        self.voice_history: List[Dict[str, Any]] = []
        self.text_history: List[Dict[str, Any]] = []
        
        logger.info(f"Initialized LLM Client with endpoint={api_endpoint}")
        
    def add_to_history(self, role: str, content: str, mode: str = "voice") -> None:
        """
        Add a message to the conversation history.
        
        Args:
            role: Message role ('system', 'user', or 'assistant')
            content: Message content
            mode: 'voice' or 'text'
        """
        target_history = self.text_history if mode == "text" else self.voice_history
        target_history.append({
            "role": role,
            "content": content
        })
        
        # Allow deeper history for models with large context windows
        if len(target_history) > 50:
            # Always keep the system message if it exists
            if target_history[0]["role"] == "system":
                if mode == "text":
                    self.text_history = [self.text_history[0]] + self.text_history[-49:] # type: ignore
                else:
                    self.voice_history = [self.voice_history[0]] + self.voice_history[-49:] # type: ignore
            else:
                if mode == "text":
                    self.text_history = self.text_history[-50:] # type: ignore
                else:
                    self.voice_history = self.voice_history[-50:] # type: ignore
    
    def get_response(self, user_input: str, system_prompt: Optional[str] = None, 
                    add_to_history: bool = True, temperature: Optional[float] = None,
                    mode: str = "voice") -> Dict[str, Any]:
        """
        Get a response from the LLM for the given user input.
        
        Args:
            user_input: User's text input
            system_prompt: Optional system prompt to set context
            add_to_history: Whether to add this exchange to conversation history
            temperature: Optional temperature override (0.0 to 1.0)
            mode: 'voice' or 'text'
            
        Returns:
            Dictionary containing the LLM response and metadata
        """
        self.is_processing = True
        start_time = time.time()
        
        try:
            # Prepare messages
            messages = []
            
            # Add system prompt if provided and not already in history
            target_history = self.text_history if mode == "text" else self.voice_history
            if system_prompt:
                messages.append({
                    "role": "system",
                    "content": system_prompt
                })
            
            # Add user input to history if it's not empty and add_to_history is True
            if user_input.strip() and add_to_history:
                self.add_to_history("user", user_input, mode)
            
            # Add conversation history (which now includes the user input if add_to_history=True)
            messages.extend(self.text_history if mode == "text" else self.voice_history)
            
            # Only add user input directly if not adding to history
            # This ensures special cases (greetings/followups) work while preventing duplication for normal speech
            if user_input.strip() and not add_to_history:
                messages.append({
                    "role": "user",
                    "content": user_input
                })
            
            # Prepare request payload with custom temperature if provided
            payload = {
                "model": self.model if self.model != "default" else None,
                "messages": messages,
                "temperature": temperature if temperature is not None else self.temperature,
                "max_tokens": self.max_tokens
            }
            
            # Remove None values
            payload = {k: v for k, v in payload.items() if v is not None}
            
            # Log the full payload (truncated for readability)
            payload_str = json.dumps(payload)
            logger.info(f"Sending request to LLM API with {len(messages)} messages")
            
            # Add more detailed logging to help debug message duplication
            message_roles = [msg["role"] for msg in messages]
            user_message_count = message_roles.count("user")
            logger.info(f"Message roles: {message_roles}, user messages: {user_message_count}")
            
            if len(payload_str) > 500:
                logger.debug(f"Payload (truncated): {payload_str[:500]}...") # type: ignore
            else:
                logger.debug(f"Payload: {payload_str}")
            
            assistant_message = ""
            finish_reason = None
            model_used = "unknown"

            if self.use_groq and self.client:
                # Use official Groq python client
                response = self.client.chat.completions.create(
                    model=self.model,
                    messages=messages, # type: ignore
                    temperature=temperature if temperature is not None else self.temperature,
                    max_tokens=self.max_tokens,
                )
                
                # Extract text from Groq response
                assistant_message = response.choices[0].message.content or ""
                finish_reason = response.choices[0].finish_reason
                model_used = response.model
            elif self.use_openai and self.client:
                # Use official OpenAI python client
                response = self.client.chat.completions.create(
                    model=self.model,
                    messages=messages, # type: ignore
                    temperature=temperature if temperature is not None else self.temperature,
                    max_tokens=self.max_tokens,
                )
                
                # Extract text from OpenAI response
                assistant_message = response.choices[0].message.content or ""
                finish_reason = response.choices[0].finish_reason
                model_used = response.model
            else:
                # Send request to local LLM API
                response = requests.post(
                    self.api_endpoint,
                    json=payload,
                    timeout=self.timeout
                )
                
                # Check if request was successful
                response.raise_for_status()
                
                # Parse response
                result = response.json()
                
                # Extract assistant response
                assistant_message = result.get("choices", [{}])[0].get("message", {}).get("content", "")
                finish_reason = result.get("choices", [{}])[0].get("finish_reason")
                model_used = result.get("model", "unknown")
            
            # Add assistant response to history (only if we added the user input)
            if assistant_message and add_to_history:
                self.add_to_history("assistant", assistant_message, mode)
            
            # Calculate processing time
            end_time = time.time()
            processing_time = end_time - start_time
            
            logger.info(f"Received response from LLM API after {processing_time:.2f}s")
            
            return {
                "text": assistant_message,
                "processing_time": processing_time,
                "finish_reason": finish_reason,
                "model": model_used
            }
            
        except requests.RequestException as e:
            logger.error(f"LLM API request error: {e}")
            error_response = f"I'm sorry, I encountered a problem connecting to my language model. {str(e)}"
            
            # Add the error to history if requested and clear history on 400 errors
            # to prevent the same error from happening repeatedly
            if add_to_history:
                self.add_to_history("assistant", error_response, mode)
                
                # If we get a 400 Bad Request, the context might be corrupt
                if isinstance(e, requests.exceptions.HTTPError) and e.response.status_code == 400:
                    logger.warning("Received 400 error, clearing conversation history to recover")
                    # Keep only system prompt if it exists
                    self.clear_history(keep_system_prompt=True, mode=mode)
            
            return {
                "text": error_response,
                "error": str(e)
            }
        except Exception as e:
            logger.error(f"LLM processing error: {e}")
            error_response = "I'm sorry, I encountered an unexpected error. Please try again."
            self.add_to_history("assistant", error_response, mode)
            return {
                "text": error_response,
                "error": str(e)
            }
        finally:
            self.is_processing = False
            
        return {"text": "", "error": "Unknown execution flow"}

    def get_asl_tokens(self, text: str) -> List[str]:
        """
        Convert English text into simplified ASL-style tokens using a
        separate lightweight LLM call.

        Args:
            text: Input English sentence

        Returns:
            List of uppercase ASL-style tokens
        """
        if not text or not text.strip():
            return []

        asl_prompt = (
            "You are an ASL grammar converter. "
            "Convert English sentence to simplified ASL structure. "
            "Return only uppercase tokens separated by space."
        )

        try:
            asl_response = self.get_response(
                user_input=text,
                system_prompt=asl_prompt,
                add_to_history=False,
                temperature=0.2,
            )

            if "error" in asl_response:
                return []

            asl_text = (asl_response.get("text") or "").replace("\n", " ").strip()
            if not asl_text:
                return []

            return [token.strip().upper() for token in asl_text.split() if token.strip()]
        except Exception as e:
            logger.warning(f"ASL token conversion failed: {e}")
            return []
    
    def clear_history(self, keep_system_prompt: bool = True, mode: Optional[str] = None) -> None:
        """
        Clear conversation history.
        
        Args:
            keep_system_prompt: Whether to keep the system prompt if it exists
            mode: 'voice', 'text', or None for both
        """
        modes_to_clear = [mode] if mode else ["voice", "text"]
        for m in modes_to_clear:
            target_history = self.text_history if m == "text" else self.voice_history
            if keep_system_prompt and target_history and target_history[0]["role"] == "system":
                if m == "text":
                    self.text_history = [self.text_history[0]]
                else:
                    self.voice_history = [self.voice_history[0]]
            else:
                if m == "text":
                    self.text_history = []
                else:
                    self.voice_history = []
    
    def get_config(self) -> Dict[str, Any]:
        """
        Get the current configuration.
        
        Returns:
            Dict containing the current configuration
        """
        return {
            "api_endpoint": self.api_endpoint if not self.use_openai else "OpenAI",
            "model": self.model,
            "temperature": self.temperature,
            "max_tokens": self.max_tokens,
            "timeout": self.timeout,
            "is_processing": self.is_processing,
            "history_length": len(self.voice_history) + len(self.text_history),
            "using_openai": self.use_openai
        }
