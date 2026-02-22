/**
 * Vocalis REST API Client
 *
 * Provides typed methods for calling POST /visual and POST /deaf.
 * Both modes are stateless — conversation history is managed here on the client.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type HistoryMessage = {
    role: 'user' | 'assistant';
    content: string;
};

export type VisualAPIResponse = {
    /** What the user said (transcribed from audio or echo of text input) */
    transcript: string;
    /** AI's text response */
    response_text: string;
    /** Base64-encoded WAV audio of the AI's spoken reply */
    audio_base64: string;
    /** Updated conversation history — store and pass on the next call */
    conversation_history: HistoryMessage[];
};

export type DeafAPIResponse = {
    /** AI's text response */
    response_text: string;
    /** ASL tokens to animate (e.g. ['HELLO', 'HOW', 'YOU']) */
    sign_tokens: string[];
    /** SiGML XML for JASigning 3D avatar (optional, present when generate_signs=true) */
    sigml_xml?: string;
    /** Base64-encoded WAV audio (only present if include_audio was true) */
    audio_base64?: string;
    /** Updated conversation history — store and pass on the next call */
    conversation_history: HistoryMessage[];
};

export type SiGMLResponse = {
    /** SiGML XML document */
    sigml: string;
    /** Original tokens requested */
    tokens: string[];
    /** 'success' or 'partial' if some tokens were fingerspelled */
    status: string;
};

export type HybridSignData = {
    /** Method used: 'video' | 'sigml' | 'fingerspell' */
    method: string;
    /** Video URL if method is 'video' */
    video_url?: string;
    /** SiGML XML if method is 'sigml' or 'fingerspell' */
    sigml?: string;
    /** Original token */
    token: string;
    /** Status: 'success' or 'fallback' */
    status: string;
};

export type HybridSignResponse = {
    /** Array of sign data for each token */
    signs: HybridSignData[];
    /** Statistics about the generation */
    statistics: {
        total: number;
        video: number;
        sigml: number;
        fingerspell: number;
    };
};

export type SignCoverageStats = {
    video_library_size: number;
    sigml_lexicon_size: number;
    total_coverage: number;
    available_videos: string[];
};

// ─── Client class ─────────────────────────────────────────────────────────────

class APIClient {
    private baseUrl: string;

    constructor(baseUrl = 'http://localhost:8000') {
        this.baseUrl = baseUrl;
    }

    // ── Visual Mode ─────────────────────────────────────────────────────────────

    /**
     * Call POST /visual with a recorded audio blob.
     * The server transcribes the audio, calls the LLM, and returns TTS audio.
     *
     * @param audioBlob    WAV blob recorded by MediaRecorder or audioService
     * @param history      Previous conversation turns (empty on first call)
     * @returns VisualAPIResponse including the updated history
     */
    async sendVisualAudio(
        audioBlob: Blob,
        history: HistoryMessage[] = []
    ): Promise<VisualAPIResponse> {
        const form = new FormData();
        form.append('audio', audioBlob, 'recording.wav');
        form.append('conversation_history', JSON.stringify(history));

        const resp = await fetch(`${this.baseUrl}/visual`, {
            method: 'POST',
            body: form,
        });

        if (!resp.ok) {
            const detail = await resp.text().catch(() => resp.statusText);
            throw new Error(`[/visual] ${resp.status}: ${detail}`);
        }

        return resp.json() as Promise<VisualAPIResponse>;
    }

    /**
     * Call POST /visual with plain text.
     * Useful for testing or when voice recording is not available.
     *
     * @param text     User's message
     * @param history  Previous conversation turns
     */
    async sendVisualText(
        text: string,
        history: HistoryMessage[] = []
    ): Promise<VisualAPIResponse> {
        const form = new FormData();
        form.append('text', text);
        form.append('conversation_history', JSON.stringify(history));

        const resp = await fetch(`${this.baseUrl}/visual`, {
            method: 'POST',
            body: form,
        });

        if (!resp.ok) {
            const detail = await resp.text().catch(() => resp.statusText);
            throw new Error(`[/visual] ${resp.status}: ${detail}`);
        }

        return resp.json() as Promise<VisualAPIResponse>;
    }

    // ── Deaf Mode ───────────────────────────────────────────────────────────────

    /**
     * Call POST /deaf with typed text.
     * Returns the AI's text response + ASL sign tokens.
     *
     * @param text          User's typed message
     * @param history       Previous conversation turns
     * @param includeAudio  If true, response includes base64 TTS audio
     */
    async sendDeafText(
        text: string,
        history: HistoryMessage[] = [],
        includeAudio = false
    ): Promise<DeafAPIResponse> {
        const form = new FormData();
        form.append('text', text);
        form.append('conversation_history', JSON.stringify(history));
        form.append('include_audio', includeAudio.toString());

        const resp = await fetch(`${this.baseUrl}/deaf`, {
            method: 'POST',
            body: form,
        });

        if (!resp.ok) {
            const detail = await resp.text().catch(() => resp.statusText);
            throw new Error(`[/deaf] ${resp.status}: ${detail}`);
        }

        return resp.json() as Promise<DeafAPIResponse>;
    }

    /**
     * Call POST /deaf with audio (browser Speech API alternative).
     * The server transcribes the audio then treats it as a text message.
     *
     * @param audioBlob     WAV blob
     * @param history       Previous conversation turns
     * @param includeAudio  If true, response includes base64 TTS audio
     */
    async sendDeafAudio(
        audioBlob: Blob,
        history: HistoryMessage[] = [],
        includeAudio = false
    ): Promise<DeafAPIResponse> {
        const form = new FormData();
        form.append('audio', audioBlob, 'recording.wav');
        form.append('conversation_history', JSON.stringify(history));
        form.append('include_audio', includeAudio.toString());

        const resp = await fetch(`${this.baseUrl}/deaf`, {
            method: 'POST',
            body: form,
        });

        if (!resp.ok) {
            const detail = await resp.text().catch(() => resp.statusText);
            throw new Error(`[/deaf] ${resp.status}: ${detail}`);
        }

        return resp.json() as Promise<DeafAPIResponse>;
    }

    // ── SiGML / JASigning Methods ───────────────────────────────────────────────

    /**
     * Generate SiGML XML from ASL tokens.
     * Used for JASigning 3D avatar rendering.
     *
     * @param tokens    Array of ASL tokens (e.g. ['HELLO', 'HOW', 'YOU'])
     * @returns SiGML XML document and status
     */
    async generateSiGML(tokens: string[]): Promise<SiGMLResponse> {
        const resp = await fetch(`${this.baseUrl}/generate-sigml`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tokens }),
        });

        if (!resp.ok) {
            const detail = await resp.text().catch(() => resp.statusText);
            throw new Error(`[/generate-sigml] ${resp.status}: ${detail}`);
        }

        return resp.json() as Promise<SiGMLResponse>;
    }

    /**
     * Get hybrid sign sequence data.
     * Intelligently chooses between real videos, SiGML, and fingerspelling.
     *
     * @param tokens    Array of ASL tokens
     * @returns Hybrid sign data with method and content for each token
     */
    async getHybridSignSequence(tokens: string[]): Promise<HybridSignResponse> {
        const resp = await fetch(`${this.baseUrl}/hybrid-sign-sequence`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tokens }),
        });

        if (!resp.ok) {
            const detail = await resp.text().catch(() => resp.statusText);
            throw new Error(`[/hybrid-sign-sequence] ${resp.status}: ${detail}`);
        }

        return resp.json() as Promise<HybridSignResponse>;
    }

    /**
     * Get sign coverage statistics.
     * Returns counts for video library, SiGML lexicon, and total coverage.
     */
    async getSignCoverage(): Promise<SignCoverageStats> {
        const resp = await fetch(`${this.baseUrl}/sign-coverage`);

        if (!resp.ok) {
            const detail = await resp.text().catch(() => resp.statusText);
            throw new Error(`[/sign-coverage] ${resp.status}: ${detail}`);
        }

        return resp.json() as Promise<SignCoverageStats>;
    }

    /**
     * Get SiGML lexicon statistics.
     */
    async getSiGMLStats(): Promise<{ lexicon_size: number; status: string }> {
        const resp = await fetch(`${this.baseUrl}/sigml-stats`);

        if (!resp.ok) {
            const detail = await resp.text().catch(() => resp.statusText);
            throw new Error(`[/sigml-stats] ${resp.status}: ${detail}`);
        }

        return resp.json();
    }

    // ── Utility ─────────────────────────────────────────────────────────────────

    /**
     * Decode a base64 WAV string into an AudioBuffer and play it.
     * Uses the provided AudioContext so it integrates cleanly with the app's
     * existing TTS scheduler (audioService) or a standalone AudioContext.
     *
     * @param base64Audio   Base64-encoded WAV from VisualAPIResponse.audio_base64
     * @param ctx           An (already-resumed) AudioContext
     */
    async playBase64Audio(base64Audio: string, ctx: AudioContext): Promise<void> {
        const binary = atob(base64Audio);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

        const audioBuffer = await ctx.decodeAudioData(bytes.buffer);
        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(ctx.destination);
        source.start();

        return new Promise((resolve) => {
            source.onended = () => resolve();
        });
    }
}

// Singleton — import and use `apiClient` directly
export const apiClient = new APIClient();
export default apiClient;
