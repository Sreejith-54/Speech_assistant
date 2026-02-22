/**
 * DeafInterface — Dual-Mode Deaf Accessibility UI
 *
 * MODE 1 — LEARN ASL (toggle ON, emerald):
 *   User types text → instant client-side ASL translation → sign display.
 *   Zero API calls. Zero AI. Instant.
 *
 * MODE 2 — CHAT (toggle OFF, indigo):
 *   User types text → POST /deaf → AI text response, no signs.
 *   Conversation history kept client-side for multi-turn support.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, Send, Mic, MicOff } from 'lucide-react';
import BackgroundStars from './BackgroundStars';
import JASigningPlayer from './JASigningPlayer';
import LearnModeToggle from './LearnModeToggle';
import websocketService, { MessageType, ConnectionState } from '../services/websocket';
import { signTranslator } from '../services/signTranslator';
import type { SignToken } from '../services/signTranslator';

// ─── Types ────────────────────────────────────────────────────────────────────

type ChatMessage = {
  role: 'user' | 'assistant';
  text: string;
  /** True when this message is a Learn-mode translation summary */
  isTranslation?: boolean;
  /** Optional time-coded transcript for video results */
  videoTranscript?: string;
  videoTranscriptLabel?: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'deaf_learn_mode_enabled';

function loadLearnMode(): boolean {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'false');
  } catch {
    return false;
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

const DeafInterface: React.FC = () => {

  // ── Mode ────────────────────────────────────────────────────────────────────
  const [learnMode, setLearnMode] = useState<boolean>(loadLearnMode);

  // Clear signs when switching to Chat mode
  const handleModeChange = useCallback((enabled: boolean) => {
    setLearnMode(enabled);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(enabled));
    if (!enabled) {
      setSignTokens([]);
      setSigmlXml('');
    }
    console.log(`[DeafInterface] Switched to ${enabled ? 'Learn ASL' : 'Chat'} mode`);
  }, []);

  // Ctrl+L keyboard shortcut to toggle modes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
        e.preventDefault();
        setLearnMode(prev => {
          const next = !prev;
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
          if (!next) {
            setSignTokens([]);
            setSigmlXml('');
          }
          return next;
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ── Chat state ──────────────────────────────────────────────────────────────
  const [learnTextInput, setLearnTextInput] = useState('');
  const [chatTextInput, setChatTextInput] = useState('');
  const [learnHistory, setLearnHistory] = useState<ChatMessage[]>([]);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [assistantState, setAssistantState] =
    useState<'idle' | 'processing' | 'listening'>('idle');
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [videoUrlInput, setVideoUrlInput] = useState('');
  const [isVideoProcessing, setIsVideoProcessing] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  const [videoStage, setVideoStage] = useState('');
  const videoFileInputRef = useRef<HTMLInputElement>(null);
  const [expandedTranscripts, setExpandedTranscripts] = useState<Record<number, boolean>>({});

  // ── Sign language state ─────────────────────────────────────────────────────
  const [signTokens, setSignTokens] = useState<SignToken[]>([]);
  /** SiGML XML for 3D avatar display */
  const [sigmlXml, setSigmlXml] = useState<string>('');

  // ── Learn Mode: Quiz ───────────────────────────────────────────────────────
  const [quizEnabled, setQuizEnabled] = useState(false);
  const [quizQuestion, setQuizQuestion] = useState('');
  const [quizOptions, setQuizOptions] = useState<string[]>([]);
  const [quizAnswer, setQuizAnswer] = useState('');
  const [quizFeedback, setQuizFeedback] = useState('');
  const [quizAnswered, setQuizAnswered] = useState(false);
  const [quizScore, setQuizScore] = useState({ correct: 0, total: 0 });


  // ── Mic (browser Speech API) ────────────────────────────────────────────────
  const [isListening, setIsListening] = useState(false);
  const speechRecogRef = useRef<any>(null);

  // ── Refs ────────────────────────────────────────────────────────────────────
  const chatEndRef = useRef<HTMLDivElement>(null);

  // ─── Auto-scroll ─────────────────────────────────────────────────────────────
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [learnMode, learnHistory, chatHistory]);

  // ─── WebSocket connection (used by Chat mode) ────────────────────────────────
  useEffect(() => {
    const connectTimer = setTimeout(() => websocketService.connect(), 300);

    const onConnChange = () => {
      setIsConnected(websocketService.getConnectionState() === ConnectionState.CONNECTED);
    };
    websocketService.addEventListener('open', onConnChange);
    websocketService.addEventListener('close', onConnChange);
    websocketService.addEventListener('error', onConnChange);
    onConnChange();

    return () => {
      clearTimeout(connectTimer);
      websocketService.removeEventListener('open', onConnChange);
      websocketService.removeEventListener('close', onConnChange);
      websocketService.removeEventListener('error', onConnChange);
    };
  }, []);

  // ─── Chat mode: WebSocket LLM response listener ───────────────────────────────
  useEffect(() => {
    const onLLMResponse = (data: any) => {
      if (!data.text) return;
      setChatHistory(prev => [...prev, { role: 'assistant', text: data.text }]);
      setAssistantState('idle');
    };

    const onVideoResult = (data: any) => {
      const transcription = (data?.transcription || '').trim();
      const summary = (data?.summary || '').trim();
      const presentable = (data?.presentable_response || '').trim();
      const timewiseFull = (data?.timewise_transcript_full || data?.timewise_transcript || '').trim();
      if (!transcription && !summary) {
        setIsVideoProcessing(false);
        setVideoProgress(0);
        setVideoStage('');
        return;
      }

      const polishedBlock = presentable
        ? presentable
        : `📝 Video summary:\n${summary || '(No summary text returned)'}`;

      const transcriptText = timewiseFull || transcription;

      setChatHistory(prev => [
        ...prev,
        {
          role: 'assistant',
          text: polishedBlock,
          videoTranscript: transcriptText,
          videoTranscriptLabel: 'Time-coded transcript'
        }
      ]);

      setIsVideoProcessing(false);
      setVideoProgress(100);
      setVideoStage('Complete');
      setAssistantState('idle');

      setTimeout(() => {
        setVideoProgress(0);
        setVideoStage('');
      }, 1200);
    };

    const onStatus = (data: any) => {
      const status = typeof data?.status === 'string' ? data.status : '';
      if (!status) return;

      if (!status.startsWith('video_') && status !== 'processing_video') {
        return;
      }

      const progressValue = typeof data?.data?.progress === 'number'
        ? Math.max(0, Math.min(100, data.data.progress))
        : 0;
      const stageValue = typeof data?.data?.stage === 'string'
        ? data.data.stage
        : status.replace('video_', '');

      setIsVideoProcessing(true);
      if (progressValue > 0) {
        setVideoProgress(progressValue);
      }
      if (stageValue) {
        setVideoStage(stageValue);
      }
    };

    const onError = (data: any) => {
      const msg = typeof data?.error === 'string' ? data.error : '';
      if (!msg) return;

      if (msg.toLowerCase().includes('video') || msg.toLowerCase().includes('youtube')) {
        setIsVideoProcessing(false);
        setVideoProgress(0);
        setVideoStage('');
        setAssistantState('idle');
        setError(msg);
      }
    };

    websocketService.addEventListener(MessageType.LLM_RESPONSE, onLLMResponse);
    websocketService.addEventListener(MessageType.VIDEO_RESULT as any, onVideoResult);
    websocketService.addEventListener(MessageType.STATUS as any, onStatus);
    websocketService.addEventListener('error', onError);
    return () => {
      websocketService.removeEventListener(MessageType.LLM_RESPONSE, onLLMResponse);
      websocketService.removeEventListener(MessageType.VIDEO_RESULT as any, onVideoResult);
      websocketService.removeEventListener(MessageType.STATUS as any, onStatus);
      websocketService.removeEventListener('error', onError);
    };
  }, []);

  // ─── LEARN MODE: instant client-side translation ──────────────────────────────

  const handleLearnTranslate = useCallback((raw: string) => {
    if (!raw.trim()) return;

    const tokens = signTranslator.translateToSigns(raw);

    // Add user message to chat
    setLearnHistory(prev => [...prev, { role: 'user', text: raw }]);

    if (tokens.length === 0) {
      setLearnHistory(prev => [
        ...prev,
        { role: 'assistant', text: '(No signs found — try a different phrase)', isTranslation: true },
      ]);
      setSigmlXml('');
      return;
    }

    // Show translation summary in chat
    const summary = tokens.map(t => t.label).join(' → ');
    setLearnHistory(prev => [
      ...prev,
      {
        role: 'assistant',
        text: `✅ ${tokens.length} sign${tokens.length !== 1 ? 's' : ''}: ${summary}`,
        isTranslation: true,
      },
    ]);

    // Store sign tokens for display
    setSignTokens(tokens);

    // Generate SiGML XML for 3D avatar
    const tokenLabels = tokens.map(t => t.label.toUpperCase());
    const sigmlTemplate = generateSiGMLFromTokens(tokenLabels);
    setSigmlXml(sigmlTemplate);

    console.log(`[Learn ASL] ${tokens.length} tokens:`, summary);
  }, []);

  const quizWords = [
    'hello', 'thank', 'yes', 'no', 'good', 'bad', 'help', 'water', 'food', 'home',
    'love', 'friend', 'school', 'work', 'sleep', 'learn', 'time', 'where', 'why',
    'how', 'who', 'what', 'sorry', 'please', 'want', 'need', 'happy', 'sad', 'go',
    'come', 'stop', 'watch', 'play', 'teacher', 'book', 'family', 'mother', 'father'
  ];

  const shuffleArray = (items: string[]) => {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };

  const buildQuizQuestion = useCallback(() => {
    const correct = quizWords[Math.floor(Math.random() * quizWords.length)];
    const optionCount = 4 + Math.floor(Math.random() * 3); // 4-6 options
    const optionPool = quizWords.filter(word => word !== correct);
    const options = shuffleArray(optionPool).slice(0, optionCount - 1);
    options.push(correct);
    const finalOptions = shuffleArray(options);

    setQuizQuestion('What sign is shown?');
    setQuizOptions(finalOptions);
    setQuizAnswer(correct);
    setQuizFeedback('');
    setQuizAnswered(false);

    const tokenLabels = [correct.toUpperCase()];
    const sigmlTemplate = generateSiGMLFromTokens(tokenLabels);
    setSignTokens([{ label: correct.toUpperCase(), description: correct } as SignToken]);
    setSigmlXml(sigmlTemplate);
  }, [quizWords]);

  const handleQuizAnswer = useCallback((choice: string) => {
    if (quizAnswered) return;

    const isCorrect = choice === quizAnswer;
    setQuizAnswered(true);
    setQuizScore(prev => ({
      correct: prev.correct + (isCorrect ? 1 : 0),
      total: prev.total + 1
    }));

    if (isCorrect) {
      setQuizFeedback('✅ Correct!');
    } else {
      setQuizFeedback(`❌ Incorrect. Correct answer: ${quizAnswer.toUpperCase()}`);
    }
  }, [quizAnswered, quizAnswer]);

  const handleQuizNext = useCallback(() => {
    buildQuizQuestion();
  }, [buildQuizQuestion]);


  // Helper function to generate SiGML XML from token labels
  const generateSiGMLFromTokens = (tokens: string[]): string => {
    const signs = tokens.map(token => `
      <hamgestural_sign gloss="${token}">
        <sign_manual>
          <handconfig handshape="hamflathand"/>
          <location location="hamloc_chest"/>
          <rpt_motion>
            <directedmotion direction="mo_forward"/>
          </rpt_motion>
        </sign_manual>
        <sign_nonmanual>
          <facialexpr_display movement="M"/>
        </sign_nonmanual>
      </hamgestural_sign>`).join('');

    return `<?xml version="1.0" encoding="UTF-8"?>
<sigml>
  <hamgestural_sign gloss="SEQUENCE">${signs}
  </hamgestural_sign>
</sigml>`;
  };

  // ─── CHAT MODE: send via WebSocket ───────────────────────────────────────────

  const handleChatSend = useCallback((msg: string) => {
    if (!msg.trim() || !isConnected || assistantState === 'processing' || isVideoProcessing) return;

    setChatHistory(prev => [...prev, { role: 'user', text: msg }]);
    setAssistantState('processing');
    setSignTokens([]);
    setSigmlXml('');
    websocketService.sendTextMessage(msg);
    console.log('[Chat] Sent via WebSocket:', msg);
  }, [isConnected, assistantState, isVideoProcessing]);

  const handleVideoUrlSubmit = useCallback(() => {
    const url = videoUrlInput.trim();
    if (!url || !isConnected || learnMode || isVideoProcessing || assistantState === 'processing') return;

    const sent = websocketService.sendVideoUrl(url);
    if (!sent) {
      setError('Failed to send video URL. Check connection and try again.');
      return;
    }

    setChatHistory(prev => [...prev, { role: 'user', text: `🎬 Video URL: ${url}` }]);
    setVideoUrlInput('');
    setIsVideoProcessing(true);
    setVideoProgress(8);
    setVideoStage('Starting');
    setAssistantState('processing');
  }, [videoUrlInput, isConnected, learnMode, isVideoProcessing, assistantState]);

  const handleVideoFileSelected = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (learnMode || !isConnected || isVideoProcessing || assistantState === 'processing') {
      e.target.value = '';
      return;
    }

    const maxBytes = 50 * 1024 * 1024;
    if (file.size > maxBytes) {
      setError('Video too large. Maximum allowed size is 50MB.');
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const result = String(reader.result || '');
        const base64Data = result.includes(',') ? result.split(',')[1] : result;
        const sent = websocketService.sendVideoFile(base64Data, file.name);

        if (!sent) {
          setError('Failed to upload video. Check connection and try again.');
          return;
        }

        setChatHistory(prev => [...prev, { role: 'user', text: `🎬 Uploaded video: ${file.name}` }]);
        setIsVideoProcessing(true);
        setVideoProgress(10);
        setVideoStage('Uploading');
        setAssistantState('processing');
      } catch {
        setError('Could not read selected video file.');
      } finally {
        e.target.value = '';
      }
    };

    reader.onerror = () => {
      setError('Failed to read selected video file.');
      e.target.value = '';
    };

    reader.readAsDataURL(file);
  }, [learnMode, isConnected, isVideoProcessing, assistantState]);

  // ─── Unified submit ───────────────────────────────────────────────────────────

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const msg = (learnMode ? learnTextInput : chatTextInput).trim();
    if (!msg) return;

    if (learnMode) {
      setLearnTextInput('');
    } else {
      setChatTextInput('');
    }

    if (learnMode) {
      handleLearnTranslate(msg);
    } else {
      handleChatSend(msg);
    }
  }, [learnMode, learnTextInput, chatTextInput, handleLearnTranslate, handleChatSend]);

  // ─── Browser Speech API mic ───────────────────────────────────────────────────

  const handleMicToggle = () => {
    if (learnMode) return; // Mic not used in learn mode
    if (assistantState === 'processing') return;

    const SpeechRecog = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecog) {
      setError('Speech recognition requires Chrome or Edge browser.');
      return;
    }

    if (isListening && speechRecogRef.current) {
      speechRecogRef.current.stop();
      speechRecogRef.current = null;
      setIsListening(false);
      setAssistantState('idle');
      return;
    }

    const recog = new SpeechRecog();
    recog.lang = 'en-US';
    recog.interimResults = false;
    recog.maxAlternatives = 1;
    recog.continuous = false;
    speechRecogRef.current = recog;

    recog.onstart = () => { setIsListening(true); setAssistantState('listening'); };
    recog.onresult = (event: any) => {
      const spoken = event.results[0][0].transcript.trim();
      if (spoken) {
        setChatHistory(prev => [...prev, { role: 'user', text: spoken }]);
        setAssistantState('processing');
        websocketService.sendTextMessage(spoken);
        setSignTokens([]);
      }
    };
    recog.onerror = (event: any) => {
      if (event.error !== 'no-speech') setError(`Mic error: ${event.error}`);
    };
    recog.onend = () => {
      setIsListening(false);
      speechRecogRef.current = null;
      if (assistantState === 'listening') setAssistantState('idle');
    };
    recog.start();
  };

  // ─── Derived values ───────────────────────────────────────────────────────────

  const placeholder = learnMode
    ? 'Type English text to see signs instantly...'
    : (isListening ? 'Listening...' : 'Type your message...');

  const submitLabel = learnMode ? 'Translate' : 'Send';
  const activeHistory = learnMode ? learnHistory : chatHistory;
  const activeTextInput = learnMode ? learnTextInput : chatTextInput;

  // In Chat mode: input disabled while AI is responding or mic is active
  const inputDisabled = learnMode
    ? false
    : (!isConnected || assistantState === 'processing' || isListening || isVideoProcessing);

  // Show sign panel only in Learn mode when tokens and SiGML are ready
  const showSignPanel = learnMode && signTokens.length > 0 && sigmlXml;

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="relative min-h-screen bg-gradient-radial from-[#1a1025] via-[#0d0a1f] to-[#06040f] text-slate-200 flex flex-col overflow-hidden">
      <BackgroundStars />

      {/* ── Main content area ── */}
      <div className="flex-1 flex items-start justify-center w-full px-4 pt-6 pb-6">
        <div className="flex flex-col w-full max-w-7xl h-[90vh] gap-4">

          {/* ── Mode Toggle header ── */}
          <LearnModeToggle enabled={learnMode} onChange={handleModeChange} />

          {/* ── Mode description banner ── */}
          <div className={`
            px-4 py-2 rounded-xl border text-xs font-medium transition-colors duration-300
            ${learnMode
              ? 'bg-emerald-900/30 border-emerald-500/30 text-emerald-300'
              : 'bg-indigo-900/30 border-indigo-500/30 text-indigo-300'
            }
          `}>
            {learnMode
              ? '📖 Learn ASL — type any sentence and see sign language instantly. No AI involved.'
              : '💬 Chat — ask the AI anything and get a text response. No signs shown.'}
          </div>

          {/* ── Side-by-side: Chat + Sign Panel ── */}
          <div className="flex flex-row flex-1 gap-4 min-h-0">

            {/* Chat column */}
            <div className="flex-1 flex flex-col bg-slate-900/60 backdrop-blur-lg rounded-2xl border border-slate-700/50 shadow-2xl overflow-hidden">

              {/* Chat header */}
              <div className="px-6 py-4 border-b border-slate-700/50 flex items-center gap-3">
                {learnMode ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-sm font-medium text-slate-300">Learning ASL</span>
                  </>
                ) : (
                  <>
                    <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-indigo-400' : 'bg-red-400'} animate-pulse`} />
                    <span className="text-sm font-medium text-slate-300">
                      {assistantState === 'processing'
                        ? 'AI is typing...'
                        : assistantState === 'listening'
                          ? 'Listening...'
                          : isConnected ? 'Connected' : 'Connecting...'}
                    </span>
                  </>
                )}
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {activeHistory.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center gap-4 text-slate-500">
                    <div className={`
                      w-14 h-14 rounded-full border flex items-center justify-center text-2xl
                      ${learnMode
                        ? 'bg-emerald-900/30 border-emerald-700/40'
                        : 'bg-indigo-900/30 border-indigo-700/40'}
                    `}>
                      {learnMode ? '📖' : '💬'}
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-medium">
                        {learnMode ? 'Type a phrase to translate' : 'Type or tap the mic to start'}
                      </p>
                      <p className="text-xs mt-1 text-slate-600">
                        {learnMode
                          ? 'Signs appear instantly — no waiting'
                          : 'Your conversation will appear here'}
                      </p>
                    </div>
                  </div>
                ) : (
                  activeHistory.map((msg, i) => (
                    <div
                      key={i}
                      className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div className={`
                        max-w-[78%] rounded-2xl px-5 py-3 shadow-sm text-sm leading-relaxed
                        ${msg.role === 'user'
                          ? learnMode
                            ? 'bg-emerald-700/80 text-white rounded-br-sm'
                            : 'bg-indigo-600/90 text-white rounded-br-sm'
                          : msg.isTranslation
                            ? 'bg-emerald-900/60 text-emerald-200 border border-emerald-700/50 rounded-bl-sm font-mono'
                            : 'bg-slate-800/90 text-slate-200 border border-slate-700/50 rounded-bl-sm'
                        }
                      `}>
                        {msg.isTranslation && (
                          <p className="text-[10px] text-emerald-400 uppercase tracking-widest mb-1 font-bold">
                            ASL Translation
                          </p>
                        )}
                        <p className="whitespace-pre-wrap">{msg.text}</p>
                        {msg.videoTranscript && msg.role === 'assistant' && (
                          <div className="mt-3">
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedTranscripts(prev => ({
                                  ...prev,
                                  [i]: !prev[i]
                                }))
                              }
                              className="text-[11px] text-indigo-300 hover:text-indigo-200 underline underline-offset-4"
                            >
                              {expandedTranscripts[i] ? 'Hide full transcript' : 'Show full transcript'}
                            </button>
                            {expandedTranscripts[i] && (
                              <pre className="mt-2 whitespace-pre-wrap text-[12px] text-slate-300 bg-slate-900/60 border border-slate-700/60 rounded-lg p-3 max-h-56 overflow-y-auto">
                                <span className="block text-[10px] uppercase tracking-widest text-slate-500 mb-2">
                                  {msg.videoTranscriptLabel || 'Transcript'}
                                </span>
                                {msg.videoTranscript}
                              </pre>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}

                {/* Typing indicator (Chat mode only) */}
                {assistantState === 'processing' && !learnMode && (
                  <div className="flex justify-start">
                    <div className="bg-slate-800/90 text-slate-400 border border-slate-700/50 rounded-2xl rounded-bl-sm px-5 py-3 flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span className="text-sm">Typing...</span>
                    </div>
                  </div>
                )}

                <div ref={chatEndRef} />
              </div>

              {/* Input bar */}
              <div className="p-4 border-t border-slate-700/50">
                {learnMode && (
                  <div className="mb-3 rounded-2xl border border-emerald-700/40 bg-emerald-900/20 px-4 py-3">
                    <div className="flex flex-wrap items-center gap-3 justify-between">
                      <div>
                        <p className="text-xs uppercase tracking-widest text-emerald-300 font-semibold">Quiz Mode</p>
                        <p className="text-[12px] text-emerald-200/80">Choose the correct sign name.</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-[12px] text-emerald-200/80">
                          Score: {quizScore.correct}/{quizScore.total}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const next = !quizEnabled;
                            setQuizEnabled(next);
                            if (next) {
                              setQuizScore({ correct: 0, total: 0 });
                              buildQuizQuestion();
                            }
                          }}
                          className={`px-3 py-1.5 text-xs rounded-full font-semibold transition-colors ${quizEnabled
                            ? 'bg-emerald-500 text-slate-900'
                            : 'bg-emerald-800/50 text-emerald-200'}
                          `}
                        >
                          {quizEnabled ? 'On' : 'Off'}
                        </button>
                      </div>
                    </div>

                    {quizEnabled && (
                      <div className="mt-3">
                        <div className="text-sm text-emerald-100 mb-2">
                          {quizQuestion}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {quizOptions.map(option => (
                            <button
                              key={option}
                              type="button"
                              onClick={() => handleQuizAnswer(option)}
                              disabled={quizAnswered}
                              className={`px-3 py-2 text-xs rounded-xl font-medium transition-colors ${
                                quizAnswered
                                  ? option === quizAnswer
                                    ? 'bg-emerald-500 text-slate-900'
                                    : 'bg-emerald-900/50 text-emerald-200'
                                  : 'bg-emerald-800/60 hover:bg-emerald-700/60 text-emerald-100'
                              }`}
                            >
                              {option.toUpperCase()}
                            </button>
                          ))}
                        </div>

                        <div className="mt-2 flex items-center gap-3">
                          {quizFeedback && (
                            <div className="text-xs text-emerald-200/90">{quizFeedback}</div>
                          )}
                          {quizAnswered && (
                            <button
                              type="button"
                              onClick={handleQuizNext}
                              className="ml-auto px-3 py-1.5 text-xs rounded-full font-semibold bg-emerald-700/70 hover:bg-emerald-600 text-emerald-100"
                            >
                              Next
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {!learnMode && (
                  <div className="mb-3 flex flex-col sm:flex-row gap-2">
                    <input
                      type="url"
                      value={videoUrlInput}
                      onChange={e => setVideoUrlInput(e.target.value)}
                      placeholder="Paste video URL (YouTube/Instagram/other)"
                      disabled={!isConnected || isVideoProcessing || assistantState === 'processing'}
                      className="flex-1 bg-slate-800/70 border border-slate-700/60 rounded-xl px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500/60"
                    />
                    <button
                      type="button"
                      onClick={handleVideoUrlSubmit}
                      disabled={!videoUrlInput.trim() || !isConnected || isVideoProcessing || assistantState === 'processing'}
                      className="px-4 py-2 rounded-xl text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white disabled:bg-slate-700 disabled:text-slate-500"
                    >
                      {isVideoProcessing ? 'Processing...' : 'Analyze URL'}
                    </button>
                    <button
                      type="button"
                      onClick={() => videoFileInputRef.current?.click()}
                      disabled={!isConnected || isVideoProcessing || assistantState === 'processing'}
                      className="px-4 py-2 rounded-xl text-sm font-medium bg-slate-700/80 hover:bg-slate-600 text-slate-100 disabled:bg-slate-700 disabled:text-slate-500"
                    >
                      Upload Video
                    </button>
                    <input
                      ref={videoFileInputRef}
                      type="file"
                      accept="video/*"
                      onChange={handleVideoFileSelected}
                      className="hidden"
                    />
                  </div>
                )}

                {!learnMode && isVideoProcessing && videoProgress > 0 && (
                  <div className="mb-3">
                    <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                      <span>Video processing</span>
                      <span>{videoStage ? videoStage : 'Working'} · {videoProgress}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-800/80 overflow-hidden border border-slate-700/60">
                      <div
                        className="h-full bg-gradient-to-r from-indigo-500 via-indigo-400 to-indigo-500 transition-all duration-300"
                        style={{ width: `${videoProgress}%` }}
                      />
                    </div>
                  </div>
                )}

                <form
                  onSubmit={handleSubmit}
                  className={`
                    flex items-center gap-2 bg-slate-800/60 rounded-full border px-4 py-2 transition-colors duration-300
                    ${learnMode ? 'border-emerald-600/40' : 'border-slate-700/50'}
                  `}
                >
                  <input
                    type="text"
                    value={activeTextInput}
                    onChange={e => learnMode ? setLearnTextInput(e.target.value) : setChatTextInput(e.target.value)}
                    placeholder={placeholder}
                    disabled={inputDisabled}
                    className="flex-1 bg-transparent py-1 text-slate-200 focus:outline-none placeholder:text-slate-500 text-sm"
                    autoFocus
                  />

                  {/* Mic — only visible in Chat mode */}
                  {!learnMode && (
                    <button
                      type="button"
                      onClick={handleMicToggle}
                      disabled={!isConnected || assistantState === 'processing'}
                      title={isListening ? 'Stop listening' : 'Speak your message'}
                      className={`
                        p-2 rounded-full transition-all flex items-center justify-center
                        ${isListening
                          ? 'bg-red-500 hover:bg-red-400 text-white animate-pulse'
                          : 'bg-emerald-600/80 hover:bg-emerald-500 text-white'}
                        disabled:bg-slate-700 disabled:text-slate-500
                      `}
                    >
                      {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                    </button>
                  )}

                  {/* Submit */}
                  <button
                    type="submit"
                    disabled={!activeTextInput.trim() || inputDisabled}
                    className={`
                      p-2 text-white rounded-full transition-colors flex items-center justify-center
                      disabled:bg-slate-700 disabled:text-slate-500
                      ${learnMode
                        ? 'bg-emerald-600 hover:bg-emerald-500'
                        : 'bg-indigo-600 hover:bg-indigo-500'}
                    `}
                    title={submitLabel}
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>

                <p className="text-[10px] text-slate-600 text-center mt-2">
                  <kbd className="font-mono bg-slate-800/80 px-1 rounded">Enter</kbd> to {learnMode ? 'translate' : 'send'}
                  {' · '}
                  <kbd className="font-mono bg-slate-800/80 px-1 rounded">Ctrl+L</kbd> to switch modes
                  {!learnMode && ' · Add video URL/upload for transcription + summary'}
                </p>
              </div>
            </div>

            {/* 3D Sign Language Player — only visible in Learn mode when signs are ready */}
            {showSignPanel && (
              <div className="w-96 shrink-0 h-full bg-slate-900/80 border-l border-slate-700/60 shadow-xl flex flex-col overflow-hidden">
                <div className="bg-slate-800/80 px-4 py-4 flex items-center justify-center border-b border-slate-700/60 shadow-md">
                  <span className="font-bold text-slate-200 uppercase tracking-widest text-xs flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    ASL Sign Language (3D)
                  </span>
                </div>
                <div className="flex-1 p-4">
                  <JASigningPlayer
                    sigml={sigmlXml}
                    className="w-full h-full"
                    autoPlay={true}
                  />
                </div>
              </div>
            )}

          </div>
        </div>
      </div>

      {/* Error toast */}
      {error && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-red-900/80 text-white px-5 py-3 rounded-xl shadow-lg backdrop-blur-sm flex items-center gap-3 z-50">
          <span className="text-sm">{error}</span>
          <button onClick={() => setError(null)} className="text-white/70 hover:text-white text-lg leading-none">×</button>
        </div>
      )}
    </div>
  );
};

export default DeafInterface;
