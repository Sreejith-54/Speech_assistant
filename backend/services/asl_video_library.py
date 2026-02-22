"""
ASL Video Library Service
=========================
Manages a directory of REAL human ASL sign videos.

Directory layout (relative to backend root):
    asl_video_library/
        HELLO.mp4
        GOODBYE.mp4
        HELLO_variant1.mp4   ← optional variants
        video_index.json     ← auto-generated index
    asl_fingerspelling/
        A.mp4  B.mp4  ...  Z.mp4

Videos are served via FastAPI StaticFiles at /asl-videos/ and
/asl-fingerspelling/. A concatenated sequence endpoint stitches
multiple clips together with FFmpeg.
"""

from __future__ import annotations

import json
import logging
import subprocess
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# ── Paths ──────────────────────────────────────────────────────────────────────

_BACKEND_DIR    = Path(__file__).parent.parent
_LIBRARY_DIR    = _BACKEND_DIR / "asl_video_library"
_FINGER_DIR     = _BACKEND_DIR / "asl_fingerspelling"
_INDEX_FILE     = _LIBRARY_DIR / "video_index.json"

_LIBRARY_DIR.mkdir(parents=True, exist_ok=True)
_FINGER_DIR.mkdir(parents=True, exist_ok=True)


# ── Helpers ────────────────────────────────────────────────────────────────────

def _ffprobe_duration(path: Path) -> float:
    """Return video duration in seconds, or 3.0 if ffprobe unavailable."""
    try:
        result = subprocess.run(
            [
                "ffprobe", "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                str(path),
            ],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if result.returncode == 0:
            return float(result.stdout.strip())
    except Exception:
        pass
    return 3.0


# ── Service ────────────────────────────────────────────────────────────────────

class ASLVideoLibrary:
    """
    Fast lookup and metadata cache for real-human ASL sign videos.

    Index is built once on startup and saved to video_index.json for fast
    re-loading. Call refresh() after adding new files.
    """

    def __init__(self) -> None:
        self._index: Dict[str, Dict[str, Any]] = {}
        self._finger: Dict[str, str] = {}           # letter → absolute path
        self._load()

    # ── Public API ──────────────────────────────────────────────────────────────

    def get_sign_video(self, sign_token: str) -> Optional[Dict[str, Any]]:
        """
        Return metadata dict for *sign_token*, or None if unavailable.

        Metadata keys:
          token, video_path, video_url, duration, has_variants, type, source
        """
        token = sign_token.strip().upper()

        entry = self._index.get(token)
        if entry and entry.get("primary") and Path(entry["primary"]).exists():
            return {
                "token":        token,
                "video_path":   entry["primary"],
                "video_url":    f"/asl-videos/{Path(entry['primary']).name}",
                "duration":     entry.get("duration", 3.0),
                "has_variants": bool(entry.get("variants")),
                "type":         "real_human",
                "source":       "library",
            }

        # Fallback: fingerspell
        if self._can_fingerspell(token):
            logger.info("[ASLLib] Fingerspelling fallback: %s", token)
            return self._fingerspell(token)

        logger.warning("[ASLLib] No video for '%s'", token)
        return None

    def get_sequence(self, tokens: List[str]) -> List[Optional[Dict[str, Any]]]:
        """Return video metadata for each token in *tokens*."""
        return [self.get_sign_video(t) for t in tokens]

    def has_sign(self, token: str) -> bool:
        return token.strip().upper() in self._index

    def list_signs(self) -> List[str]:
        return sorted(self._index.keys())

    def coverage_stats(self) -> Dict[str, Any]:
        total      = len(self._index)
        variants   = sum(1 for v in self._index.values() if v.get("variants"))
        letters    = len(self._finger)
        return {
            "total_signs":         total,
            "signs_with_variants": variants,
            "fingerspelling_letters": letters,
            "can_fingerspell":     letters == 26,
            "coverage_percent":    round(total / 30, 1),  # rough: 3 000 target → 100%
        }

    def refresh(self) -> None:
        """Re-scan the library directory and rebuild the index."""
        self._index  = self._build_index()
        self._finger = self._build_finger()

    # ── Index building ──────────────────────────────────────────────────────────

    def _load(self) -> None:
        """Load index from cache or build fresh."""
        if _INDEX_FILE.exists():
            try:
                raw = json.loads(_INDEX_FILE.read_text(encoding="utf-8"))
                # Validate that the primary paths still exist
                valid = {k: v for k, v in raw.items()
                         if v.get("primary") and Path(v["primary"]).exists()}
                self._index = valid
                logger.info("[ASLLib] Loaded %d signs from index cache", len(self._index))
            except Exception as exc:
                logger.warning("[ASLLib] Cache read failed (%s) — rebuilding", exc)
                self._index = self._build_index()
        else:
            self._index = self._build_index()

        self._finger = self._build_finger()
        logger.info("[ASLLib] %d signs  |  %d fingerspelling letters",
                    len(self._index), len(self._finger))

    def _build_index(self) -> Dict[str, Dict[str, Any]]:
        index: Dict[str, Dict[str, Any]] = {}
        files = list(_LIBRARY_DIR.glob("*.mp4")) + list(_LIBRARY_DIR.glob("*.webm"))
        logger.info("[ASLLib] Scanning %d video files in %s", len(files), _LIBRARY_DIR)

        for vf in files:
            stem  = vf.stem                    # e.g. "HELLO" or "HELLO_variant1"
            parts = stem.split("_", 1)
            token = parts[0].upper()
            variant = len(parts) > 1

            if token not in index:
                index[token] = {"primary": None, "variants": [], "duration": 3.0}

            if variant:
                index[token]["variants"].append(str(vf))
            else:
                dur = _ffprobe_duration(vf)
                index[token]["primary"]  = str(vf)
                index[token]["duration"] = dur

        # Persist
        try:
            _INDEX_FILE.write_text(json.dumps(index, indent=2), encoding="utf-8")
        except Exception as exc:
            logger.warning("[ASLLib] Could not save index: %s", exc)

        logger.info("[ASLLib] Built index: %d unique signs", len(index))
        return index

    def _build_finger(self) -> Dict[str, str]:
        finger: Dict[str, str] = {}
        for letter in "ABCDEFGHIJKLMNOPQRSTUVWXYZ":
            p = _FINGER_DIR / f"{letter}.mp4"
            if p.exists():
                finger[letter] = str(p)
        return finger

    # ── Fingerspelling ──────────────────────────────────────────────────────────

    def _can_fingerspell(self, word: str) -> bool:
        return all(
            not c.isalpha() or c.upper() in self._finger
            for c in word
        )

    def _fingerspell(self, word: str) -> Dict[str, Any]:
        letters = [
            {
                "letter":     c.upper(),
                "video_path": self._finger[c.upper()],
                "video_url":  f"/asl-fingerspelling/{c.upper()}.mp4",
                "duration":   0.8,
            }
            for c in word if c.isalpha() and c.upper() in self._finger
        ]
        return {
            "token":          word.upper(),
            "type":           "fingerspelling",
            "letters":        letters,
            "total_duration": len(letters) * 0.8,
            "source":         "fingerspelling",
        }


# ── Singleton ──────────────────────────────────────────────────────────────────
asl_video_library = ASLVideoLibrary()


def get_video_library() -> ASLVideoLibrary:
    """Get the singleton ASL video library instance."""
    return asl_video_library
