"""
Vision service for image processing using SmolVLM

Handles loading and initializing the vision model for image understanding.
"""

import logging
from typing import Optional, Any
from transformers import AutoProcessor, AutoModelForImageTextToText # type: ignore

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class VisionService:
    """
    Service for processing images with vision models.
    Currently uses SmolVLM-256M-Instruct for lightweight image understanding.
    """
    
    def __init__(self):
        """Initialize the service with empty model references."""
        self.processor: Any = None
        self.model: Any = None
        self.device: Any = None
        self.initialized: bool = False
        self.model_name = "HuggingFaceTB/SmolVLM-256M-Instruct"
        self.default_prompt = "Describe this image in detail. Include information about objects, people, scenes, text, and any notable elements."
    
    def initialize(self):
        """
        Initialize the model, downloading it if necessary.
        This will be called on server startup.
        
        Returns:
            bool: Whether initialization was successful
        """
        if self.initialized:
            logger.info("Vision model already initialized")
            return True
        
        try:
            import torch # type: ignore
            
            # Determine device (use CUDA if available)
            self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
            logger.info(f"Using device for vision model: {self.device}")
            
            logger.info(f"Loading vision model {self.model_name} (this may take a while on first run)...")
            
            # These calls will trigger the download if the model isn't cached locally
            self.processor = AutoProcessor.from_pretrained(self.model_name)
            self.model = AutoModelForImageTextToText.from_pretrained(self.model_name)
            
            # Move model to GPU if available
            if self.model is not None:
                self.model = self.model.to(self.device) # type: ignore
            
            self.initialized = True
            logger.info(f"Vision model loaded successfully on {self.device}")
            return True
        except Exception as e:
            logger.error(f"Error loading vision model: {e}")
            return False
    
    def process_image(self, image_base64: str, prompt: Optional[str] = None):
        """
        Process an image with SmolVLM and return a description.
        
        Args:
            image_base64: Base64-encoded image data
            prompt: Prompt to guide image description (uses default if None)
            
        Returns:
            str: Image description
        """
        if not self.is_ready():
            raise RuntimeError("Vision model not initialized")
            
        try:
            # Decode base64 image
            import base64
            from io import BytesIO
            from PIL import Image # type: ignore
            import torch # type: ignore
            
            # Use default prompt if none provided
            if prompt is None:
                prompt = self.default_prompt
            
            # Format the prompt to include the <image> token
            formatted_prompt = f"User uploaded this image: <image>\n{prompt}"
            
            # Convert base64 to image
            image_data = base64.b64decode(image_base64)
            image = Image.open(BytesIO(image_data)).convert('RGB')
            
            # Prepare inputs for the model with the correct token format
            inputs = self.processor(text=[formatted_prompt], images=[image], return_tensors="pt")
            
            # Move inputs to the same device as the model
            inputs = {k: v.to(self.device) for k, v in inputs.items()}
            
            # Generate description
            with torch.no_grad():
                output_ids = self.model.generate(
                    **inputs,
                    max_new_tokens=256,
                    do_sample=False
                )
            
            # Decode the output
            description = self.processor.batch_decode(output_ids, skip_special_tokens=True)[0]
            
            return description.strip()
            
        except Exception as e:
            logger.error(f"Error processing image with vision model: {e}")
            return f"Error analyzing image: {str(e)}"
    
    def is_ready(self):
        """
        Check if the model is initialized and ready.
        
        Returns:
            bool: Whether the model is ready for use
        """
        return self.initialized

# Create singleton instance
vision_service = VisionService()
