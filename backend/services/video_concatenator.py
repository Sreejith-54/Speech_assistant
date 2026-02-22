"""
Video Concatenation Service
============================
Stitches multiple ASL sign-video clips into a single MP4
using FFmpeg concat demuxer (fast, no re-encode) or xfade filter
(crossfade transitions, slower but smoother).

Concatenated files are cached in  backend/concatenated_sequences/
and served as static files at /asl-sequences/.
"""

from __future__ import annotations

import hashlib
import logging
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import List, Optional

logger = logging.getLogger(__name__)

# ── Cache directory ────────────────────────────────────────────────────────────

_BACKEND_DIR  = Path(__file__).parent.parent
_CACHE_DIR    = _BACKEND_DIR / "concatenated_sequences"
_CACHE_DIR.mkdir(parents=True, exist_ok=True)


# ── Helpers ────────────────────────────────────────────────────────────────────

def _has_ffmpeg() -> bool:
    return shutil.which("ffmpeg") is not None


def _cache_key(paths: List[str]) -> str:
    joined = "|".join(paths)
    return hashlib.md5(joined.encode()).hexdigest()[:12]


# ── Service ────────────────────────────────────────────────────────────────────

class VideoConcat:
    """
    Concatenate ASL video clips with optional crossfade transitions.

    Usage::

        result = await video_concatenator.concatenate(
            ["/path/HELLO.mp4", "/path/THANK.mp4", "/path/YOU.mp4"]
        )
        # → "/abs/path/concatenated_sequences/abc123def456.mp4"
    """

    def __init__(self, crossfade_sec: float = 0.25) -> None:
        self.crossfade_sec = crossfade_sec
        if not _has_ffmpeg():
            logger.warning(
                "[VideoConcat] ffmpeg not found — concatenation will be unavailable. "
                "Install from https://ffmpeg.org/ and add to PATH."
            )

    # ── Public ─────────────────────────────────────────────────────────────────

    async def concatenate(
        self,
        video_paths: List[str],
        crossfade: bool = True,
        force: bool = False,
    ) -> Optional[str]:
        """
        Stitch *video_paths* into a single MP4 and return its absolute path.

        Parameters
        ----------
        video_paths : ordered list of absolute video file paths
        crossfade   : add smooth fade transition between clips (slower)
        force       : ignore cache and re-generate

        Returns None if ffmpeg is missing or all inputs are invalid.
        """
        if not _has_ffmpeg():
            logger.error("[VideoConcat] ffmpeg required but not installed")
            return None

        # Filter to existing files
        valid = [p for p in video_paths if Path(p).exists()]
        if not valid:
            logger.warning("[VideoConcat] No valid input files")
            return None

        if len(valid) == 1:
            # Nothing to concatenate — return as-is
            return valid[0]

        out_path = _CACHE_DIR / f"{_cache_key(valid)}.mp4"

        if not force and out_path.exists():
            logger.debug("[VideoConcat] Cache hit: %s", out_path.name)
            return str(out_path)

        # Normalise all inputs to the same resolution first
        normalised = await self._normalise(valid)
        if not normalised:
            return None

        try:
            if crossfade and len(normalised) > 1:
                ok = self._concat_xfade(normalised, out_path)
            else:
                ok = self._concat_simple(normalised, out_path)
        finally:
            # Clean up temp normalised files
            for p in normalised:
                Path(p).unlink(missing_ok=True)

        if ok and out_path.exists():
            logger.info("[VideoConcat] Created: %s  (%d clips)", out_path.name, len(valid))
            return str(out_path)

        logger.error("[VideoConcat] Failed to create sequence")
        return None

    def clear_old(self, older_than_days: int = 7) -> int:
        """Delete cached sequences older than *older_than_days*."""
        import time
        cutoff  = time.time() - older_than_days * 86400
        deleted = 0
        for f in _CACHE_DIR.glob("*.mp4"):
            if f.stat().st_mtime < cutoff:
                f.unlink()
                deleted += 1
        return deleted

    # ── Private: normalise ─────────────────────────────────────────────────────

    async def _normalise(self, paths: List[str]) -> List[str]:
        """
        Re-encode every clip to the same codec/resolution (720 × 720, 30 fps).
        This prevents ffmpeg concat errors when clips differ.
        Returns list of temp file paths.
        """
        import asyncio

        normalised: List[str] = []
        loop = asyncio.get_event_loop()

        for src in paths:
            tmp = tempfile.NamedTemporaryFile(
                suffix=".mp4", dir=_CACHE_DIR, delete=False
            )
            tmp.close()
            dst = tmp.name

            cmd = [
                "ffmpeg", "-y", "-i", src,
                "-vf", "scale=720:720:force_original_aspect_ratio=decrease,pad=720:720:(ow-iw)/2:(oh-ih)/2",
                "-r", "30",
                "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
                "-an",                     # strip audio (sign videos should be silent)
                "-movflags", "+faststart",
                dst,
            ]
            try:
                result = await loop.run_in_executor(
                    None,
                    lambda c=cmd: subprocess.run(c, capture_output=True, timeout=30),
                )
                if result.returncode == 0:
                    normalised.append(dst)
                else:
                    logger.warning(
                        "[VideoConcat] normalise failed for %s: %s",
                        Path(src).name, result.stderr[-200:],
                    )
                    Path(dst).unlink(missing_ok=True)
            except Exception as exc:
                logger.error("[VideoConcat] normalise error: %s", exc)
                Path(dst).unlink(missing_ok=True)

        return normalised

    # ── Private: concat (simple) ───────────────────────────────────────────────

    def _concat_simple(self, paths: List[str], out: Path) -> bool:
        """Fast concat with no transitions (copy stream)."""
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".txt", delete=False, encoding="utf-8"
        ) as lst:
            for p in paths:
                lst.write(f"file '{Path(p).absolute()}'\n")
            lst_path = lst.name

        try:
            cmd = [
                "ffmpeg", "-y",
                "-f", "concat", "-safe", "0",
                "-i", lst_path,
                "-c", "copy", "-an",
                str(out),
            ]
            r = subprocess.run(cmd, capture_output=True, timeout=60)
            return r.returncode == 0
        except Exception as exc:
            logger.error("[VideoConcat] simple concat error: %s", exc)
            return False
        finally:
            Path(lst_path).unlink(missing_ok=True)

    # ── Private: concat (xfade) ────────────────────────────────────────────────

    def _concat_xfade(self, paths: List[str], out: Path) -> bool:
        """
        Concatenate with crossfade transitions using the xfade filter.
        Falls back to simple concat on error.
        """
        n   = len(paths)
        dur = self.crossfade_sec

        # Build filter_complex and offset list
        # We need per-clip durations for accurate offsets
        durations = [_probe_duration(p) for p in paths]

        # Build xfade chain: [v0][v1]xfade→[v01], [v01][v2]xfade→[v02], …
        filter_parts: List[str] = []
        offset      = 0.0
        prev_label  = "[0:v]"

        for i in range(1, n):
            offset    += durations[i - 1] - dur
            next_label = f"[v{i}]"
            out_label  = f"[vx{i}]"
            filter_parts.append(
                f"{prev_label}[{i}:v]xfade=transition=fade"
                f":duration={dur}:offset={max(0, offset)}{out_label}"
            )
            prev_label = out_label

        filter_str = ";".join(filter_parts)
        final_label = prev_label

        cmd = ["ffmpeg", "-y"]
        for p in paths:
            cmd += ["-i", p]
        cmd += [
            "-filter_complex", filter_str,
            "-map", final_label,
            "-c:v", "libx264", "-preset", "fast", "-crf", "23",
            "-an", str(out),
        ]

        try:
            r = subprocess.run(cmd, capture_output=True, timeout=120)
            if r.returncode == 0:
                return True
            logger.warning(
                "[VideoConcat] xfade failed (%s) — falling back to simple concat",
                r.stderr[-200:],
            )
            return self._concat_simple(paths, out)
        except Exception as exc:
            logger.error("[VideoConcat] xfade error: %s", exc)
            return self._concat_simple(paths, out)


def _probe_duration(path: str) -> float:
    """Return video duration via ffprobe, default 3.0 s."""
    try:
        r = subprocess.run(
            [
                "ffprobe", "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                path,
            ],
            capture_output=True, text=True, timeout=5,
        )
        if r.returncode == 0:
            return float(r.stdout.strip())
    except Exception:
        pass
    return 3.0


# ── Singleton ──────────────────────────────────────────────────────────────────
video_concatenator = VideoConcat(crossfade_sec=0.25)
