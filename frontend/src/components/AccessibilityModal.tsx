import React, {
    useEffect,
    useRef,
    useState,
    useCallback,
} from 'react';
import {
    Mic,
    MicOff,
    Volume2,
    VolumeX,
    SunMoon,
    ZoomIn,
    ZoomOut,
    X,
    Loader2,
    Eye,
} from 'lucide-react';
import websocketService, {
    MessageType,
    ConnectionState,
} from '../services/websocket';
import audioService, { AudioEvent, AudioState } from '../services/audio';

// ─── Types ───────────────────────────────────────────────────────────────────
type AssistantState =
    | 'idle'
    | 'greeting'
    | 'listening'
    | 'processing'
    | 'speaking'
    | 'vision_file'
    | 'vision_processing'
    | 'vision_asr';

interface AccessibilityModalProps {
    isOpen: boolean;
    onClose: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const MIN_FONT = 14;
const MAX_FONT = 28;
const FONT_STEP = 2;

const STATE_LABELS: Record<AssistantState, string> = {
    idle: 'Ready',
    greeting: 'Greeting…',
    listening: 'Listening…',
    processing: 'Processing…',
    speaking: 'Speaking…',
    vision_file: 'Select image…',
    vision_processing: 'Analysing image…',
    vision_asr: 'Ask about image…',
};

const STATE_COLORS: Record<AssistantState, string> = {
    idle: 'var(--a11y-accent)',
    greeting: '#60a5fa',
    listening: '#34d399',
    processing: '#a78bfa',
    speaking: '#fbbf24',
    vision_file: '#38bdf8',
    vision_processing: '#2dd4bf',
    vision_asr: '#34d399',
};

// ─── Local-storage helpers ────────────────────────────────────────────────────
const storage = {
    get: (key: string, fallback: unknown) => {
        try {
            const v = localStorage.getItem(key);
            return v !== null ? JSON.parse(v) : fallback;
        } catch {
            return fallback;
        }
    },
    set: (key: string, value: unknown) => {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch { }
    },
};

// ─── Component ────────────────────────────────────────────────────────────────
const AccessibilityModal: React.FC<AccessibilityModalProps> = ({
    isOpen,
    onClose,
}) => {
    // Core state
    const [assistantState, setAssistantState] = useState<AssistantState>('idle');
    const [isConnected, setIsConnected] = useState(false);
    const [transcript, setTranscript] = useState('');
    const [response, setResponse] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [callActive, setCallActive] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [isFirstInteraction, setIsFirstInteraction] = useState(true);

    // Vision state
    const [visionEnabled, setVisionEnabled] = useState(false);

    // Accessibility preferences
    const [highContrast, setHighContrast] = useState<boolean>(() =>
        storage.get('a11y_high_contrast', false)
    );
    const [fontSize, setFontSize] = useState<number>(() =>
        storage.get('a11y_font_size', 18)
    );

    // ARIA live-region announcement text
    const [announcement, setAnnouncement] = useState('');

    // DOM refs
    const dialogRef = useRef<HTMLDivElement>(null);
    const micButtonRef = useRef<HTMLButtonElement>(null);
    const triggerRef = useRef<HTMLButtonElement | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const prevStateRef = useRef<AssistantState>('idle');

    // ─── High-contrast effect ───────────────────────────────────────────────────
    useEffect(() => {
        storage.set('a11y_high_contrast', highContrast);
        document.documentElement.setAttribute(
            'data-high-contrast',
            String(highContrast)
        );
    }, [highContrast]);

    useEffect(() => {
        storage.set('a11y_font_size', fontSize);
        document.documentElement.style.setProperty(
            '--a11y-font-size',
            `${fontSize}px`
        );
    }, [fontSize]);

    // ─── State → ARIA announcement ──────────────────────────────────────────────
    useEffect(() => {
        if (assistantState !== prevStateRef.current) {
            setAnnouncement(STATE_LABELS[assistantState]);
            prevStateRef.current = assistantState;
        }
    }, [assistantState]);

    // ─── Focus trap & restore ───────────────────────────────────────────────────
    useEffect(() => {
        if (isOpen) {
            // Save the element that was focused before the dialog opened
            triggerRef.current = document.activeElement as HTMLButtonElement;
            // Auto-focus the mic button after a brief delay for screen readers
            const t = setTimeout(() => micButtonRef.current?.focus(), 80);
            return () => clearTimeout(t);
        } else {
            // Restore focus to the trigger when the dialog closes
            triggerRef.current?.focus();
        }
    }, [isOpen]);

    // Focus trap keydown listener
    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
                return;
            }

            if (e.key !== 'Tab') return;

            // Collect focusable elements inside the dialog
            const focusable = Array.from(
                dialogRef.current?.querySelectorAll<HTMLElement>(
                    'button:not([disabled]), [tabindex]:not([tabindex="-1"]), input'
                ) ?? []
            ).filter((el) => !el.closest('[disabled]'));

            if (focusable.length === 0) return;

            const first = focusable[0];
            const last = focusable[focusable.length - 1];

            if (e.shiftKey) {
                if (document.activeElement === first) {
                    e.preventDefault();
                    last.focus();
                }
            } else {
                if (document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                }
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    // ─── WebSocket + Audio event wiring ────────────────────────────────────────
    useEffect(() => {
        if (!isOpen) return;

        const onConnectionChange = () => {
            const state = websocketService.getConnectionState();
            setIsConnected(state === ConnectionState.CONNECTED);
        };

        const onTranscription = (data: any) => {
            if (data?.text) setTranscript(data.text);
            setAssistantState(data?.text?.trim() ? 'processing' : 'idle');
        };

        const onLLMResponse = (data: any) => {
            if (data?.text) setResponse(data.text);
        };

        const onTTSChunk = (data: any) => {
            if (data?.audio_chunk) {
                audioService.playAudioChunk(data.audio_chunk, data.format || 'mp3');
            }
        };

        const onError = (data: any) => {
            const msg = data?.error ?? 'An error occurred';
            if (!msg.includes('WebSocket') && !msg.includes('connection')) {
                setError(msg);
            }
            setAssistantState('idle');
        };

        const onPlaybackStart = () => setAssistantState('speaking');
        const onPlaybackEnd = () => {
            setTimeout(() => {
                if (!audioService.isCurrentlySpeaking()) setAssistantState('idle');
            }, 100);
        };

        const onAudioData = (data: any) => {
            if (data?.isVoice && callActive) {
                if (
                    assistantState === 'idle' ||
                    assistantState === 'speaking' ||
                    assistantState === 'vision_asr'
                ) {
                    setAssistantState('listening');
                }
            }
        };

        const onVisionSettings = (data: any) => {
            if (data?.enabled !== undefined) setVisionEnabled(data.enabled);
        };

        const onVisionFileResult = (data: any) => {
            if (data?.success) {
                // handled by vision_ready
            } else {
                setError('Failed to upload image. Please try again.');
                setAssistantState('idle');
            }
        };

        const onVisionReady = (data: any) => {
            if (data?.context) setAssistantState('vision_asr');
        };

        // Register listeners
        websocketService.addEventListener('open', onConnectionChange);
        websocketService.addEventListener('close', onConnectionChange);
        websocketService.addEventListener('error', onConnectionChange);
        websocketService.addEventListener('transcription', onTranscription);
        websocketService.addEventListener('llm_response', onLLMResponse);
        websocketService.addEventListener('tts_chunk', onTTSChunk);
        websocketService.addEventListener('error', onError);
        websocketService.addEventListener(
            MessageType.VISION_SETTINGS as any,
            onVisionSettings
        );
        websocketService.addEventListener(
            MessageType.VISION_FILE_UPLOAD_RESULT as any,
            onVisionFileResult
        );
        websocketService.addEventListener(
            MessageType.VISION_READY as any,
            onVisionReady
        );
        audioService.addEventListener(AudioEvent.PLAYBACK_START, onPlaybackStart);
        audioService.addEventListener(AudioEvent.PLAYBACK_END, onPlaybackEnd);
        audioService.addEventListener(AudioEvent.RECORDING_DATA, onAudioData);

        onConnectionChange();
        if (websocketService.getConnectionState() === ConnectionState.CONNECTED) {
            websocketService.getVisionSettings();
        }

        return () => {
            websocketService.removeEventListener('open', onConnectionChange);
            websocketService.removeEventListener('close', onConnectionChange);
            websocketService.removeEventListener('error', onConnectionChange);
            websocketService.removeEventListener('transcription', onTranscription);
            websocketService.removeEventListener('llm_response', onLLMResponse);
            websocketService.removeEventListener('tts_chunk', onTTSChunk);
            websocketService.removeEventListener('error', onError);
            websocketService.removeEventListener(
                MessageType.VISION_SETTINGS as any,
                onVisionSettings
            );
            websocketService.removeEventListener(
                MessageType.VISION_FILE_UPLOAD_RESULT as any,
                onVisionFileResult
            );
            websocketService.removeEventListener(
                MessageType.VISION_READY as any,
                onVisionReady
            );
            audioService.removeEventListener(
                AudioEvent.PLAYBACK_START,
                onPlaybackStart
            );
            audioService.removeEventListener(AudioEvent.PLAYBACK_END, onPlaybackEnd);
            audioService.removeEventListener(AudioEvent.RECORDING_DATA, onAudioData);
        };
    }, [isOpen, callActive, assistantState]);

    // ─── Microphone action ──────────────────────────────────────────────────────
    const handleMicAction = useCallback(async () => {
        if (!isConnected) {
            setError('Not connected to server. Please wait.');
            return;
        }
        setError(null);

        try {
            if (!callActive) {
                // Start a new call session
                setCallActive(true);
                setTranscript('');
                setResponse('');
                await audioService.startRecording();

                if (isFirstInteraction) {
                    setAssistantState('greeting');
                    websocketService.sendGreeting();
                    setIsFirstInteraction(false);
                }
            } else if (audioService.getAudioState() === AudioState.RECORDING) {
                audioService.stopRecording();
            } else {
                if (
                    assistantState === 'processing' ||
                    assistantState === 'vision_processing'
                )
                    return;
                if (assistantState === 'speaking') {
                    audioService.stopPlayback();
                    websocketService.interrupt();
                }
                await audioService.startRecording();
            }
        } catch (err) {
            setError(`Microphone error: ${(err as Error).message}`);
        }
    }, [isConnected, callActive, assistantState, isFirstInteraction]);

    // End call
    const handleEndCall = useCallback(() => {
        audioService.releaseHardware();
        websocketService.interrupt();
        websocketService.clearHistory();
        setCallActive(false);
        setAssistantState('idle');
        setTranscript('');
        setResponse('');
        setIsFirstInteraction(true);
        setError(null);
    }, []);

    // Mute toggle
    const handleMuteToggle = useCallback(() => {
        const newMute = audioService.toggleMicrophoneMute();
        setIsMuted(newMute);
    }, []);

    // Vision: send image
    const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
            setError('File too large. Maximum 5 MB.');
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            const b64 = reader.result?.toString().split(',')[1] ?? '';
            setAssistantState('vision_processing');
            websocketService.sendVisionImage(b64);
        };
        reader.readAsDataURL(file);
        // reset input so same file can be selected again
        e.target.value = '';
    };

    // ─── Keyboard shortcut for mic (Space / Enter) ──────────────────────────────
    const handleKeyOnMic = (e: React.KeyboardEvent) => {
        if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            handleMicAction();
        }
    };

    if (!isOpen) return null;

    // Derived display values
    const stateColor = STATE_COLORS[assistantState];
    const stateLabel = STATE_LABELS[assistantState];
    const isRecording = audioService.getAudioState() === AudioState.RECORDING;

    // CSS vars for the modal itself (not global)
    const modalStyle: React.CSSProperties = {
        '--modal-font-size': `${fontSize}px`,
    } as React.CSSProperties;

    return (
        <>
            {/* ── Backdrop ──────────────────────────────────────────────────── */}
            <div
                className="a11y-backdrop"
                onClick={onClose}
                aria-hidden="true"
            />

            {/* ── Dialog ────────────────────────────────────────────────────── */}
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="a11y-dialog-title"
                aria-describedby="a11y-dialog-desc"
                className={`a11y-modal${highContrast ? ' a11y-modal--hc' : ''}`}
                style={modalStyle}
            >
                {/* Hidden ARIA live region — announces state transitions */}
                <div
                    aria-live="assertive"
                    aria-atomic="true"
                    className="a11y-sr-only"
                    id="a11y-live"
                >
                    {announcement}
                </div>

                {/* ── Header ──────────────────────────────────────────────────── */}
                <header className="a11y-header">
                    <div>
                        <h2 id="a11y-dialog-title" className="a11y-title">
                            Accessibility Assistant
                        </h2>
                        <p id="a11y-dialog-desc" className="a11y-subtitle">
                            Voice-first AI assistant for visually challenged users
                        </p>
                    </div>

                    {/* Connection badge */}
                    <div
                        className={`a11y-conn-badge${isConnected ? ' a11y-conn-badge--on' : ''}`}
                        aria-label={isConnected ? 'Connected' : 'Disconnected'}
                    >
                        <span className="a11y-conn-dot" />
                        {isConnected ? 'Connected' : 'Disconnected'}
                    </div>

                    {/* Close */}
                    <button
                        onClick={onClose}
                        className="a11y-icon-btn a11y-close-btn"
                        aria-label="Close Accessibility Assistant (Escape)"
                    >
                        <X size={20} aria-hidden="true" />
                    </button>
                </header>

                {/* ── State indicator strip ────────────────────────────────────── */}
                <div
                    className="a11y-state-strip"
                    style={{ '--strip-color': stateColor } as React.CSSProperties}
                    aria-hidden="true"
                >
                    <span className="a11y-state-dot" />
                    <span className="a11y-state-label">{stateLabel}</span>

                    {/* Animated pulse when active */}
                    {(assistantState === 'listening' ||
                        assistantState === 'speaking' ||
                        assistantState === 'processing') && (
                            <span className="a11y-pulse" />
                        )}
                </div>

                {/* ── Caption panel ───────────────────────────────────────────── */}
                <section className="a11y-caption-panel" aria-label="Conversation captions">
                    {transcript && (
                        <div className="a11y-caption-row a11y-caption--user">
                            <span className="a11y-caption-label">You</span>
                            <p className="a11y-caption-text">{transcript}</p>
                        </div>
                    )}

                    {response && (
                        <div className="a11y-caption-row a11y-caption--assistant">
                            <span className="a11y-caption-label">Assistant</span>
                            <p className="a11y-caption-text" aria-live="polite" aria-atomic="true">
                                {response}
                            </p>
                        </div>
                    )}

                    {!transcript && !response && (
                        <p className="a11y-caption-empty">
                            {callActive
                                ? 'Speak now — captions will appear here.'
                                : 'Press the microphone button to start.'}
                        </p>
                    )}

                    {/* Error banner */}
                    {error && (
                        <div
                            className="a11y-error"
                            role="alert"
                            aria-live="assertive"
                            aria-atomic="true"
                        >
                            <span>⚠ {error}</span>
                            <button
                                onClick={() => setError(null)}
                                aria-label="Dismiss error"
                                className="a11y-error-dismiss"
                            >
                                ✕
                            </button>
                        </div>
                    )}
                </section>

                {/* ── Primary mic button ───────────────────────────────────────── */}
                <div className="a11y-mic-area">
                    {callActive ? (
                        <>
                            <button
                                ref={micButtonRef}
                                onClick={handleMicAction}
                                onKeyDown={handleKeyOnMic}
                                disabled={
                                    assistantState === 'processing' ||
                                    assistantState === 'vision_processing'
                                }
                                aria-label={
                                    isRecording ? 'Stop speaking (Space or Enter)' : 'Start speaking (Space or Enter)'
                                }
                                aria-pressed={isRecording}
                                aria-disabled={
                                    assistantState === 'processing' ||
                                    assistantState === 'vision_processing'
                                }
                                className={`a11y-mic-btn${isRecording ? ' a11y-mic-btn--active' : ''}`}
                            >
                                {assistantState === 'processing' ||
                                    assistantState === 'vision_processing' ? (
                                    <Loader2 size={36} className="a11y-spin" aria-hidden="true" />
                                ) : isRecording ? (
                                    <MicOff size={36} aria-hidden="true" />
                                ) : (
                                    <Mic size={36} aria-hidden="true" />
                                )}
                                <span className="a11y-mic-label">
                                    {isRecording ? 'Stop' : 'Speak'}
                                </span>
                            </button>

                            {/* Secondary controls row */}
                            <div className="a11y-controls" role="group" aria-label="Call controls">
                                {/* Mute */}
                                <button
                                    onClick={handleMuteToggle}
                                    aria-label={isMuted ? 'Unmute microphone (M)' : 'Mute microphone (M)'}
                                    aria-pressed={isMuted}
                                    className={`a11y-ctrl-btn${isMuted ? ' a11y-ctrl-btn--warn' : ''}`}
                                >
                                    {isMuted ? (
                                        <VolumeX size={22} aria-hidden="true" />
                                    ) : (
                                        <Volume2 size={22} aria-hidden="true" />
                                    )}
                                    <span>{isMuted ? 'Unmute' : 'Mute'}</span>
                                </button>

                                {/* Vision upload (if enabled) */}
                                {visionEnabled && (
                                    <>
                                        <button
                                            onClick={() => fileInputRef.current?.click()}
                                            disabled={
                                                assistantState === 'processing' ||
                                                assistantState === 'vision_processing'
                                            }
                                            aria-label="Upload image for description"
                                            className="a11y-ctrl-btn"
                                        >
                                            <Eye size={22} aria-hidden="true" />
                                            <span>Image</span>
                                        </button>
                                        <input
                                            ref={fileInputRef}
                                            type="file"
                                            accept="image/*"
                                            onChange={handleFileSelected}
                                            style={{ display: 'none' }}
                                            aria-hidden="true"
                                            tabIndex={-1}
                                        />
                                    </>
                                )}

                                {/* End call */}
                                <button
                                    onClick={handleEndCall}
                                    aria-label="End conversation"
                                    className="a11y-ctrl-btn a11y-ctrl-btn--danger"
                                >
                                    <MicOff size={22} aria-hidden="true" />
                                    <span>End</span>
                                </button>
                            </div>
                        </>
                    ) : (
                        /* Start button shown when no call is active */
                        <button
                            ref={micButtonRef}
                            onClick={handleMicAction}
                            onKeyDown={handleKeyOnMic}
                            disabled={!isConnected}
                            aria-label="Start conversation with AI assistant"
                            aria-disabled={!isConnected}
                            className="a11y-start-btn"
                        >
                            <Mic size={40} aria-hidden="true" />
                            <span>Start conversation</span>
                            {!isConnected && (
                                <small className="a11y-start-subtitle">
                                    Connecting to server…
                                </small>
                            )}
                        </button>
                    )}
                </div>

                {/* ── Settings strip ───────────────────────────────────────────── */}
                <footer className="a11y-footer" role="group" aria-label="Accessibility settings">
                    {/* High-contrast toggle */}
                    <button
                        onClick={() => setHighContrast((v) => !v)}
                        aria-label={
                            highContrast ? 'Disable high-contrast mode' : 'Enable high-contrast mode'
                        }
                        aria-pressed={highContrast}
                        className={`a11y-setting-btn${highContrast ? ' a11y-setting-btn--active' : ''}`}
                    >
                        <SunMoon size={18} aria-hidden="true" />
                        <span>High contrast</span>
                    </button>

                    {/* Font size controls */}
                    <div className="a11y-font-ctrl" role="group" aria-label="Font size controls">
                        <button
                            onClick={() => setFontSize((s) => Math.max(MIN_FONT, s - FONT_STEP))}
                            disabled={fontSize <= MIN_FONT}
                            aria-label="Decrease font size"
                            aria-disabled={fontSize <= MIN_FONT}
                            className="a11y-icon-btn"
                        >
                            <ZoomOut size={18} aria-hidden="true" />
                        </button>
                        <span
                            className="a11y-font-size-display"
                            aria-label={`Current font size: ${fontSize} pixels`}
                        >
                            {fontSize}px
                        </span>
                        <button
                            onClick={() => setFontSize((s) => Math.min(MAX_FONT, s + FONT_STEP))}
                            disabled={fontSize >= MAX_FONT}
                            aria-label="Increase font size"
                            aria-disabled={fontSize >= MAX_FONT}
                            className="a11y-icon-btn"
                        >
                            <ZoomIn size={18} aria-hidden="true" />
                        </button>
                    </div>

                    {/* Keyboard shortcut hint */}
                    <p className="a11y-shortcut-hint" aria-hidden="true">
                        Esc — close &nbsp;|&nbsp; Alt+A — toggle
                    </p>
                </footer>
            </div>
        </>
    );
};

export default AccessibilityModal;
