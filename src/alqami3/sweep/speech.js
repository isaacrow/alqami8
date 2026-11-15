export class ManuscriptSpeechEngine {
  constructor() {
    this.synth = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
    this.isPlaying = false;
    this.currentUtterance = null;
    this.onStateChange = null;
  }

  speak(text, lang = 'en') {
    if (!this.synth) {
      console.warn('Speech synthesis not supported in this browser');
      return;
    }

    this.stop();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang === 'ar' ? 'ar-SA' : 'en-US';
    utterance.rate = 0.95;
    utterance.pitch = 1.0;

    // Pick suitable voice if available
    const voices = this.synth.getVoices();
    const voice = voices.find(v => v.lang.startsWith(lang));
    if (voice) {
      utterance.voice = voice;
    }

    utterance.onstart = () => {
      this.isPlaying = true;
      if (this.onStateChange) this.onStateChange(true);
    };

    utterance.onend = () => {
      this.isPlaying = false;
      if (this.onStateChange) this.onStateChange(false);
    };

    utterance.onerror = (e) => {
      console.error('Speech error:', e);
      this.isPlaying = false;
      if (this.onStateChange) this.onStateChange(false);
    };

    this.currentUtterance = utterance;
    this.synth.speak(utterance);
  }

  stop() {
    if (this.synth) {
      this.synth.cancel();
    }
    this.isPlaying = false;
    if (this.onStateChange) this.onStateChange(false);
  }

  toggle(text, lang = 'en') {
    if (this.isPlaying) {
      this.stop();
    } else {
      this.speak(text, lang);
    }
  }
}
