import React, { useEffect, useRef, useState } from 'react';
import { Mic, Square, Volume2 } from 'lucide-react';
import { answer, intentOf, PersonaFacts, QuestionId, QUESTIONS } from '../../voice/persona';
import { canListen, listenOnce, speak, stopSpeaking, VoiceLang } from '../../voice/speak';

/**
 * "Let it speak": the object introduces itself and answers set questions, by tap or by voice, in the device's own
 * voice with subtitles. Everything it says comes from its catalogue record (src/voice/persona.ts).
 */
export const SpeakingPanel: React.FC<{ facts: PersonaFacts; lang: VoiceLang; model?: string }> = ({ facts, lang, model }) => {
  const t = (ar: string, en: string) => (lang === 'ar' ? ar : en);
  const [lines, setLines] = useState<string[]>([]);
  const [current, setCurrent] = useState(-1);
  const [speaking, setSpeaking] = useState(false);
  const [silent, setSilent] = useState(false);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState<string | null>(null);
  const stopListening = useRef<(() => void) | null>(null);

  // Stop when the card closes or shows another object.
  useEffect(
    () => () => {
      stopSpeaking();
      stopListening.current?.();
    },
    [facts.title]
  );

  const say = (q: QuestionId, override?: string[]) => {
    const text = override ?? answer(facts, q, lang);
    setLines(text);
    setCurrent(0);
    setSpeaking(true);
    speak(
      text,
      lang,
      {
        onSentence: setCurrent,
        onEnd: (wasSilent) => {
          setSpeaking(false);
          setSilent(wasSilent);
        },
      },
      model
    );
  };

  const stop = () => {
    stopSpeaking();
    setSpeaking(false);
  };

  const listen = () => {
    if (listening) return stopListening.current?.();
    stop();
    setHeard(null);
    const cancel = listenOnce(
      lang,
      (text) => {
        setHeard(text);
        const intent = intentOf(text);
        if (intent) say(intent);
        else say('intro', [t('لم أفهم السؤال. جرّب أحد الأسئلة أدناه.', 'I did not catch that. Try one of the questions below.')]);
      },
      () => setListening(false)
    );
    stopListening.current = cancel;
    setListening(Boolean(cancel));
  };

  return (
    <section dir={lang === 'ar' ? 'rtl' : 'ltr'} className="rounded-2xl bg-white/5 border border-white/10 p-3 space-y-2.5 text-white" aria-label={t('دعه يتكلم', 'Let it speak')}>
      <div className="flex items-center gap-2">
        <button
          onClick={() => (speaking ? stop() : say('intro'))}
          className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-[#FFD60A] hover:bg-[#ffe03b] text-black text-[13px] font-semibold cursor-pointer active:scale-95 transition"
        >
          {speaking ? <Square className="w-3.5 h-3.5 fill-black" /> : <Volume2 className="w-4 h-4" />}
          {speaking ? t('أوقف', 'Stop') : facts.narrated ? t('استمع إلى التعريف', 'Hear about it') : t('دعه يتكلم', 'Let it speak')}
        </button>
        {canListen() && (
          <button
            onClick={listen}
            aria-pressed={listening}
            className={`inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full border text-[12.5px] font-medium cursor-pointer active:scale-95 transition ${
              listening ? 'bg-rose-500 border-rose-300 text-white animate-pulse' : 'bg-white/10 hover:bg-white/20 border-white/20'
            }`}
          >
            <Mic className="w-3.5 h-3.5" />
            {listening ? t('أستمع…', 'Listening…') : t('اسأل بصوتك', 'Ask by voice')}
          </button>
        )}
      </div>

      {lines.length > 0 && (
        <div className="rounded-xl bg-black/30 px-3 py-2.5 space-y-1" aria-live="polite">
          {heard && <p className="text-[11px] text-white/50" dir="auto">«{heard}»</p>}
          {lines.map((line, i) => (
            <p key={i} dir="auto" className={`text-[13.5px] leading-relaxed transition-colors ${i === current && speaking ? 'text-white font-medium' : 'text-white/55'}`}>
              {line}
            </p>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        {QUESTIONS.map((q) => (
          <button key={q.id} onClick={() => say(q.id)} className="px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 text-[12px] cursor-pointer active:scale-95 transition">
            {facts.narrated ? t(NARRATED_AR[q.id], NARRATED_EN[q.id]) : t(q.ar, q.en)}
          </button>
        ))}
      </div>

      <p className="text-[10.5px] text-white/45 leading-relaxed">
        {silent
          ? t('لا يوجد على هذا الجهاز صوت لهذه اللغة، فعُرض النص دون صوت.', 'This device has no voice for this language, so the text was shown without sound.')
          : t('صوت الجهاز يقرأ سجلّ الفهرس كما هو، دون ذكاء اصطناعي.', 'The device’s voice reads the catalogue record as written. No AI.')}
      </p>
    </section>
  );
};

// Question wording for narrated (third-person) records.
const NARRATED_AR: Record<string, string> = { who: 'من وراءه؟', when: 'ما تاريخه؟', where: 'من أين هو؟', story: 'ما موضوعه؟', body: 'ممَّ صُنع؟', kept: 'أين يُحفظ؟' };
const NARRATED_EN: Record<string, string> = { who: 'Who is behind it?', when: 'How old is it?', where: 'Where is it from?', story: 'What is it about?', body: 'What is it made of?', kept: 'Where is it kept?' };
