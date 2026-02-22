/**
 * ASLVideoPlayer — Real Human Sign Language Video Player
 *
 * Plays ASL sign videos one at a time (Individual mode).
 * Skips the sequence-concatenation step by default so it works without ffmpeg.
 * Switch to Sequence mode manually via the header button if ffmpeg is running.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SignVideo {
    token: string;
    video_url: string | null;
    duration?: number;
    type?: 'real_human' | 'fingerspelling' | 'missing';
    status?: 'success' | 'missing' | 'error';
    letters?: Array<{ letter: string; video_url: string; duration: number }>;
}

interface Props {
    signTokens: Array<{ label: string }>;
    signVideos?: SignVideo[];
    backendUrl?: string;
    autoPlay?: boolean;
    loop?: boolean;
    onComplete?: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const BACKEND = 'http://localhost:8000';

// ─── Component ────────────────────────────────────────────────────────────────

const ASLVideoPlayer: React.FC<Props> = ({
    signTokens,
    signVideos = [],
    backendUrl = BACKEND,
    autoPlay = true,
    loop = false,
    onComplete,
}) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [idxI, setIdxI] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [speed, setSpeed] = useState(1);
    // Sequence mode state (optional — requires ffmpeg on server)
    const [useSequence, setUseSequence] = useState(false);
    const [sequenceUrl, setSequenceUrl] = useState<string | null>(null);
    const [seqLoading, setSeqLoading] = useState(false);
    const [seqFailed, setSeqFailed] = useState(false);

    const tokens = signTokens.map(t => t.label.toUpperCase());

    // ── Build the full URL for a video_url from backend ──────────────────────

    const fullUrl = useCallback((raw: string | null | undefined): string | null => {
        if (!raw) return null;
        if (raw.startsWith('http') || raw.startsWith('blob:')) return raw;
        return `${backendUrl}${raw}`;
    }, [backendUrl]);

    // ── Reset index when token list changes ───────────────────────────────────

    useEffect(() => {
        setIdxI(0);
        setIsPlaying(false);
        setSequenceUrl(null);
        setSeqFailed(false);
        setUseSequence(false);
    }, [tokens.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Load correct video into the <video> element ───────────────────────────
    // Runs whenever: index changes, signVideos update, or sequence URL arrives

    useEffect(() => {
        const vid = videoRef.current;
        if (!vid) return;

        let src: string | null = null;

        if (useSequence && sequenceUrl) {
            src = sequenceUrl;
        } else if (!useSequence) {
            const sv = signVideos[idxI];
            src = fullUrl(sv?.video_url);
        }

        if (!src) return;

        // Only update src if it's different to avoid re-buffering
        if (vid.src !== src) {
            vid.src = src;
        }

        // Play as soon as the browser has enough data
        const tryPlay = () => {
            if (autoPlay) {
                vid.play().catch(() => {
                    // Autoplay blocked — user can click Play manually
                });
            }
        };

        vid.addEventListener('loadeddata', tryPlay, { once: true });
        vid.load();

        return () => {
            vid.removeEventListener('loadeddata', tryPlay);
        };
    }, [idxI, signVideos, useSequence, sequenceUrl, autoPlay, fullUrl]);

    // ── Speed ─────────────────────────────────────────────────────────────────

    useEffect(() => {
        if (videoRef.current) videoRef.current.playbackRate = speed;
    }, [speed]);

    // ── Video end — auto-advance ───────────────────────────────────────────────

    const onEnded = useCallback(() => {
        if (useSequence) {
            if (loop && videoRef.current) {
                videoRef.current.currentTime = 0;
                videoRef.current.play();
            } else {
                setIsPlaying(false);
                onComplete?.();
            }
        } else {
            if (idxI < signVideos.length - 1) {
                setIdxI(i => i + 1);
            } else if (loop) {
                setIdxI(0);
            } else {
                setIsPlaying(false);
                onComplete?.();
            }
        }
    }, [useSequence, loop, idxI, signVideos.length, onComplete]);

    // ── Sequence fetch (only when user explicitly switches to sequence mode) ──

    const loadSequence = useCallback(async () => {
        setSeqLoading(true);
        setSeqFailed(false);
        try {
            const resp = await fetch(`${backendUrl}/asl-video-sequence`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tokens, crossfade: true }),
            });
            if (!resp.ok) throw new Error(`${resp.status}`);
            const blob = await resp.blob();
            setSequenceUrl(URL.createObjectURL(blob));
        } catch {
            setSeqFailed(true);
            setUseSequence(false);
        } finally {
            setSeqLoading(false);
        }
    }, [tokens.join(','), backendUrl]); // eslint-disable-line react-hooks/exhaustive-deps

    const toggleSequence = () => {
        if (!useSequence) {
            setUseSequence(true);
            loadSequence();
        } else {
            setUseSequence(false);
        }
    };

    // ── Controls ──────────────────────────────────────────────────────────────

    const handlePlay = () => { videoRef.current?.play(); setIsPlaying(true); };
    const handlePause = () => { videoRef.current?.pause(); setIsPlaying(false); };
    const handlePrev = () => setIdxI(i => Math.max(0, i - 1));
    const handleNext = () => setIdxI(i => Math.min(signVideos.length - 1, i + 1));
    const handleRestart = () => {
        if (videoRef.current) {
            videoRef.current.currentTime = 0;
            videoRef.current.play();
            setIsPlaying(true);
        }
        if (!useSequence) setIdxI(0);
    };

    // ── Render ────────────────────────────────────────────────────────────────

    if (tokens.length === 0) return null;

    const currentSV = signVideos[idxI];
    const hasVideo = !!fullUrl(currentSV?.video_url);
    const hasPrev = idxI > 0;
    const hasNext = idxI < signVideos.length - 1;
    const available = signVideos.filter(v => v.video_url);
    const coverPct = signVideos.length ? Math.round((available.length / signVideos.length) * 100) : 0;
    const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5] as const;

    return (
        <div className="flex flex-col bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 rounded-2xl overflow-hidden shadow-2xl border border-indigo-500/20">

            {/* ── Header ── */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-indigo-500/20">
                <div className="flex items-center gap-2.5">
                    <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                    <span className="text-xs font-bold text-slate-200 uppercase tracking-widest">
                        ASL Video Player
                    </span>
                    <span className="text-[10px] bg-emerald-900/50 text-emerald-300 px-2 py-0.5 rounded-full font-semibold">
                        REAL HUMAN
                    </span>
                </div>
                <button
                    onClick={toggleSequence}
                    className="text-[10px] font-semibold px-3 py-1.5 rounded-lg bg-indigo-700/50 hover:bg-indigo-600/60 text-indigo-200 transition-colors"
                    title={seqFailed ? 'Sequence mode requires ffmpeg on server' : ''}
                >
                    {seqLoading ? '⏳ Building…' : useSequence ? '📹 Sequence' : '🎬 Individual'}
                </button>
            </div>

            {/* ── Video area ── */}
            <div className="relative w-full bg-black" style={{ aspectRatio: '16/9' }}>

                {/* Loading spinner (sequence only) */}
                {seqLoading && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-10 gap-3">
                        <div className="w-10 h-10 border-2 border-indigo-500/30 border-t-indigo-400 rounded-full animate-spin" />
                        <span className="text-xs text-slate-400">Concatenating videos…</span>
                    </div>
                )}

                {/* Text fallback when no video is available */}
                {!hasVideo && !useSequence && currentSV && (
                    <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-indigo-950 to-slate-900 z-0">
                        <div className="text-center select-none">
                            <p className="text-7xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">
                                {currentSV.token}
                            </p>
                            <p className="text-xs text-slate-500 mt-3">No video for this sign</p>
                        </div>
                    </div>
                )}

                {/* The actual video element */}
                <video
                    ref={videoRef}
                    className="relative z-10 w-full h-full object-contain"
                    playsInline
                    muted
                    loop={loop && useSequence}
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                    onEnded={onEnded}
                    style={{ display: (hasVideo || useSequence) ? 'block' : 'none' }}
                />

                {/* Token label badge */}
                {!useSequence && currentSV && hasVideo && (
                    <div className="absolute bottom-3 left-3 z-20 bg-black/60 backdrop-blur-sm text-white text-sm font-bold px-3 py-1 rounded-lg">
                        {currentSV.token}
                    </div>
                )}

                {/* Sequence error notice */}
                {seqFailed && (
                    <div className="absolute top-3 right-3 z-20 bg-amber-900/80 text-amber-300 text-[10px] px-3 py-1.5 rounded-lg">
                        ⚠ Sequence requires ffmpeg
                    </div>
                )}
            </div>

            {/* ── Speed selector ── */}
            <div className="flex items-center gap-2 px-5 pt-3 pb-1">
                <span className="text-[10px] text-slate-500 uppercase tracking-wide">Speed</span>
                {SPEEDS.map(s => (
                    <button
                        key={s}
                        onClick={() => setSpeed(s)}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors
                            ${speed === s ? 'bg-indigo-600 text-white' : 'bg-slate-700/60 text-slate-400 hover:bg-slate-600'}`}
                    >
                        {s}×
                    </button>
                ))}
            </div>

            {/* ── Controls ── */}
            <div className="flex items-center justify-center gap-3 px-5 py-3">
                {!useSequence && (
                    <button
                        onClick={handlePrev}
                        disabled={!hasPrev}
                        className="p-2.5 bg-slate-700/60 hover:bg-slate-600 disabled:opacity-30 disabled:cursor-not-allowed rounded-lg transition-colors text-slate-200"
                    >⏮</button>
                )}

                {isPlaying ? (
                    <button onClick={handlePause} className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-full transition-colors">
                        ⏸ Pause
                    </button>
                ) : (
                    <button onClick={handlePlay} className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-black font-bold rounded-full transition-colors">
                        ▶ Play
                    </button>
                )}

                <button onClick={handleRestart} className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-full transition-colors">
                    🔄 Restart
                </button>

                {!useSequence && (
                    <button
                        onClick={handleNext}
                        disabled={!hasNext}
                        className="p-2.5 bg-slate-700/60 hover:bg-slate-600 disabled:opacity-30 disabled:cursor-not-allowed rounded-lg transition-colors text-slate-200"
                    >⏭</button>
                )}
            </div>

            {/* ── Token timeline ── */}
            {signVideos.length > 0 && (
                <div className="px-5 pb-4 border-t border-indigo-500/20 pt-3">
                    <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-2">Click to jump</p>
                    <div className="flex flex-wrap gap-1.5">
                        {signVideos.map((sv, i) => (
                            <button
                                key={`${sv.token}-${i}`}
                                onClick={() => { if (!useSequence) setIdxI(i); }}
                                className={`
                                    px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wide transition-all
                                    ${!useSequence && i === idxI
                                        ? 'bg-indigo-500 text-white scale-110 shadow-md shadow-indigo-500/40 border border-indigo-400'
                                        : !useSequence && i < idxI
                                            ? 'bg-emerald-800/70 text-emerald-300 border border-emerald-700/50'
                                            : sv.video_url
                                                ? 'bg-slate-700/50 text-slate-300 hover:bg-slate-600/70 border border-slate-600/30'
                                                : 'bg-red-900/30 text-red-400 border border-red-800/30 cursor-default'}
                                `}
                                title={!sv.video_url ? 'Video not in library' : ''}
                            >
                                {sv.token}
                                {!sv.video_url && <span className="ml-0.5 opacity-60">✗</span>}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* ── Footer ── */}
            <div className="flex items-center justify-between px-5 py-2.5 bg-slate-900/50 text-[10px] text-slate-500">
                <span>✅ Real human signer · Sign {idxI + 1}/{signVideos.length || tokens.length}</span>
                <span className="font-mono">{available.length}/{signVideos.length || tokens.length} videos · {coverPct}% coverage</span>
            </div>
        </div>
    );
};

export default ASLVideoPlayer;
