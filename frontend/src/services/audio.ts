/**
 * Audio Service
 *
 * Handles audio recording, processing, and playback.
 * TTS playback uses a deterministic timeline scheduler with:
 * - Session IDs to reject stale chunks
 * - Ordered decode queue to preserve arrival order
 * - pendingChunks incremented before decode (no TTS_END race)
 * - Pre-TTS_START chunk buffering (no silent drops)
 * - Drift detection logging
 */

import websocketService, { WebSocketService } from './websocket';

// Audio configuration
interface AudioConfig {
  sampleRate: number;
  channelCount: number;
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
  bufferSize: number;
}

const DEFAULT_CONFIG: AudioConfig = {
  sampleRate: 44100,
  channelCount: 1,
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  bufferSize: 4096
};

export enum AudioState {
  INACTIVE = 'inactive',
  RECORDING = 'recording',
  PLAYING = 'playing',
  SPEAKING = 'speaking',
  INTERRUPTED = 'interrupted'
}

export enum AudioEvent {
  RECORDING_START = 'recording_start',
  RECORDING_STOP = 'recording_stop',
  RECORDING_DATA = 'recording_data',
  PLAYBACK_START = 'playback_start',
  PLAYBACK_STOP = 'playback_stop',
  PLAYBACK_END = 'playback_end',
  AUDIO_ERROR = 'audio_error',
  AUDIO_STATE_CHANGE = 'audio_state_change'
}

type AudioEventListener = (data: any) => void;

export class AudioService {
  private config: AudioConfig;
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private mediaStreamSource: MediaStreamAudioSourceNode | null = null;
  private scriptProcessor: ScriptProcessorNode | null = null;
  private recordingIntervalId: number | null = null;
  private audioBuffer: Float32Array[] = [];
  private audioState: AudioState = AudioState.INACTIVE;
  private eventListeners: Map<AudioEvent, AudioEventListener[]> = new Map();
  private isMuted: boolean = false;

  // --- TTS Scheduler State ---
  private ttsSessionId: string = '';          // Unique per TTS_START; rejects stale chunks
  private nextPlaybackTime: number = 0;
  private ttsActive: boolean = false;
  private ttsEndReceived: boolean = false;
  private pendingChunks: number = 0;          // Incremented BEFORE decode, not after
  private activeSources: Set<AudioBufferSourceNode> = new Set();
  private ttsSessionStartTime: number = 0;
  private isSpeaking: boolean = false;

  // Pre-start buffer: chunks that arrived before TTS_START
  private preStartBuffer: Array<{ arrayBuffer: ArrayBuffer; sessionId: string }> = [];

  // Ordered decode queue: ensures chunks schedule in arrival order regardless of decode speed
  private decodeChainPromise: Promise<void> = Promise.resolve();
  private chunkArrivalCounter: number = 0;
  private driftResetCount: number = 0;

  // UI state flags (set by UI layer to suppress interrupts during critical moments)
  private isProcessing: boolean = false;
  private isGreeting: boolean = false;
  private isVisionProcessing: boolean = false;

  // Voice detection
  private isVoiceDetected: boolean = false;
  private voiceThreshold: number = 0.01;
  private silenceTimeout: number = 1000;
  private lastVoiceTime: number = 0;
  private minRecordingLength: number = 1000;

  constructor(config: Partial<AudioConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ---------------------------------------------------------------------------
  // UI State Setters
  // ---------------------------------------------------------------------------

  public setProcessingState(isProcessing: boolean): void {
    this.isProcessing = isProcessing;
    console.log(`[AudioService] Processing state: ${isProcessing}`);
  }

  public setGreetingState(isGreeting: boolean): void {
    this.isGreeting = isGreeting;
    console.log(`[AudioService] Greeting state: ${isGreeting}`);
  }

  public setVisionProcessingState(isVisionProcessing: boolean): void {
    this.isVisionProcessing = isVisionProcessing;
    console.log(`[AudioService] Vision processing state: ${isVisionProcessing}`);
  }

  // ---------------------------------------------------------------------------
  // AudioContext Lifecycle
  // ---------------------------------------------------------------------------

  private async initAudioContext(): Promise<void> {
    if (!this.audioContext) {
      console.log('[AudioService] Creating new AudioContext');
      try {
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
          sampleRate: this.config.sampleRate
        });
      } catch (error) {
        console.error('[AudioService] Failed to create AudioContext', error);
        this.dispatchEvent(AudioEvent.AUDIO_ERROR, { error });
        throw error;
      }
    }

    if (this.audioContext.state === 'suspended') {
      console.log('[AudioService] Resuming suspended AudioContext');
      try {
        await this.audioContext.resume();
      } catch (error) {
        console.error('[AudioService] Failed to resume AudioContext', error);
        this.audioContext = null;
        return this.initAudioContext();
      }
    } else if (this.audioContext.state === 'closed') {
      console.log('[AudioService] AudioContext was closed, creating new one');
      this.audioContext = null;
      return this.initAudioContext();
    }

    console.log(`[AudioService] AudioContext ready. State: ${this.audioContext.state}`);
  }

  // ---------------------------------------------------------------------------
  // Recording
  // ---------------------------------------------------------------------------

  public async startRecording(): Promise<void> {
    if (this.audioState === AudioState.RECORDING) {
      console.log('[AudioService] Already recording');
      return;
    }

    try {
      await this.initAudioContext();

      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: this.config.sampleRate,
          channelCount: this.config.channelCount,
          echoCancellation: this.config.echoCancellation,
          noiseSuppression: this.config.noiseSuppression,
          autoGainControl: this.config.autoGainControl
        }
      });

      if (this.isMuted && this.mediaStream) {
        this.mediaStream.getAudioTracks().forEach(track => { track.enabled = false; });
      }

      if (this.audioContext) {
        this.mediaStreamSource = this.audioContext.createMediaStreamSource(this.mediaStream);
        this.scriptProcessor = this.audioContext.createScriptProcessor(
          this.config.bufferSize,
          this.config.channelCount,
          this.config.channelCount
        );

        this.mediaStreamSource.connect(this.scriptProcessor);
        this.scriptProcessor.connect(this.audioContext.destination);
        this.scriptProcessor.onaudioprocess = this.handleAudioProcess.bind(this);

        this.audioBuffer = [];
        this.audioState = AudioState.RECORDING;
        this.isVoiceDetected = false;
        this.lastVoiceTime = 0;

        console.log(`[AudioService] Recording started. Voice threshold: ${this.voiceThreshold}`);
        this.dispatchEvent(AudioEvent.RECORDING_START, {});
      }
    } catch (error) {
      console.error('[AudioService] Error starting recording:', error);
      this.dispatchEvent(AudioEvent.AUDIO_ERROR, { error });
      this.stopRecording();
      throw error;
    }
  }

  public stopRecording(): void {
    if (this.audioState !== AudioState.RECORDING) return;

    if (this.recordingIntervalId !== null) {
      clearInterval(this.recordingIntervalId);
      this.recordingIntervalId = null;
    }

    if (this.scriptProcessor) {
      this.scriptProcessor.disconnect();
      this.scriptProcessor = null;
    }
    if (this.mediaStreamSource) {
      this.mediaStreamSource.disconnect();
      this.mediaStreamSource = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }

    this.sendAudioChunk();

    this.audioState = AudioState.INACTIVE;
    this.audioBuffer = [];
    this.dispatchEvent(AudioEvent.RECORDING_STOP, {});
    console.log('[AudioService] Recording stopped');
  }

  private calculateRMSEnergy(buffer: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i];
    return Math.sqrt(sum / buffer.length);
  }

  private handleAudioProcess(event: AudioProcessingEvent): void {
    const inputData = event.inputBuffer.getChannelData(0);
    const bufferCopy = new Float32Array(inputData.length);
    bufferCopy.set(inputData);

    const energy = this.calculateRMSEnergy(bufferCopy);
    const inProtectedState = this.isProcessing || this.isVisionProcessing || this.isGreeting || this.isSpeaking || this.audioState === AudioState.SPEAKING;

    if (energy > this.voiceThreshold) {
      if (inProtectedState) {
        let state = this.isGreeting ? 'greeting' : this.isVisionProcessing ? 'vision_processing' : this.isSpeaking ? 'speaking' : 'processing';
        console.log(`[AudioService] Voice detected during ${state} (energy: ${energy.toFixed(4)}), ignoring`);
        this.dispatchEvent(AudioEvent.RECORDING_DATA, { buffer: bufferCopy, energy, isVoice: false });
        return;
      }

      if (!this.isVoiceDetected) {
        console.log(`[AudioService] Voice detected, energy: ${energy}`);
        this.isVoiceDetected = true;
        // Interrupt logic removed to enforce strict half-duplex
      }
      this.lastVoiceTime = Date.now();
    }

    if (inProtectedState) {
      this.dispatchEvent(AudioEvent.RECORDING_DATA, { buffer: bufferCopy, energy, isVoice: false });
      return;
    }

    if (this.isVoiceDetected) {
      this.audioBuffer.push(bufferCopy);

      const timeSinceVoice = Date.now() - this.lastVoiceTime;
      if (energy <= this.voiceThreshold && timeSinceVoice > this.silenceTimeout) {
        console.log('[AudioService] Silence timeout — sending audio chunk');
        this.isVoiceDetected = false;
        this.sendAudioChunk();
      }
    }

    this.dispatchEvent(AudioEvent.RECORDING_DATA, { buffer: bufferCopy, energy, isVoice: this.isVoiceDetected });
  }

  private float32ToWav(buffer: Float32Array, sampleRate: number): ArrayBuffer {
    const numChannels = 1;
    const bytesPerSample = 2;
    const dataSize = buffer.length * bytesPerSample;
    const wavBuffer = new ArrayBuffer(44 + dataSize);
    const wavView = new DataView(wavBuffer);

    this.writeString(wavView, 0, 'RIFF');
    wavView.setUint32(4, 36 + dataSize, true);
    this.writeString(wavView, 8, 'WAVE');
    this.writeString(wavView, 12, 'fmt ');
    wavView.setUint32(16, 16, true);
    wavView.setUint16(20, 1, true);
    wavView.setUint16(22, numChannels, true);
    wavView.setUint32(24, sampleRate, true);
    wavView.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
    wavView.setUint16(32, numChannels * bytesPerSample, true);
    wavView.setUint16(34, bytesPerSample * 8, true);
    this.writeString(wavView, 36, 'data');
    wavView.setUint32(40, dataSize, true);

    for (let i = 0; i < buffer.length; i++) {
      const sample = Math.max(-1.0, Math.min(1.0, buffer[i]));
      wavView.setInt16(44 + i * bytesPerSample, sample < 0 ? sample * 32768 : sample * 32767, true);
    }

    return wavBuffer;
  }

  private writeString(view: DataView, offset: number, string: string): void {
    for (let i = 0; i < string.length; i++) view.setUint8(offset + i, string.charCodeAt(i));
  }

  private sendAudioChunk(): void {
    if (this.audioBuffer.length === 0) return;

    if (this.isProcessing) {
      console.log('[AudioService] Processing active — discarding audio chunk');
      this.audioBuffer = [];
      return;
    }

    const totalLength = this.audioBuffer.reduce((acc, b) => acc + b.length, 0);
    const audioLengthMs = (totalLength / this.config.sampleRate) * 1000;

    if (!this.isVoiceDetected && audioLengthMs < this.minRecordingLength) {
      console.log(`[AudioService] Audio too short (${audioLengthMs.toFixed(0)}ms) — discarding`);
      this.audioBuffer = [];
      return;
    }

    const combined = new Float32Array(totalLength);
    let offset = 0;
    for (const buf of this.audioBuffer) { combined.set(buf, offset); offset += buf.length; }

    console.log(`[AudioService] Sending audio chunk: ${audioLengthMs.toFixed(0)}ms`);
    websocketService.sendAudio(this.float32ToWav(combined, this.config.sampleRate));
    this.audioBuffer = [];
  }

  // ---------------------------------------------------------------------------
  // TTS Lifecycle — Public API
  // ---------------------------------------------------------------------------

  /**
   * Signal that a TTS session is beginning.
   * Resets timeline anchor and scheduler state.
   * Any chunks buffered before this call are flushed through the scheduler.
   */
  public handleTtsStart(): void {
    if (!this.audioContext) {
      // AudioContext may not be initialized yet — queue start for after init
      this.initAudioContext().then(() => this.handleTtsStart());
      return;
    }

    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(err => console.error('[AudioService] Resume failed:', err));
    }

    // Generate new session ID — any chunk referencing an old session ID is rejected
    this.ttsSessionId = crypto.randomUUID();
    this.nextPlaybackTime = this.audioContext.currentTime;
    this.ttsSessionStartTime = this.audioContext.currentTime;
    this.ttsActive = true;
    this.ttsEndReceived = false;
    this.pendingChunks = 0;
    this.chunkArrivalCounter = 0;
    this.driftResetCount = 0;

    // Reset decode chain so new session starts fresh
    this.decodeChainPromise = Promise.resolve();

    // Stop any sources from previous session
    this.stopAllActiveSources();

    this.isSpeaking = true;
    this.audioState = AudioState.SPEAKING;

    console.log(`[AudioService] TTS session started. ID: ${this.ttsSessionId}, anchor: ${this.nextPlaybackTime.toFixed(3)}s`);

    // Flush any chunks that arrived before TTS_START
    if (this.preStartBuffer.length > 0) {
      console.log(`[AudioService] Flushing ${this.preStartBuffer.length} pre-start buffered chunks`);
      const toFlush = [...this.preStartBuffer];
      this.preStartBuffer = [];
      for (const entry of toFlush) {
        this._enqueueChunk(entry.arrayBuffer, this.ttsSessionId);
      }
    }
  }

  /**
   * Signal that the backend has finished sending TTS chunks.
   */
  public handleTtsEnd(): void {
    this.ttsEndReceived = true;
    console.log(`[AudioService] TTS_END received. Pending chunks: ${this.pendingChunks}`);
    this.checkForCompletion();
  }

  /**
   * Play an incoming audio chunk, expressed as base64.
   * Safe to call before handleTtsStart() — chunk will be buffered.
   */
  public async playAudioChunk(base64AudioChunk: string, _format: string = 'wav'): Promise<void> {
    try {
      await this.initAudioContext();

      const arrayBuffer = WebSocketService.base64ToArrayBuffer(base64AudioChunk);
      console.log(`[AudioService] Chunk received: ${arrayBuffer.byteLength} bytes`);

      if (!this.ttsActive) {
        // TTS_START not yet received — buffer it rather than silently dropping
        console.warn('[AudioService] TTS not active — buffering chunk for post-start flush');
        this.preStartBuffer.push({ arrayBuffer, sessionId: '' });
        return;
      }

      this._enqueueChunk(arrayBuffer, this.ttsSessionId);
    } catch (error) {
      console.error('[AudioService] Error processing audio chunk:', error);
      this.dispatchEvent(AudioEvent.AUDIO_ERROR, { error });
    }
  }

  // ---------------------------------------------------------------------------
  // TTS Scheduler — Internal
  // ---------------------------------------------------------------------------

  /**
   * Enqueue a chunk into the ordered decode pipeline.
   *
   * Correctness invariant: each chunk is decoded and scheduled only after
   * the previous chunk's decode+schedule has completed, regardless of how fast
   * the browser's decodeAudioData resolves. This eliminates out-of-order scheduling.
   *
   * pendingChunks is incremented HERE (before decode) so that a TTS_END arriving
   * while a chunk is still decoding never prematurely fires completion.
   */
  private _enqueueChunk(arrayBuffer: ArrayBuffer, sessionId: string): void {
    const arrivalIndex = this.chunkArrivalCounter++;

    // Claim the pending slot immediately — before any async work
    this.pendingChunks++;
    console.log(`[AudioService] Chunk #${arrivalIndex} enqueued. Pending: ${this.pendingChunks}`);

    // Chain onto the decode promise so decode+schedule order == arrival order
    this.decodeChainPromise = this.decodeChainPromise.then(async () => {
      // Reject stale chunks from a previous session
      if (sessionId !== this.ttsSessionId) {
        console.warn(`[AudioService] Chunk #${arrivalIndex} rejected — session mismatch (expected ${this.ttsSessionId}, got ${sessionId})`);
        this.pendingChunks--;
        this.checkForCompletion();
        return;
      }

      if (!this.audioContext) {
        console.error(`[AudioService] Chunk #${arrivalIndex} dropped — no AudioContext`);
        this.pendingChunks--;
        this.checkForCompletion();
        return;
      }

      try {
        const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
        this._scheduleBuffer(audioBuffer, arrivalIndex, sessionId);
      } catch (error) {
        console.error(`[AudioService] Chunk #${arrivalIndex} decode failed:`, error);
        this.pendingChunks--;
        this.dispatchEvent(AudioEvent.AUDIO_ERROR, { error });
        this.checkForCompletion();
      }
    });
  }

  /**
   * Place a decoded AudioBuffer onto the deterministic timeline.
   * nextPlaybackTime advances by buffer.duration after each placement.
   */
  private _scheduleBuffer(audioBuffer: AudioBuffer, arrivalIndex: number, sessionId: string): void {
    if (!this.audioContext) return;

    // Final session check after the async decode
    if (sessionId !== this.ttsSessionId) {
      console.warn(`[AudioService] Chunk #${arrivalIndex} dropped after decode — session changed`);
      this.pendingChunks--;
      this.checkForCompletion();
      return;
    }

    // Guard against scheduling in the past
    if (this.nextPlaybackTime < this.audioContext.currentTime) {
      const drift = this.audioContext.currentTime - this.nextPlaybackTime;
      this.driftResetCount++;
      console.warn(
        `[AudioService] Timeline drift on chunk #${arrivalIndex}: ${drift.toFixed(3)}s behind. ` +
        `Resetting to now. Total drift resets this session: ${this.driftResetCount}`
      );
      this.nextPlaybackTime = this.audioContext.currentTime;
    }

    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.audioContext.destination);
    source.start(this.nextPlaybackTime);

    const scheduledAt = this.nextPlaybackTime;
    this.nextPlaybackTime += audioBuffer.duration;
    this.activeSources.add(source);

    console.log(
      `[AudioService] Chunk #${arrivalIndex} scheduled at ${scheduledAt.toFixed(3)}s, ` +
      `duration: ${audioBuffer.duration.toFixed(3)}s, next: ${this.nextPlaybackTime.toFixed(3)}s`
    );

    if (this.pendingChunks === 1 && this.activeSources.size === 1) {
      this.dispatchEvent(AudioEvent.PLAYBACK_START, {});
    }

    source.onended = () => {
      this.activeSources.delete(source);
      this.pendingChunks--;
      console.log(`[AudioService] Chunk #${arrivalIndex} ended. Pending: ${this.pendingChunks}, TTS ended: ${this.ttsEndReceived}`);
      this.checkForCompletion();
    };
  }

  /**
   * TTS is complete when both:
   * 1. Backend has signalled TTS_END
   * 2. All scheduled chunks have finished playing (pendingChunks === 0)
   */
  private checkForCompletion(): void {
    if (this.ttsEndReceived && this.pendingChunks === 0 && this.ttsActive) {
      this.markTtsComplete();
    }
  }

  private markTtsComplete(): void {
    this.ttsActive = false;
    this.isSpeaking = false;
    this.audioState = AudioState.INACTIVE;

    const totalDuration = this.nextPlaybackTime - this.ttsSessionStartTime;
    console.log(
      `[AudioService] TTS session ${this.ttsSessionId} complete. ` +
      `Duration: ${totalDuration.toFixed(3)}s, drift resets: ${this.driftResetCount}`
    );

    this.dispatchEvent(AudioEvent.PLAYBACK_END, {
      previousState: AudioState.SPEAKING,
      duration: totalDuration,
      sessionId: this.ttsSessionId,
      driftResets: this.driftResetCount
    });
  }

  private stopAllActiveSources(): void {
    this.activeSources.forEach(source => {
      try { source.stop(); } catch (_) { /* already stopped */ }
    });
    this.activeSources.clear();
    // Note: do NOT reset pendingChunks here — stopPlayback() handles that explicitly
  }

  // ---------------------------------------------------------------------------
  // Playback Control — Public API
  // ---------------------------------------------------------------------------

  /**
   * Stop all active TTS playback immediately.
   * Safe to call at any time (e.g., on user interrupt).
   */
  public stopPlayback(): void {
    const previousState = this.audioState;
    const wasInterrupted = this.ttsActive;

    this.stopAllActiveSources();

    // Invalidate current session so any in-flight decode results are rejected
    this.ttsSessionId = '';
    this.ttsActive = false;
    this.ttsEndReceived = false;
    this.pendingChunks = 0;
    this.preStartBuffer = [];

    // Reset decode chain so next session starts clean
    this.decodeChainPromise = Promise.resolve();

    this.audioState = previousState === AudioState.SPEAKING
      ? AudioState.INTERRUPTED
      : AudioState.INACTIVE;

    this.isSpeaking = false;

    this.dispatchEvent(AudioEvent.PLAYBACK_STOP, {
      interrupted: wasInterrupted,
      previousState
    });

    console.log('[AudioService] Playback stopped');
  }

  // ---------------------------------------------------------------------------
  // Hardware Release
  // ---------------------------------------------------------------------------

  public releaseHardware(): void {
    console.log('[AudioService] Releasing all hardware...');

    this.stopRecording();
    this.stopPlayback();

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => { track.stop(); track.enabled = false; });
      this.mediaStream = null;
    }
    if (this.scriptProcessor) { this.scriptProcessor.disconnect(); this.scriptProcessor = null; }
    if (this.mediaStreamSource) { this.mediaStreamSource.disconnect(); this.mediaStreamSource = null; }

    if (this.audioContext?.state === 'running') {
      this.audioContext.suspend().catch(err => console.error('[AudioService] Suspend error:', err));
    }

    this.audioState = AudioState.INACTIVE;
    this.isVoiceDetected = false;
    this.audioBuffer = [];
    this.isSpeaking = false;

    console.log('[AudioService] Hardware released');
  }

  // ---------------------------------------------------------------------------
  // Microphone Mute
  // ---------------------------------------------------------------------------

  public isMicrophoneMuted(): boolean { return this.isMuted; }

  public toggleMicrophoneMute(): boolean {
    this.isMuted = !this.isMuted;

    if (this.mediaStream) {
      this.mediaStream.getAudioTracks().forEach(track => { track.enabled = !this.isMuted; });
      console.log(`[AudioService] Microphone ${this.isMuted ? 'muted' : 'unmuted'}`);
    }

    this.dispatchEvent(AudioEvent.AUDIO_STATE_CHANGE, { type: 'mute_change', isMuted: this.isMuted });
    return this.isMuted;
  }

  // ---------------------------------------------------------------------------
  // State Accessors
  // ---------------------------------------------------------------------------

  public isCurrentlySpeaking(): boolean { return this.isSpeaking; }
  public getAudioState(): AudioState { return this.audioState; }

  /**
   * Returns the current audio clock time.
   * Use this (not Date.now()) as the reference when scheduling sign animations,
   * so animation stays locked to the same clock as audio.
   */
  public getAudioClock(): number {
    return this.audioContext?.currentTime ?? 0;
  }

  /**
   * Returns how far into the future the next chunk will start,
   * relative to the audio clock. Useful for animation pre-scheduling.
   */
  public getSchedulerHeadroom(): number {
    if (!this.audioContext) return 0;
    return Math.max(0, this.nextPlaybackTime - this.audioContext.currentTime);
  }

  // ---------------------------------------------------------------------------
  // Event System
  // ---------------------------------------------------------------------------

  public addEventListener(event: AudioEvent, callback: AudioEventListener): void {
    if (!this.eventListeners.has(event)) this.eventListeners.set(event, []);
    this.eventListeners.get(event)!.push(callback);
  }

  public removeEventListener(event: AudioEvent, callback: AudioEventListener): void {
    if (!this.eventListeners.has(event)) return;
    this.eventListeners.set(
      event,
      (this.eventListeners.get(event) || []).filter(l => l !== callback)
    );
  }

  private dispatchEvent(event: AudioEvent, data: any): void {
    const listeners = this.eventListeners.get(event) || [];
    listeners.forEach(listener => {
      try { listener(data); } catch (error) { console.error(`[AudioService] Error in ${event} listener:`, error); }
    });
  }
}

const audioService = new AudioService();
export default audioService;
