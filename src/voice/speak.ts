/**
 * Speaks a list of sentences with the device's own voice (Web Speech API): free, works offline, nothing leaves the
 * phone. One utterance per sentence, so long texts are not cut off and the subtitle follows the voice.
 *
 * iPhone notes: the first speak() must come straight from a tap, so nothing here waits before speaking; and the list
 * of voices is unreliable there, so the language is always set on the utterance and the system picks its voice. If
 * no voice starts (no voice for the language on this device), the sentences are still shown one by one, silently.
 */

export type VoiceLang = 'ar' | 'en';

export interface SpeakHandlers {
  onSentence: (index: number) => void;
  /** silent = the device had no voice for this language; the subtitles were shown without sound. */
  onEnd: (silent: boolean) => void;
}

export interface SpeakingDetail {
  active: boolean;
  /** The 3D model that is "speaking" (its viewer moves while it talks). */
  model?: string;
}

const synth = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
let voices: SpeechSynthesisVoice[] = [];
const loadVoices = () => {
  voices = synth?.getVoices() ?? [];
};
loadVoices();
synth?.addEventListener?.('voiceschanged', loadVoices);

function pickVoice(lang: VoiceLang): SpeechSynthesisVoice | undefined {
  const matching = voices.filter((v) => v.lang.toLowerCase().startsWith(lang));
  // On-device voices first (they work offline), then the most natural-sounding ones the platform marks.
  const score = (v: SpeechSynthesisVoice) => (v.localService ? 2 : 0) + (/enhanced|premium|natural|siri/i.test(v.name) ? 1 : 0);
  return matching.sort((a, b) => score(b) - score(a))[0];
}

let run = 0;

function announce(detail: SpeakingDetail) {
  window.dispatchEvent(new CustomEvent<SpeakingDetail>('alqami:speaking', { detail }));
}

export function stopSpeaking() {
  run++;
  synth?.cancel();
  announce({ active: false });
}

/** Starts speaking; returns a function that stops it. Call from a tap handler. */
export function speak(sentences: string[], lang: VoiceLang, handlers: SpeakHandlers, model?: string): () => void {
  stopSpeaking();
  const mine = ++run;
  const alive = () => mine === run;
  let started = false;
  announce({ active: true, model });

  const finish = (silent: boolean) => {
    if (!alive()) return;
    run++;
    announce({ active: false });
    handlers.onEnd(silent);
  };

  // Without a voice: show each sentence for about as long as it takes to read it.
  const silently = (from: number) => {
    const step = (i: number) => {
      if (!alive()) return;
      if (i >= sentences.length) return finish(true);
      handlers.onSentence(i);
      window.setTimeout(() => step(i + 1), Math.max(1800, sentences[i].length * 70));
    };
    step(from);
  };

  if (!synth || typeof SpeechSynthesisUtterance === 'undefined') {
    silently(0);
    return stopSpeaking;
  }

  sentences.forEach((text, i) => {
    // A sentence mostly in Arabic script is read by the Arabic voice even in the English view, and the reverse.
    const arabic = (text.match(/[؀-ۿ]/g) || []).length;
    const latin = (text.match(/[A-Za-z]/g) || []).length;
    const sLang: VoiceLang = arabic + latin === 0 ? lang : arabic > latin ? 'ar' : 'en';
    const voice = pickVoice(sLang);
    const u = new SpeechSynthesisUtterance(text);
    u.lang = voice?.lang ?? (sLang === 'ar' ? 'ar-SA' : 'en-GB');
    if (voice) u.voice = voice;
    u.rate = sLang === 'ar' ? 0.92 : 0.96;
    u.onstart = () => {
      started = true;
      if (alive()) handlers.onSentence(i);
    };
    u.onend = () => {
      if (alive() && i === sentences.length - 1) finish(false);
    };
    u.onerror = () => {
      // "canceled"/"interrupted" come from our own stop; anything else on a voice that never started = no voice.
      if (alive() && !started) {
        synth.cancel();
        silently(0);
      } else if (alive() && i === sentences.length - 1) finish(false);
    };
    synth.speak(u);
  });

  // No sound within two seconds: this device has no voice for the language.
  window.setTimeout(() => {
    if (alive() && !started) {
      synth.cancel();
      silently(0);
    }
  }, 2000);

  return stopSpeaking;
}

/** Speech recognition for asking by voice, where the browser has it (Safari and Chrome do; it needs a connection). */
export function listenOnce(lang: VoiceLang, onText: (text: string) => void, onDone: () => void): (() => void) | null {
  const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!SR) return null;
  const rec = new SR();
  rec.lang = lang === 'ar' ? 'ar-SA' : 'en-GB';
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  rec.onresult = (e: any) => onText(String(e.results?.[0]?.[0]?.transcript ?? ''));
  rec.onerror = onDone;
  rec.onend = onDone;
  try {
    rec.start();
  } catch {
    return null;
  }
  return () => rec.abort();
}

export const canListen = () => typeof window !== 'undefined' && Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
