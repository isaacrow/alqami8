import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Camera, CameraOff, Info, Keyboard, Mic, MicOff, PhoneOff, Send, Settings, SwitchCamera, TerminalSquare, X } from 'lucide-react';
import { KeyTerminal } from './KeyTerminal';
import { JAWAHIRI, OPENING_CUE, systemInstruction } from './jawahiri';
import { GEMINI_VOICES, LiveConversation, LiveState, loadSettings, saveSettings, VoiceSettings } from './liveVoice';
import { Stage } from './stage';
import { Gesture, VisitorTracker } from './tracking';

type CameraMode = 'off' | 'front' | 'back';
type Lang = 'ar' | 'en';

const GESTURE_CUES: Record<Gesture, string> = {
  wave: '[الزائر يلوّح لك بيده مُحيّيًا]',
  'thumbs-up': '[الزائر يرفع إبهامه إعجابًا بكلامك]',
};

/**
 * Talk with al-Jawahiri: a live voice conversation (Gemini Live) with his 3D bust, which moves its jaw with the voice,
 * looks at the visitor's face (front camera), reacts to hand waves and pinches, and hovers in the room over the back
 * camera. An AI recreation, and the screen says so.
 */
export const CharacterApp: React.FC = () => {
  const [lang, setLang] = useState<Lang>('ar');
  const t = (ar: string, en: string) => (lang === 'ar' ? ar : en);
  const mount = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const stage = useRef<Stage | null>(null);
  const live = useRef<LiveConversation | null>(null);
  const tracker = useRef<VisitorTracker | null>(null);
  const cameraMode = useRef<CameraMode>('off');
  const [cam, setCam] = useState<CameraMode>('off');
  const [loaded, setLoaded] = useState(0);
  const [loadError, setLoadError] = useState('');
  const [settings, setSettings] = useState<VoiceSettings>(loadSettings);
  const [sheet, setSheet] = useState<'none' | 'settings' | 'about' | 'terminal'>(() => (location.hash === '#keys' ? 'terminal' : 'none'));
  const [state, setState] = useState<LiveState>('idle');
  const [stateDetail, setStateDetail] = useState('');
  const [his, setHis] = useState('');
  const [visitor, setVisitor] = useState('');
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState('');
  const [muted, setMuted] = useState(false);
  const [toast, setToast] = useState('');
  const [trackerReady, setTrackerReady] = useState(false);

  const flash = useCallback((text: string) => {
    setToast(text);
    window.setTimeout(() => setToast((cur) => (cur === text ? '' : cur)), 2200);
  }, []);

  const onGesture = useCallback(
    (g: Gesture) => {
      stage.current?.nod();
      flash(g === 'wave' ? '👋' : '👍');
      live.current?.sendText(GESTURE_CUES[g]);
    },
    [flash]
  );

  // The 3D scene and its frame loop.
  useEffect(() => {
    const s = new Stage(mount.current!);
    stage.current = s;
    s.load('characters/jawahiri.glb', setLoaded).then(
      () => setLoaded(1),
      (e) => setLoadError(String(e))
    );
    const level = new Float32Array(512);
    // ?debug: lets a test drive the voice level and gaze (window.__debug = { voice, look }).
    const debug = new URLSearchParams(location.search).has('debug') ? ((window as any).__debug = { stage: s, voice: null, look: null }) : null;
    let last = performance.now();
    let raf = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      let look: { x: number; y: number } | null = null;
      const mode = cameraMode.current;
      if (mode !== 'off' && tracker.current?.ready && video.current) {
        const seen = tracker.current.update(video.current, mode === 'front');
        look = seen.face ?? seen.hand;
        if (seen.pinchDelta) s.bodyYaw += seen.pinchDelta.x * 5;
      }
      s.frame(dt, debug?.voice ?? live.current?.level(level) ?? 0, debug?.look ?? look);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const onResize = () => s.resize();
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      s.dispose();
      live.current?.dispose();
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopCamera = () => {
    const v = video.current;
    (v?.srcObject as MediaStream | null)?.getTracks().forEach((tr) => tr.stop());
    if (v) v.srcObject = null;
  };

  const setCamera = async (mode: CameraMode) => {
    stopCamera();
    cameraMode.current = 'off';
    setCam(mode);
    await stage.current?.setMode(mode === 'back' ? 'ar' : 'studio');
    if (mode === 'off') return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: mode === 'front' ? 'user' : { ideal: 'environment' }, width: { ideal: mode === 'back' ? 1280 : 640 }, height: { ideal: mode === 'back' ? 720 : 480 } },
        audio: false,
      });
      const v = video.current!;
      v.srcObject = stream;
      await v.play();
      cameraMode.current = mode;
      if (!tracker.current) {
        tracker.current = new VisitorTracker(onGesture);
        tracker.current.init().then(
          () => setTrackerReady(true),
          () => flash(t('تعذّر تشغيل تتبّع الوجه واليد', 'Face and hand tracking could not start'))
        );
      }
    } catch {
      setCam('off');
      await stage.current?.setMode('studio');
      flash(t('لم يُسمح بالكاميرا', 'Camera not allowed'));
    }
  };

  const talk = async () => {
    if (live.current && state !== 'closed' && state !== 'error') {
      live.current.dispose();
      live.current = null;
      setState('idle');
      return;
    }
    if (!settings.geminiKey) {
      setSheet('terminal');
      return;
    }
    live.current?.dispose();
    const conv = new LiveConversation(settings, systemInstruction(), {
      onState: (s, detail) => {
        setState(s);
        setStateDetail(detail ?? '');
      },
      onHisWords: (text) => setHis(text),
      onVisitorWords: (text) => setVisitor((v) => `${v}${text}`.slice(-160)),
    });
    live.current = conv;
    setHis('');
    setVisitor('');
    try {
      // Mic first (it needs this tap), then the front camera so he can look at you.
      const starting = conv.start(OPENING_CUE);
      if (cam === 'off') void setCamera('front');
      await starting;
    } catch {
      setState('error');
      setStateDetail(t('لم يُسمح بالميكروفون', 'Microphone not allowed'));
    }
  };

  // A new answer starts: clear what the visitor said before.
  useEffect(() => {
    if (state === 'speaking') setVisitor('');
  }, [state]);

  const sendTyped = () => {
    const text = typed.trim();
    if (!text || !live.current) return;
    live.current.flush();
    live.current.sendText(text);
    setVisitor(text);
    setTyped('');
  };

  // Drag (one finger) turns him; pinch (two fingers) sizes him in AR.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchStart = useRef<{ d: number; scale: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && stage.current) {
      const [a, b] = [...pointers.current.values()];
      pinchStart.current = { d: Math.hypot(a.x - b.x, a.y - b.y), scale: stage.current.arScale };
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev || !stage.current) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) stage.current.bodyYaw += ((e.clientX - prev.x) / window.innerWidth) * 4;
    else if (pinchStart.current) {
      const [a, b] = [...pointers.current.values()];
      stage.current.arScale = Math.min(2.5, Math.max(0.4, (pinchStart.current.scale * Math.hypot(a.x - b.x, a.y - b.y)) / pinchStart.current.d));
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchStart.current = null;
  };

  const connected = state === 'listening' || state === 'speaking' || state === 'connecting';
  const ar = cam === 'back';
  const elevenOn = Boolean(settings.elevenKey && settings.elevenVoiceId);
  const errorText =
    state === 'error'
      ? /1007|1008|API key|permission|invalid/i.test(stateDetail)
        ? t('المفتاح مرفوض. تحقّق منه في الإعدادات.', 'The key was refused. Check it in Settings.')
        : `${t('انقطع الاتصال', 'Connection lost')}${stateDetail ? ` (${stateDetail})` : ''}`
      : '';

  return (
    <div dir={lang === 'ar' ? 'rtl' : 'ltr'} className={`fixed inset-0 overflow-hidden text-white select-none ${ar ? 'bg-black' : 'bg-[radial-gradient(ellipse_at_50%_35%,#3a2f22_0%,#15110c_55%,#060504_100%)]'}`}>
      {/* Camera: full screen behind him in AR, a small mirror in the corner otherwise. */}
      <video
        ref={video}
        playsInline
        muted
        className={
          ar
            ? 'absolute inset-0 w-full h-full object-cover'
            : `absolute top-[calc(env(safe-area-inset-top)+64px)] end-3 w-24 h-32 rounded-2xl object-cover border border-white/20 shadow-xl -scale-x-100 z-20 ${cam === 'front' ? '' : 'hidden'}`
        }
      />
      <div ref={mount} className="absolute inset-0 z-10" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} />

      {/* Top bar */}
      <header className="absolute top-0 inset-x-0 z-30 flex items-center gap-2 px-3 pt-[calc(env(safe-area-inset-top)+10px)] pb-2 bg-gradient-to-b from-black/60 to-transparent">
        <a href="./" className="w-10 h-10 rounded-full bg-white/10 backdrop-blur flex items-center justify-center" aria-label={t('رجوع', 'Back')}>
          <ArrowLeft className={`w-5 h-5 ${lang === 'ar' ? 'rotate-180' : ''}`} />
        </a>
        <div className="flex-1 min-w-0">
          <h1 className="text-[16px] font-semibold leading-tight truncate">{t(JAWAHIRI.nameAr, JAWAHIRI.nameEn)}</h1>
          <p className="text-[11px] text-white/60 truncate">
            1899–1997 · {t('إعادة بناء بالذكاء الاصطناعي', 'AI recreation')}
            {elevenOn ? ` · ${t('صوت معاد بناؤه', 'recreated voice')}` : ` · ${t('ليس صوته الحقيقي', 'not his real voice')}`}
          </p>
        </div>
        <button onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')} className="h-10 px-3 rounded-full bg-white/10 backdrop-blur text-[13px] font-semibold">
          {lang === 'ar' ? 'EN' : 'ع'}
        </button>
        <button onClick={() => setSheet('about')} className="w-10 h-10 rounded-full bg-white/10 backdrop-blur flex items-center justify-center" aria-label={t('عنه', 'About him')}>
          <Info className="w-5 h-5" />
        </button>
        <button onClick={() => setSheet('terminal')} className="w-10 h-10 rounded-full bg-white/10 backdrop-blur flex items-center justify-center" aria-label={t('طرفية المفاتيح', 'Key terminal')}>
          <TerminalSquare className="w-5 h-5" />
        </button>
        <button onClick={() => setSheet('settings')} className="w-10 h-10 rounded-full bg-white/10 backdrop-blur flex items-center justify-center" aria-label={t('الإعدادات', 'Settings')}>
          <Settings className="w-5 h-5" />
        </button>
      </header>

      {loaded < 1 && !loadError && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 pointer-events-none">
          <div className="w-44 h-1.5 rounded-full bg-white/15 overflow-hidden">
            <div className="h-full bg-[#FFD60A] transition-all" style={{ width: `${Math.round(loaded * 100)}%` }} />
          </div>
          <p className="text-[12px] text-white/60">{t('يحضر الجواهري…', 'Al-Jawahiri is arriving…')}</p>
        </div>
      )}
      {loadError && <p className="absolute inset-x-6 top-1/2 z-20 text-center text-rose-300 text-[13px]">{t('تعذّر تحميل المجسّم', 'The model could not load')}</p>}

      {toast && <div className="absolute top-1/3 inset-x-0 z-30 text-center text-5xl drop-shadow-lg animate-bounce pointer-events-none">{toast}</div>}

      {/* Subtitles and controls */}
      <footer className="absolute bottom-0 inset-x-0 z-30 px-3 pb-[calc(env(safe-area-inset-bottom)+14px)] pt-10 bg-gradient-to-t from-black/80 via-black/45 to-transparent space-y-3">
        {(his || visitor || errorText) && (
          <div className="max-h-[30vh] overflow-y-auto space-y-1.5 px-1" aria-live="polite">
            {visitor && (
              <p dir="auto" className="text-[12px] text-white/55">
                «{visitor}»
              </p>
            )}
            {his && (
              <p dir="auto" className="text-[16px] leading-relaxed font-medium [text-shadow:0_1px_8px_rgba(0,0,0,0.9)]">
                {his}
              </p>
            )}
            {errorText && <p className="text-[12.5px] text-rose-300">{errorText}</p>}
          </div>
        )}

        {typing && connected && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendTyped();
            }}
            className="flex gap-2"
          >
            <input
              autoFocus
              dir="auto"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={t('اكتب سؤالك…', 'Type your question…')}
              className="flex-1 h-11 rounded-full bg-white/15 border border-white/20 px-4 text-[15px] outline-none focus:border-[#FFD60A]"
            />
            <button className="w-11 h-11 rounded-full bg-[#FFD60A] text-black flex items-center justify-center" aria-label={t('أرسل', 'Send')}>
              <Send className={`w-5 h-5 ${lang === 'ar' ? 'rotate-180' : ''}`} />
            </button>
          </form>
        )}

        <div className="flex items-center justify-center gap-3">
          <RoundButton label={cam === 'off' ? t('الكاميرا', 'Camera') : t('أطفئ', 'Off')} onClick={() => setCamera(cam === 'off' ? 'front' : 'off')}>
            {cam === 'off' ? <Camera className="w-5 h-5" /> : <CameraOff className="w-5 h-5" />}
          </RoundButton>
          {connected && (
            <RoundButton
              label={muted ? t('صامت', 'Muted') : t('الميكروفون', 'Mic')}
              active={muted}
              onClick={() => {
                const m = !muted;
                setMuted(m);
                if (live.current) live.current.muted = m;
              }}
            >
              {muted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </RoundButton>
          )}

          <button
            onClick={talk}
            disabled={loaded < 1}
            className={`h-16 min-w-16 px-6 rounded-full font-semibold text-[15px] flex items-center justify-center gap-2 shadow-xl active:scale-95 transition disabled:opacity-40 ${
              connected ? 'bg-rose-500 text-white' : 'bg-[#FFD60A] text-black'
            }`}
          >
            {connected ? <PhoneOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            {state === 'connecting'
              ? t('يتصل…', 'Connecting…')
              : state === 'speaking'
                ? t('يتكلم', 'Speaking')
                : state === 'listening'
                  ? t('يستمع إليك', 'Listening')
                  : t('تحدّث معه', 'Talk with him')}
          </button>

          {connected && (
            <RoundButton label={t('اكتب', 'Type')} active={typing} onClick={() => setTyping(!typing)}>
              <Keyboard className="w-5 h-5" />
            </RoundButton>
          )}
          <RoundButton label={ar ? t('الأمامية', 'Front') : t('في غرفتك', 'In your room')} active={ar} onClick={() => setCamera(ar ? 'front' : 'back')}>
            <SwitchCamera className="w-5 h-5" />
          </RoundButton>
        </div>
        {cam !== 'off' && (
          <p className="text-center text-[10.5px] text-white/50">
            {!trackerReady
              ? t('يجهّز تتبّع الوجه واليد…', 'Getting face and hand tracking ready…')
              : ar
                ? t('لوّح له، اقرص بأصبعين لتديره، وحرّك الهاتف حوله. اضغط بإصبعين على الشاشة لتكبيره.', 'Wave at him, pinch in the air to turn him, move the phone around. Two fingers on the screen resize him.')
                : t('ينظر إلى وجهك. لوّح له أو ارفع إبهامك.', 'He looks at your face. Wave or give a thumbs-up.')}
          </p>
        )}
      </footer>

      {sheet === 'settings' && <SettingsSheet lang={lang} settings={settings} onClose={() => setSheet('none')} onSave={(s) => (setSettings(s), saveSettings(s), setSheet('none'))} />}
      {sheet === 'terminal' && <KeyTerminal settings={settings} onClose={() => setSheet('none')} onSave={(s) => (setSettings(s), saveSettings(s))} />}
      {sheet === 'about' && <AboutSheet lang={lang} onClose={() => setSheet('none')} />}
    </div>
  );
};

const RoundButton: React.FC<{ label: string; onClick: () => void; active?: boolean; children: React.ReactNode }> = ({ label, onClick, active, children }) => (
  <button onClick={onClick} aria-label={label} aria-pressed={active} className="flex flex-col items-center gap-1 w-14">
    <span className={`w-12 h-12 rounded-full flex items-center justify-center backdrop-blur border transition ${active ? 'bg-white text-black border-white' : 'bg-white/15 border-white/20'}`}>{children}</span>
    <span className="text-[10px] text-white/70 truncate max-w-full">{label}</span>
  </button>
);

const Sheet: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => (
  <div className="absolute inset-0 z-40 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center" onClick={onClose}>
    <div className="w-full sm:max-w-lg max-h-[85vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-[#17140f] border border-white/10 p-5 pb-[calc(env(safe-area-inset-bottom)+20px)]" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[18px] font-semibold">{title}</h2>
        <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center">
          <X className="w-4 h-4" />
        </button>
      </div>
      {children}
    </div>
  </div>
);

const SettingsSheet: React.FC<{ lang: Lang; settings: VoiceSettings; onClose: () => void; onSave: (s: VoiceSettings) => void }> = ({ lang, settings, onClose, onSave }) => {
  const t = (ar: string, en: string) => (lang === 'ar' ? ar : en);
  const [s, setS] = useState(settings);
  const field = 'w-full h-11 rounded-xl text-white placeholder:text-white/40 bg-white/10 border border-white/15 px-3 text-[14px] outline-none focus:border-[#FFD60A]';
  return (
    <Sheet title={t('الإعدادات', 'Settings')} onClose={onClose}>
      <div className="space-y-4 text-[13.5px]">
        <label className="block space-y-1.5">
          <span className="font-medium">{t('مفتاح Google AI (Gemini)', 'Google AI (Gemini) key')}</span>
          <input type="password" autoComplete="off" dir="ltr" value={s.geminiKey} onChange={(e) => setS({ ...s, geminiKey: e.target.value.trim() })} className={field} placeholder="AIza…" />
          <span className="block text-[11.5px] text-white/50">
            {t('يُحفظ على هذا الجهاز فقط ولا يُرسل إلا إلى Google. قيّده بموقعك في Google Cloud.', 'Kept on this device only and sent only to Google. Restrict it to your site in Google Cloud.')}
          </span>
        </label>
        <label className="block space-y-1.5">
          <span className="font-medium">{t('صوت Gemini', 'Gemini voice')}</span>
          <select value={s.geminiVoice} onChange={(e) => setS({ ...s, geminiVoice: e.target.value })} className={field}>
            {GEMINI_VOICES.map((v) => (
              <option key={v.id} value={v.id} className="bg-[#17140f]">
                {v.id} — {t(v.ar, v.en)}
              </option>
            ))}
          </select>
        </label>
        <div className="rounded-2xl border border-white/10 p-3 space-y-2.5">
          <p className="font-medium">{t('صوت مستنسخ (اختياري، ElevenLabs)', 'Cloned voice (optional, ElevenLabs)')}</p>
          <p className="text-[11.5px] text-white/55 leading-relaxed">
            {t(
              'أنشئ الصوت في حسابك على ElevenLabs من تسجيل تملك حق استخدامه (وفي حالة الجواهري: بإذن ورثته)، ثم ضع المفتاح ومعرّف الصوت هنا. يصبح الرد أبطأ قليلًا، وتذكر الشاشة أنه صوت معاد بناؤه.',
              'Create the voice in your own ElevenLabs account from a recording you have the rights to (for al-Jawahiri: with his estate’s permission), then put the key and voice ID here. Answers become a little slower, and the screen says the voice is recreated.'
            )}
          </p>
          <input type="password" autoComplete="off" dir="ltr" value={s.elevenKey} onChange={(e) => setS({ ...s, elevenKey: e.target.value.trim() })} className={field} placeholder={t('مفتاح ElevenLabs', 'ElevenLabs key')} />
          <input dir="ltr" value={s.elevenVoiceId} onChange={(e) => setS({ ...s, elevenVoiceId: e.target.value.trim() })} className={field} placeholder={t('معرّف الصوت', 'Voice ID')} />
        </div>
        <button onClick={() => onSave(s)} className="w-full h-12 rounded-full bg-[#FFD60A] text-black font-semibold">
          {t('حفظ', 'Save')}
        </button>
      </div>
    </Sheet>
  );
};

const AboutSheet: React.FC<{ lang: Lang; onClose: () => void }> = ({ lang, onClose }) => {
  const t = (ar: string, en: string) => (lang === 'ar' ? ar : en);
  return (
    <Sheet title={t(JAWAHIRI.nameAr, JAWAHIRI.nameEn)} onClose={onClose}>
      <div className="space-y-4 text-[13.5px] leading-relaxed">
        <p className="text-white/70">
          {t(
            `${JAWAHIRI.titleAr}. وُلد في النجف في 26 تموز 1899 وتوفي في دمشق في 27 تموز 1997.`,
            'Iraq’s great Arab poet. Born in Najaf on 26 July 1899, died in Damascus on 27 July 1997.'
          )}
        </p>
        <ol className="space-y-2 border-s border-white/15 ps-3">
          {JAWAHIRI.life.map((l) => (
            <li key={l.year}>
              <span className="text-[#FFD60A] font-semibold text-[12px]">{l.year}</span>
              <p>{t(l.ar, l.en)}</p>
            </li>
          ))}
        </ol>
        <div>
          <p className="font-medium mb-1.5">{t('أعماله في الفهرس', 'His works in the catalogue')}</p>
          <div className="flex flex-wrap gap-1.5" dir="rtl">
            {JAWAHIRI.works.map((w) => (
              <span key={w} className="px-2.5 py-1 rounded-full bg-white/10 border border-white/10 text-[12px]">
                {w}
              </span>
            ))}
          </div>
        </div>
        <div className="text-[12px] text-white/60 space-y-1" dir="ltr">
          {JAWAHIRI.ids.map((id) => (
            <p key={id.label}>
              {id.label}: {id.url ? <a className="underline" href={id.url} target="_blank" rel="noreferrer">{id.value}</a> : id.value}
            </p>
          ))}
        </div>
        <p className="text-[11.5px] text-white/50">
          {t(
            'هذه إعادة بناء بالذكاء الاصطناعي من سيرته وشعره، وقد تخطئ. المجسّم ثلاثي الأبعاد مصنوع من صوره، والصوت ليس صوته الحقيقي ما لم يُذكر غير ذلك.',
            'This is an AI recreation built from his biography and poetry, and it can be wrong. The 3D bust was made from photographs; the voice is not his own unless stated.'
          )}
        </p>
      </div>
    </Sheet>
  );
};
