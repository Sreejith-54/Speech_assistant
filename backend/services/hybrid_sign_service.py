"""
Hybrid Sign Language Service
Intelligently chooses between real videos, SiGML generation, and fingerspelling
"""

from typing import List, Dict, Optional
from .sigml_generator import get_sigml_generator
from .asl_video_library import get_video_library


class HybridSignService:
    """
    Service that combines video library and SiGML generation
    Priority: Real videos > SiGML lexicon > Fingerspelling
    """
    
    def __init__(self):
        self.video_library = get_video_library()
        self.sigml_generator = get_sigml_generator()
    
    def get_sign_data(self, token: str) -> Dict:
        """
        Get sign data for a single token using hybrid approach
        
        Args:
            token: Word/sign to generate
        
        Returns:
            Dict with keys:
                - method: "video" | "sigml" | "fingerspell"
                - video_url: str (if method is video)
                - sigml: str (if method is sigml or fingerspell)
                - token: original token
        """
        token_upper = token.upper()
        
        # Priority 1: Check if real video exists
        if self.video_library.has_video(token_upper):
            video_path = self.video_library.get_video_path(token_upper)
            return {
                "method": "video",
                "video_url": video_path,
                "token": token,
                "status": "success"
            }
        
        # Priority 2: Check if SiGML lexicon has this sign
        if self.sigml_generator.has_sign(token_upper):
            sigml = self.sigml_generator.tokens_to_sigml([token_upper])
            return {
                "method": "sigml",
                "sigml": sigml,
                "token": token,
                "status": "success"
            }
        
        # Priority 3: Fallback to fingerspelling
        sigml = self.sigml_generator.tokens_to_sigml([token_upper])
        return {
            "method": "fingerspell",
            "sigml": sigml,
            "token": token,
            "status": "fallback"
        }
    
    def get_sign_sequence(self, tokens: List[str]) -> List[Dict]:
        """
        Get sign data for a sequence of tokens
        
        Args:
            tokens: List of words/tokens
        
        Returns:
            List of sign data dicts (one per token)
        """
        return [self.get_sign_data(token) for token in tokens]
    
    def get_combined_sigml(self, tokens: List[str]) -> str:
        """
        Generate a single SiGML document for all tokens
        Uses SiGML for all tokens (ignoring video option)
        Useful for generating complete avatar sequences
        
        Args:
            tokens: List of words/tokens
        
        Returns:
            Complete SiGML XML document
        """
        return self.sigml_generator.tokens_to_sigml(tokens)
    
    def get_statistics(self) -> Dict:
        """Get statistics about available signs"""
        return {
            "video_library_size": self.video_library.get_library_size(),
            "sigml_lexicon_size": self.sigml_generator.get_lexicon_size(),
            "total_coverage": self.video_library.get_library_size() + 
                            self.sigml_generator.get_lexicon_size(),
            "available_videos": self.video_library.get_available_signs()
        }


# Global instance
_hybrid_service = None

def get_hybrid_sign_service() -> HybridSignService:
    """Get or create global hybrid sign service instance"""
    global _hybrid_service
    if _hybrid_service is None:
        _hybrid_service = HybridSignService()
    return _hybrid_service
