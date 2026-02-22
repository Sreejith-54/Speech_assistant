"""
SiGML (Signing Gesture Markup Language) Generator Service
Converts English text tokens into SiGML XML format using HamNoSys notation
For use with JASigning 3D avatar rendering
"""

import json
import os
from pathlib import Path
from typing import List, Dict, Optional


class SiGMLGenerator:
    """Generate SiGML XML from English text tokens"""
    
    def __init__(self):
        self.lexicon_dir = Path("sigml_lexicon")
        self.lexicon_dir.mkdir(exist_ok=True)
        self.lexicon_file = self.lexicon_dir / "asl_lexicon.json"
        self.lexicon = self._load_or_create_lexicon()
    
    def _load_or_create_lexicon(self) -> Dict[str, str]:
        """Load existing lexicon or create default one"""
        if self.lexicon_file.exists():
            with open(self.lexicon_file, 'r', encoding='utf-8') as f:
                return json.load(f)
        else:
            lexicon = self._create_default_lexicon()
            self._save_lexicon(lexicon)
            return lexicon
    
    def _save_lexicon(self, lexicon: Dict[str, str]):
        """Save lexicon to JSON file"""
        with open(self.lexicon_file, 'w', encoding='utf-8') as f:
            json.dump(lexicon, f, indent=2, ensure_ascii=False)
    
    def _create_default_lexicon(self) -> Dict[str, str]:
        """Create a default ASL lexicon with common signs using HamNoSys notation"""
        return {
            # Greetings & Politeness
            "HELLO": self._create_sigml_sign(
                handshape="flat", 
                location="forehead", 
                movement="away-salute",
                description="Hello greeting sign"
            ),
            "GOODBYE": self._create_sigml_sign(
                handshape="flat", 
                location="chest", 
                movement="wave",
                description="Goodbye wave"
            ),
            "PLEASE": self._create_sigml_sign(
                handshape="flat", 
                location="chest", 
                movement="circular",
                description="Please - circular motion on chest"
            ),
            "THANK": self._create_sigml_sign(
                handshape="flat", 
                location="chin", 
                movement="forward-down",
                description="Thank you - hand from chin outward"
            ),
            "SORRY": self._create_sigml_sign(
                handshape="fist", 
                location="chest", 
                movement="circular",
                description="Sorry - circular motion on chest"
            ),
            
            # Question words
            "WHAT": self._create_sigml_sign(
                handshape="5", 
                location="neutral", 
                movement="wiggle-fingers",
                description="What - wiggle fingers"
            ),
            "WHERE": self._create_sigml_sign(
                handshape="1", 
                location="neutral", 
                movement="side-to-side",
                description="Where - point finger side to side"
            ),
            "WHEN": self._create_sigml_sign(
                handshape="1", 
                location="neutral", 
                movement="circular-clock",
                description="When - circular motion like clock"
            ),
            "WHO": self._create_sigml_sign(
                handshape="1", 
                location="chin", 
                movement="circular-small",
                description="Who - circular motion near chin"
            ),
            "WHY": self._create_sigml_sign(
                handshape="y", 
                location="forehead", 
                movement="wiggle",
                description="Why - Y handshape at forehead"
            ),
            "HOW": self._create_sigml_sign(
                handshape="curved", 
                location="neutral", 
                movement="rotate-outward",
                description="How - curved hands rotate"
            ),
            
            # Common verbs
            "GO": self._create_sigml_sign(
                handshape="1", 
                location="neutral", 
                movement="forward",
                description="Go - point forward"
            ),
            "COME": self._create_sigml_sign(
                handshape="1", 
                location="neutral", 
                movement="toward-body",
                description="Come - point toward body"
            ),
            "HELP": self._create_sigml_sign(
                handshape="flat", 
                location="chest", 
                movement="upward",
                description="Help - one hand lifts other"
            ),
            "WANT": self._create_sigml_sign(
                handshape="5-claw", 
                location="neutral", 
                movement="pull-toward",
                description="Want - claw hands pull toward body"
            ),
            "NEED": self._create_sigml_sign(
                handshape="x", 
                location="neutral", 
                movement="downward",
                description="Need - X handshape moves down"
            ),
            "KNOW": self._create_sigml_sign(
                handshape="flat", 
                location="forehead", 
                movement="tap",
                description="Know - tap forehead"
            ),
            "UNDERSTAND": self._create_sigml_sign(
                handshape="1", 
                location="forehead", 
                movement="flick-up",
                description="Understand - finger flicks up from forehead"
            ),
            
            # Yes/No and basic responses
            "YES": self._create_sigml_sign(
                handshape="fist", 
                location="neutral", 
                movement="nod",
                description="Yes - fist nods like head"
            ),
            "NO": self._create_sigml_sign(
                handshape="3", 
                location="neutral", 
                movement="snap-close",
                description="No - fingers snap together"
            ),
            
            # Common adjectives
            "GOOD": self._create_sigml_sign(
                handshape="flat", 
                location="chin", 
                movement="forward-down",
                description="Good - hand from mouth outward"
            ),
            "BAD": self._create_sigml_sign(
                handshape="flat", 
                location="chin", 
                movement="twist-down",
                description="Bad - hand from mouth twists down"
            ),
            "HAPPY": self._create_sigml_sign(
                handshape="flat", 
                location="chest", 
                movement="circular-up",
                description="Happy - hand circles upward on chest"
            ),
            "SAD": self._create_sigml_sign(
                handshape="5", 
                location="face", 
                movement="downward",
                description="Sad - hands move down face"
            ),
            
            # Time-related
            "NOW": self._create_sigml_sign(
                handshape="y", 
                location="neutral", 
                movement="downward-quick",
                description="Now - Y hands drop quickly"
            ),
            "TODAY": self._create_sigml_sign(
                handshape="y", 
                location="neutral", 
                movement="downward-twice",
                description="Today - Y hands drop twice"
            ),
            "TOMORROW": self._create_sigml_sign(
                handshape="a", 
                location="cheek", 
                movement="forward",
                description="Tomorrow - A handshape from cheek forward"
            ),
            "YESTERDAY": self._create_sigml_sign(
                handshape="a", 
                location="cheek", 
                movement="backward",
                description="Yesterday - A handshape from cheek backward"
            ),
            
            # Common nouns
            "WATER": self._create_sigml_sign(
                handshape="w", 
                location="chin", 
                movement="tap",
                description="Water - W handshape taps chin"
            ),
            "FOOD": self._create_sigml_sign(
                handshape="flat-o", 
                location="mouth", 
                movement="tap",
                description="Food - fingers to mouth"
            ),
            "HOME": self._create_sigml_sign(
                handshape="flat-o", 
                location="cheek", 
                movement="tap-twice",
                description="Home - fingers tap cheek area"
            ),
        }
    
    def _create_sigml_sign(self, handshape: str, location: str, movement: str, description: str = "") -> str:
        """
        Create a SiGML sign definition using HamNoSys notation
        
        Args:
            handshape: HamNoSys handshape (e.g., "flat", "fist", "1", "5", etc.)
            location: Body location (e.g., "forehead", "chest", "neutral")
            movement: Movement type (e.g., "forward", "circular", "tap")
            description: Human-readable description
        
        Returns:
            SiGML XML snippet for this sign
        """
        # Map simple handshape names to HamNoSys notation
        hamnosys_handshapes = {
            "flat": "hamflathand",
            "fist": "hamfist",
            "1": "hamfinger2",
            "5": "hamfinger5",
            "w": "hamfinger23",
            "y": "hampinky",
            "3": "hamfinger23",
            "x": "hamfinger2345",
            "5-claw": "hamfinger5spread",
            "curved": "hamfingerbendmod",
            "a": "hamfist",
            "flat-o": "hamflathand"
        }
        
        # Map locations to HamNoSys notation
        hamnosys_locations = {
            "forehead": "hamloc_forehead",
            "chin": "hamloc_chin",
            "chest": "hamloc_chest",
            "neutral": "hamloc_neutral",
            "cheek": "hamloc_cheek",
            "face": "hamloc_face",
            "mouth": "hamloc_mouth"
        }
        
        # Map movements to HamNoSys notation
        hamnosys_movements = {
            "forward": "hammoveforward",
            "downward": "hammovedown",
            "upward": "hammoveup",
            "circular": "hammovecircle",
            "tap": "hammoveTap",
            "wave": "hammovewave",
            "wiggle": "hammovewiggle",
            "side-to-side": "hammoveLR",
            "away-salute": "hammoveforward",
            "forward-down": "hammoveDL",
            "nod": "hammovedown",
            "snap-close": "hammoveclose",
            "twist-down": "hammoverotate",
            "circular-up": "hammovecircleup",
            "downward-quick": "hammovedown",
            "downward-twice": "hammovedown",
            "backward": "hammoveback",
            "tap-twice": "hammoveTap",
            "circular-small": "hammovecircle",
            "rotate-outward": "hammoverotate",
            "toward-body": "hammoveback",
            "pull-toward": "hammoveback",
            "flick-up": "hammoveup",
            "wiggle-fingers": "hammovewiggle",
            "circular-clock": "hammovecircle"
        }
        
        hs = hamnosys_handshapes.get(handshape, "hamflathand")
        loc = hamnosys_locations.get(location, "hamloc_neutral")
        mov = hamnosys_movements.get(movement, "hammoveforward")
        
        sigml = f'''<hamgestural_sign gloss="{description}">
    <sign_manual>
        <handconfig handshape="{hs}"/>
        <location location="{loc}"/>
        <rpt_motion>
            <directedmotion direction="{mov}"/>
        </rpt_motion>
    </sign_manual>
</hamgestural_sign>'''
        
        return sigml
    
    def tokens_to_sigml(self, tokens: List[str]) -> str:
        """
        Convert a list of tokens to a complete SiGML document
        
        Args:
            tokens: List of words/tokens to convert (e.g., ["HELLO", "HOW", "ARE", "YOU"])
        
        Returns:
            Complete SiGML XML document
        """
        signs = []
        
        for token in tokens:
            token_upper = token.upper()
            
            if token_upper in self.lexicon:
                # Use lexicon sign
                signs.append(self.lexicon[token_upper])
            else:
                # Fallback to fingerspelling
                signs.append(self._fingerspell_word(token_upper))
        
        # Wrap in SiGML document structure
        sigml_doc = f'''<?xml version="1.0" encoding="UTF-8"?>
<sigml>
    <hamgestural_sign gloss="SEQUENCE">
        {chr(10).join(signs)}
    </hamgestural_sign>
</sigml>'''
        
        return sigml_doc
    
    def _fingerspell_word(self, word: str) -> str:
        """Generate fingerspelling SiGML for a word"""
        letters = []
        for char in word:
            if char.isalpha():
                letters.append(self._fingerspell_letter(char.upper()))
        
        return f'''<hamgestural_sign gloss="FINGERSPELL-{word}">
    {chr(10).join(letters)}
</hamgestural_sign>'''
    
    def _fingerspell_letter(self, letter: str) -> str:
        """
        Generate SiGML for a fingerspelled letter (A-Z)
        Using ASL manual alphabet
        """
        # ASL alphabet handshapes (simplified mapping)
        asl_alphabet = {
            'A': 'hamfist',
            'B': 'hamflathand',
            'C': 'hamceeall',
            'D': 'hamfinger2',
            'E': 'hamfingerbendmod',
            'F': 'hamfinger2345',
            'G': 'hamfinger2',
            'H': 'hamfinger23',
            'I': 'hampinky',
            'J': 'hampinky',
            'K': 'hamfinger23',
            'L': 'hamfinger2',
            'M': 'hamflathand',
            'N': 'hamflathand',
            'O': 'hamflathand',
            'P': 'hamfinger2',
            'Q': 'hamfinger2',
            'R': 'hamfinger23cross',
            'S': 'hamfist',
            'T': 'hamfist',
            'U': 'hamfinger23',
            'V': 'hamfinger23',
            'W': 'hamfinger234',
            'X': 'hamfinger2',
            'Y': 'hampinkymod',
            'Z': 'hamfinger2'
        }
        
        handshape = asl_alphabet.get(letter, 'hamflathand')
        
        return f'''<sign_manual>
    <handconfig handshape="{handshape}"/>
    <location location="hamloc_neutral"/>
</sign_manual>'''
    
    def add_sign_to_lexicon(self, word: str, handshape: str, location: str, 
                           movement: str, description: str = "") -> bool:
        """
        Add a new sign to the lexicon
        
        Args:
            word: The English word
            handshape, location, movement: Sign parameters
            description: Optional description
        
        Returns:
            True if added successfully
        """
        sigml = self._create_sigml_sign(handshape, location, movement, description)
        self.lexicon[word.upper()] = sigml
        self._save_lexicon(self.lexicon)
        return True
    
    def get_lexicon_size(self) -> int:
        """Return number of signs in lexicon"""
        return len(self.lexicon)
    
    def has_sign(self, word: str) -> bool:
        """Check if word exists in lexicon"""
        return word.upper() in self.lexicon


# Global instance
_sigml_generator = None

def get_sigml_generator() -> SiGMLGenerator:
    """Get or create the global SiGML generator instance"""
    global _sigml_generator
    if _sigml_generator is None:
        _sigml_generator = SiGMLGenerator()
    return _sigml_generator
