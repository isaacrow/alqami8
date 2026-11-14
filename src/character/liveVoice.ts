import { LipSync } from './lipSync';

/**
 * A live spoken conversation with Gemini (the Live API over one WebSocket): the microphone streams in as 16 kHz PCM,
 * the server decides when the visitor has finished speaking, and the answer streams back as 24 kHz PCM that starts
 * playing with the first chunk. That single round trip is what makes the answers quick.
 *
 * Optional: his cloned voice from a voice server (the owner's PC runs it, see docs/jawahiri-voice.md), or an
 * ElevenLabs voice. Gemini still listens and thinks; its words (the output transcript) are spoken by
 * that voice instead of Gemini's own, sentence by sentence. If the voice server cannot be reached, Gemini's own voice
 * speaks instead.
 *
 * ElevenLabs: an ElevenLabs voice. Gemini still listens and thinks; its words (the output transcript) are spoken by the
 * chosen ElevenLabs voice instead of Gemini's own, sentence by sentence. Slower by a few hundred milliseconds.
 *
 * Keys are typed by the visitor on their own device and kept there (localStorage). Nothing is in the site's code.
 */

export const LIVE_MODEL = 'models/gemini-3.8-live';
const LIVE_URL = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';

/** Gemini's prebuilt voices that suit an elderly man of letters, deepest first. */
export const GEMINI_VOICES = [
  { id: 'Algenib', ar: 'أجش عميق', en: 'Gravelly, deep' },
  { id: 'Gacrux', ar: 'ناضج', en: 'Mature' },
  { id: 'Charon', ar: 'رصين', en: 'Informative' },
  { id: 'Orus', ar: 'حازم', en: 'Firm' },
  { id: 'Iapetus', ar: 'صافٍ', en: 'Clear' },
];

export interface VoiceSettings {
  geminiKey: string;
  geminiVoice: string;
  elevenKey: string;
  elevenVoiceId: string;
  /** Base URL of his cloned-voice server (POST /tts → 16-bit PCM). Empty = not used. */
  voiceServer: string;
}

export type VoiceKind = 'gemini' | 'cloned' | 'eleven';

const STORE = 'alqami.character.voice';
export function loadSettings(): VoiceSettings {
  // The site owner's key, built in by the deploy (scripts/set-gemini-key.mjs), so visitors need none.
  const base: VoiceSettings = { geminiKey: import.meta.env.VITE_GEMINI_KEY || '', geminiVoice: GEMINI_VOICES[0].id, elevenKey: '', elevenVoiceId: '', voiceServer: import.meta.env.VITE_VOICE_SERVER || '' };
  try {
    const saved = { ...base, ...JSON.parse(localStorage.getItem(STORE) || '{}') };
    if (!saved.geminiKey) saved.geminiKey = base.geminiKey;
    if (!saved.voiceServer) saved.voiceServer = base.voiceServer;
    return saved;
  } catch {
    return base;
  }
}
export function saveSettings(s: VoiceSettings) {
  try {
    localStorage.setItem(STORE, JSON.stringify(s));
  } catch {
    /* private mode: the settings last for this visit only */
  }
}

export type LiveState = 'idle' | 'connecting' | 'listening' | 'speaking' | 'error' | 'closed';

export interface LiveHandlers {
  onState: (s: LiveState, detail?: string) => void;
  /** Live transcript of what he is saying (accumulates within a turn; `done` when the turn ends). */
  onHisWords: (text: string, done: boolean) => void;
  onVisitorWords: (text: string) => void;
  /** Which voice is speaking (changes to 'gemini' if the cloned-voice server stops answering). */
  onVoice?: (kind: VoiceKind) => void;
}

// Microphone → 16 kHz 16-bit PCM in 40 ms packets. Runs on the audio thread.
const WORKLET = `
class Down extends AudioWorkletProcessor {
  constructor() { super(); this.ratio = sampleRate / 16000; this.acc = 0; this.sum = 0; this.n = 0; this.buf = new Int16Array(640); this.i = 0; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    for (let k = 0; k < ch.length; k++) {
      this.sum += ch[k]; this.n++; this.acc++;
      if (this.acc >= this.ratio) {
        this.acc -= this.ratio;
        const v = Math.max(-1, Math.min(1, this.sum / this.n));
        this.sum = 0; this.n = 0;
        this.buf[this.i++] = v < 0 ? v * 0x8000 : v * 0x7fff;
        if (this.i === this.buf.length) { this.port.postMessage(this.buf.slice(0)); this.i = 0; }
      }
    }
    return true;
  }
}
registerProcessor('alqami-down16k', Down);
`;

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromBase64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
const rms = (pcm: Int16Array) => {
  let sum = 0;
  for (let i = 0; i < pcm.length; i++) sum += (pcm[i] / 32768) ** 2;
  return Math.sqrt(sum / pcm.length);
};

export class LiveConversation {
  private ws: WebSocket | null = null;
  private ctx: AudioContext;
  private out: GainNode;
  /** Read by the character to move his jaw. */
  readonly analyser: AnalyserNode;
  private playing = new Set<AudioBufferSourceNode>();
  private nextTime = 0;
  private mic: MediaStream | null = null;
  private micNode: AudioWorkletNode | null = null;
  private hisWords = '';
  private eleven: { key: string; voice: string } | null;
  private server: string | null;
  private sentenceBuf = '';
  private ttsChain: Promise<void> = Promise.resolve();
  private ttsAborts = new Set<AbortController>();
  private turn = 0;
  private resumeHandle: string | null = null;
  private closedByUs = false;
  muted = false;

  constructor(private settings: VoiceSettings, private instruction: string, private h: LiveHandlers) {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    this.ctx = new AC();
    this.out = this.ctx.createGain();
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.out.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);
    this.eleven = settings.elevenKey && settings.elevenVoiceId ? { key: settings.elevenKey, voice: settings.elevenVoiceId } : null;
    this.server = settings.voiceServer ? settings.voiceServer.replace(/\/+$/, '') : null;
  }

  /** The voice that speaks: his cloned voice, then ElevenLabs, then Gemini's own. */
  get voice(): VoiceKind {
    return this.server ? 'cloned' : this.eleven ? 'eleven' : 'gemini';
  }
  private get external() {
    return this.voice !== 'gemini';
  }

  /** Before connecting: is the cloned-voice server up? If not, Gemini's voice speaks. */
  private async checkServer() {
    if (!this.server) return;
    try {
      const r = await fetch(`${this.server}/health`, { signal: AbortSignal.timeout(3000) });
      if (!r.ok) throw new Error(String(r.status));
    } catch {
      this.server = null;
    }
  }

  /** Call from a tap: unlocks audio, asks for the microphone, then connects. */
  async start(openingCue?: string) {
    this.closedByUs = false;
    await this.ctx.resume();
    // Mouth shapes from his voice as it plays (every voice goes through this.out); the face uses loudness if not.
    if (!this.lips) void LipSync.attach(this.ctx, this.out).then((l) => (this.lips = l), (e) => console.warn('Lip sync off:', e));
    this.h.onState('connecting');
    await this.checkServer();
    this.h.onVoice?.(this.voice);
    this.mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
    const url = URL.createObjectURL(new Blob([WORKLET], { type: 'text/javascript' }));
    await this.ctx.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);
    const src = this.ctx.createMediaStreamSource(this.mic);
    this.micNode = new AudioWorkletNode(this.ctx, 'alqami-down16k');
    src.connect(this.micNode);
    this.micNode.port.onmessage = (e: MessageEvent<Int16Array>) => this.sendMic(e.data);
    this.connect(openingCue);
  }

  /**
   * The Live socket's address. With the key keeper (VITE_TOKEN_URL) and no key typed by the visitor, a short-lived
   * token (one session, 30 min, locked to this model) is fetched for each connection, so the site's key never reaches
   * the browser; tokens go to the "constrained" endpoint. Otherwise the key is used as before.
   */
  private async socketUrl(): Promise<string> {
    const keeper = (import.meta.env.VITE_TOKEN_URL as string | undefined)?.replace(/\/+$/, '');
    const own = this.settings.geminiKey && this.settings.geminiKey !== (import.meta.env.VITE_GEMINI_KEY || '');
    if (keeper && !own) {
      const res = await fetch(`${keeper}/token`);
      if (!res.ok) throw new Error(`Key keeper ${res.status}`);
      const { token } = (await res.json()) as { token: string };
      return `${LIVE_URL}Constrained?access_token=${encodeURIComponent(token)}`;
    }
    return `${LIVE_URL}?key=${encodeURIComponent(this.settings.geminiKey)}`;
  }

  private connect(openingCue?: string) {
    void this.socketUrl().then(
      (url) => this.open(url, openingCue),
      (e) => {
        console.warn('Live connection:', e);
        this.h.onState('error');
      }
    );
  }

  private open(url: string, openingCue?: string) {
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          setup: {
            model: LIVE_MODEL,
            // Checked against the live endpoint: the WebSocket wants these inside generationConfig.
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: this.settings.geminiVoice } } },
            },
            systemInstruction: { parts: [{ text: this.instruction }] },
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            // Answer as soon as the visitor pauses.
            realtimeInputConfig: {
              automaticActivityDetection: { startOfSpeechSensitivity: 'START_SENSITIVITY_HIGH', endOfSpeechSensitivity: 'END_SENSITIVITY_HIGH', prefixPaddingMs: 120, silenceDurationMs: 500 },
            },
            sessionResumption: this.resumeHandle ? { handle: this.resumeHandle } : {},
            contextWindowCompression: { slidingWindow: {} },
          },
        })
      );
    };
    ws.onmessage = async (e) => {
      const text = typeof e.data === 'string' ? e.data : await (e.data as Blob).text();
      let msg: any;
      try {
        msg = JSON.parse(text);
      } catch {
        return;
      }
      if (msg.setupComplete) {
        this.h.onState('listening');
        if (openingCue) this.sendText(openingCue);
        openingCue = undefined;
      }
      if (msg.sessionResumptionUpdate?.resumable && msg.sessionResumptionUpdate.newHandle) this.resumeHandle = msg.sessionResumptionUpdate.newHandle;
      if (msg.goAway) {
        // The server is about to end this connection: open the next one with the same conversation.
        this.reconnect();
      }
      const sc = msg.serverContent;
      if (!sc) return;
      if (sc.interrupted) this.flush();
      if (sc.inputTranscription?.text) this.h.onVisitorWords(sc.inputTranscription.text);
      if (sc.outputTranscription?.text) {
        this.hisWords += sc.outputTranscription.text;
        this.h.onHisWords(this.hisWords, false);
        if (this.external) this.queueSentences(sc.outputTranscription.text, false);
      }
      for (const part of sc.modelTurn?.parts ?? []) {
        if (part.inlineData?.data && !this.external) this.play(fromBase64(part.inlineData.data));
      }
      if (sc.turnComplete) {
        if (this.external) this.queueSentences('', true);
        this.h.onHisWords(this.hisWords, true);
        this.hisWords = '';
      }
    };
    ws.onerror = () => this.h.onState('error', 'connection');
    ws.onclose = (e) => {
      if (this.ws !== ws) return;
      if (this.closedByUs) return this.h.onState('closed');
      this.h.onState('error', e.reason || `closed ${e.code}`);
    };
  }

  private reconnect() {
    const old = this.ws;
    this.ws = null;
    old?.close();
    this.connect();
  }

  private sendMic(pcm: Int16Array) {
    if (this.muted || this.ws?.readyState !== WebSocket.OPEN) return;
    // While he speaks, the phone's speaker leaks into the microphone; only a voice clearly louder than that is let
    // through, so the visitor can still interrupt him.
    if (this.isSpeaking() && rms(pcm) < 0.07) return;
    this.ws.send(JSON.stringify({ realtimeInput: { audio: { data: toBase64(new Uint8Array(pcm.buffer)), mimeType: 'audio/pcm;rate=16000' } } }));
  }

  /** A typed question, or a gesture cue like "[the visitor waves]". */
  sendText(text: string) {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ realtimeInput: { text } }));
  }

  isSpeaking() {
    return this.playing.size > 0 || this.nextTime > this.ctx.currentTime + 0.02;
  }

  /** Lip sync read from the voice as it plays (HeadAudio); null until it starts, or if this browser cannot run it. */
  private lips: LipSync | null = null;
  private lipsAt = 0;

  /**
   * What is playing now: loudness for the jaw, where its energy sits for the lip shape, and (with HeadAudio) the
   * mouth shape recognised from the voice.
   */
  features(buf: Float32Array<ArrayBuffer>, spectrum: Uint8Array<ArrayBuffer>): { level: number; bright: number; mouth?: { jaw: number; wide: number } } {
    const level = this.level(buf);
    const now = performance.now();
    const mouth = this.lips?.update(this.lipsAt ? now - this.lipsAt : 16);
    this.lipsAt = now;
    this.analyser.getByteFrequencyData(spectrum);
    const hz = this.ctx.sampleRate / this.analyser.fftSize;
    let sum = 0;
    let weighted = 0;
    for (let i = 1; i < spectrum.length && i * hz < 6000; i++) {
      sum += spectrum[i];
      weighted += spectrum[i] * i * hz;
    }
    return { level, bright: sum ? Math.min(1, weighted / sum / 3000) : 0.5, ...(mouth ? { mouth: { jaw: mouth.jaw, wide: mouth.wide } } : {}) };
  }

  level(buf: Float32Array<ArrayBuffer>) {
    this.analyser.getFloatTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    return Math.min(1, Math.sqrt(sum / buf.length) * 5);
  }

  private play(bytes: Uint8Array, rate = 24000) {
    const samples = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2));
    if (!samples.length) return;
    const buffer = this.ctx.createBuffer(1, samples.length, rate);
    const ch = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) ch[i] = samples[i] / 32768;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.out);
    const at = Math.max(this.ctx.currentTime + 0.04, this.nextTime);
    src.start(at);
    this.nextTime = at + buffer.duration;
    this.playing.add(src);
    if (this.playing.size === 1) this.h.onState('speaking');
    src.onended = () => {
      this.playing.delete(src);
      if (!this.playing.size) this.h.onState('listening');
    };
  }

  /** Stops his voice at once (the visitor interrupted him, or tapped stop). */
  flush() {
    this.turn++;
    for (const a of this.ttsAborts) a.abort();
    this.ttsAborts.clear();
    this.ttsChain = Promise.resolve();
    this.sentenceBuf = '';
    this.piecesThisTurn = 0;
    for (const s of this.playing) {
      s.onended = null;
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
    }
    this.playing.clear();
    this.nextTime = 0;
    this.h.onState('listening');
  }

  // Cloned voice / ElevenLabs: speak whole sentences as soon as they are complete, in order. A long sentence is
  // also cut at a comma. The cloned voice is made slower than real time (about 1.45x on an RTX 3070), so the first
  // piece of each answer is kept short (first comma, or the first 8 words) to be heard within a few seconds.
  private piecesThisTurn = 0;
  private queueSentences(chunk: string, end: boolean) {
    this.sentenceBuf += chunk;
    const parts = this.sentenceBuf.split(/(?<=[.!?؟…\n])\s*/);
    this.sentenceBuf = end ? '' : parts.pop() ?? '';
    const first = this.piecesThisTurn === 0 && parts.length === 0;
    const comma = this.sentenceBuf.search(/[،,؛;:](?=\s)/);
    if (!end && comma > (first ? 15 : 70)) {
      parts.push(this.sentenceBuf.slice(0, comma + 1));
      this.sentenceBuf = this.sentenceBuf.slice(comma + 1);
    } else if (!end && first && this.server) {
      const words = this.sentenceBuf.trim().split(/\s+/);
      if (words.length > 8) {
        parts.push(words.slice(0, 8).join(' '));
        this.sentenceBuf = words.slice(8).join(' ');
      }
    }
    const pieces = parts.map((p) => p.trim()).filter(Boolean);
    this.piecesThisTurn = end ? 0 : this.piecesThisTurn + pieces.length;
    for (const s of pieces) {
      if (this.server) this.speakCloned(s);
      else this.speakEleven(s);
    }
  }

  private speakCloned(text: string) {
    const turn = this.turn;
    const abort = new AbortController();
    this.ttsAborts.add(abort);
    const latin = (text.match(/[A-Za-z]/g) || []).length;
    const arabic = (text.match(/[؀-ۿ]/g) || []).length;
    const res = fetch(`${this.server}/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, language: latin > arabic ? 'en' : 'ar' }),
      signal: abort.signal,
    });
    this.ttsChain = this.ttsChain.then(async () => {
      try {
        const r = await res;
        if (!r.ok) throw new Error(`voice server ${r.status}`);
        const rate = Number(r.headers.get('X-Sample-Rate')) || 24000;
        const pcm = new Uint8Array(await r.arrayBuffer());
        if (turn === this.turn) this.play(pcm, rate);
      } catch (err) {
        if (turn !== this.turn || (err instanceof DOMException && err.name === 'AbortError')) return;
        // The server stopped answering: from the next answer on, Gemini's own voice speaks.
        this.server = null;
        this.h.onVoice?.(this.voice);
      } finally {
        this.ttsAborts.delete(abort);
      }
    });
  }

  private speakEleven(text: string) {
    const turn = this.turn;
    const abort = new AbortController();
    this.ttsAborts.add(abort);
    const res = fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(this.eleven!.voice)}/stream?output_format=pcm_24000`, {
      method: 'POST',
      headers: { 'xi-api-key': this.eleven!.key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, model_id: 'eleven_flash_v2_5' }),
      signal: abort.signal,
    });
    this.ttsChain = this.ttsChain.then(async () => {
      try {
        const r = await res;
        if (!r.ok || !r.body) throw new Error(`ElevenLabs ${r.status}`);
        const reader = r.body.getReader();
        let carry: Uint8Array | null = null;
        for (;;) {
          const { done, value } = await reader.read();
          if (done || turn !== this.turn) break;
          let bytes = value;
          if (carry) {
            const joined = new Uint8Array(carry.length + value.length);
            joined.set(carry);
            joined.set(value, carry.length);
            bytes = joined;
            carry = null;
          }
          if (bytes.length % 2) {
            carry = bytes.slice(-1);
            bytes = bytes.slice(0, -1);
          }
          this.play(bytes.slice());
        }
      } catch (err) {
        if (turn === this.turn && !(err instanceof DOMException && err.name === 'AbortError')) this.h.onState('error', String(err));
      } finally {
        this.ttsAborts.delete(abort);
      }
    });
  }

  stop() {
    this.closedByUs = true;
    this.flush();
    this.ws?.close();
    this.ws = null;
    this.micNode?.disconnect();
    this.mic?.getTracks().forEach((t) => t.stop());
    this.mic = null;
    this.h.onState('closed');
  }

  dispose() {
    this.stop();
    void this.ctx.close();
  }
}

