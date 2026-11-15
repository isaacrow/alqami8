import React, { useEffect, useMemo, useState } from 'react';
import { ALQAMI_ARTIFACTS, AlqamiArtifact } from '../data/alqamiArtifacts';
import { assetUrl } from '../utils/assetUrl';
import { loadModelViewer } from '../components/three/ModelOverlay';
import { HologramPin, pinsFor } from '../components/scan/HologramAR';
import { SpeakingPanel } from '../components/voice/SpeakingPanel';
import { factsFromArtifact } from '../voice/persona';
import { scannerUrl } from './links';

/**
 * An object's own page, opened by its QR label in any phone camera: no app, no scanner, no camera permission.
 * The record comes first (title, maker, date, where it is kept, what it is made of), then the object in 3D with
 * "see it in your room" (AR Quick Look on iPhone, Scene Viewer on Android), its numbered parts (pins on the page for
 * a manuscript, on the model for a 3D object), the object telling its own story aloud, and a way into the scanner.
 */
type Lang = 'ar' | 'en';
const LANG_KEY = 'alqami.object.lang';

export const ObjectPage: React.FC = () => {
  const id = new URLSearchParams(location.search).get('artifact') ?? '';
  const artifact = useMemo(() => ALQAMI_ARTIFACTS.find((a) => a.id.toLowerCase() === id.toLowerCase()), [id]);
  const [lang, setLang] = useState<Lang>(() => {
    try {
      return localStorage.getItem(LANG_KEY) === 'en' ? 'en' : 'ar';
    } catch {
      return 'ar';
    }
  });
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    try {
      localStorage.setItem(LANG_KEY, lang);
    } catch {
      /* private mode */
    }
  }, [lang]);
  useEffect(() => {
    if (artifact) document.title = `${artifact.title[lang]} · ALQAMI`;
  }, [artifact, lang]);

  if (!artifact) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-[18px] font-semibold">لم نجد هذه القطعة · Object not found</p>
        <p className="text-white/60 text-[14px]" dir="ltr">
          {id || '—'}
        </p>
        <a href={assetUrl('/index.html')} className="px-5 h-11 inline-flex items-center rounded-full bg-white text-black font-semibold">
          علقمي · ALQAMI
        </a>
      </main>
    );
  }
  return <ObjectView a={artifact} lang={lang} setLang={setLang} />;
};

const ObjectView: React.FC<{ a: AlqamiArtifact; lang: Lang; setLang: (l: Lang) => void }> = ({ a, lang, setLang }) => {
  const t = (ar: string, en: string) => (lang === 'ar' ? ar : en);
  const [pins3d, setPins3d] = useState<HologramPin[]>([]);
  const [openPin, setOpenPin] = useState<number | null>(null);
  const hasPage = Boolean(a.pagePins?.length);
  const has3d = !a.model.flat;
  const [view, setView] = useState<'page' | '3d'>(hasPage ? 'page' : '3d');
  const flat = view === 'page';
  useEffect(() => {
    if (!flat) {
      void loadModelViewer().catch(() => undefined);
      void pinsFor(a.id).then(setPins3d);
    }
  }, [a.id, flat]);
  useEffect(() => setOpenPin(null), [view]);

  const pins = flat
    ? (a.pagePins ?? []).map((p) => ({ title: p.title, text: p.text }))
    : pins3d.map((p) => ({ title: p.title, text: p.text }));
  const d = a.details;
  const facts: Array<[string, string | undefined]> = [
    [t('الفترة', 'Period'), a.period[lang]],
    [t('المؤلف أو الصانع', 'Maker'), a.creator[lang]],
    [t('مكان الحفظ', 'Held at'), a.institution[lang]],
    [t('الحجم', 'Extent'), d.dimensions],
    [t('المادة', 'Material'), d.material?.[lang]],
    [t('الحالة', 'Condition'), d.condition?.[lang]],
    [t('التجليد', 'Binding'), d.binding?.[lang]],
    [t('الزخرفة', 'Decoration'), d.decoration?.[lang]],
    [t('الأختام والتملكات', 'Seals and ownership'), d.seals?.[lang]],
  ];

  return (
    <main className="min-h-screen pb-[calc(env(safe-area-inset-bottom)+96px)]">
      <header className="sticky top-0 z-20 flex items-center gap-3 px-4 pt-[calc(env(safe-area-inset-top)+10px)] pb-2 bg-[#0c0a09]/85 backdrop-blur-md">
        <a href={assetUrl('/index.html')} className="text-[15px] font-semibold tracking-wide">
          علقمي <span className="text-white/50 font-normal">ALQAMI</span>
        </a>
        <span className="flex-1" />
        <button onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')} className="h-9 px-3 rounded-full bg-white/10 text-[13px]" aria-label="Language">
          {lang === 'ar' ? 'EN' : 'عربي'}
        </button>
      </header>

      {hasPage && has3d && (
        <div className="mx-auto max-w-3xl flex gap-2 px-4 pt-2" role="tablist">
          {([['page', t('الصفحة', 'The page')], ['3d', t('ثلاثي الأبعاد', 'In 3D')]] as const).map(([v, label]) => (
            <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)} className={`h-9 px-4 rounded-full text-[13px] font-semibold ${view === v ? 'bg-white text-black' : 'bg-white/10'}`}>
              {label}
            </button>
          ))}
        </div>
      )}
      <section className="relative mx-auto max-w-3xl">
        {flat ? (
          <PageWithPins a={a} lang={lang} open={openPin} onOpen={setOpenPin} />
        ) : (
          <div className="relative h-[52vh] min-h-[320px] bg-gradient-to-b from-[#1b1714] to-[#0c0a09]">
            {React.createElement(
              'model-viewer',
              {
                src: assetUrl(a.model.glb),
                poster: assetUrl(a.image),
                alt: a.title[lang],
                'camera-controls': true,
                'auto-rotate': true,
                'touch-action': 'pan-y',
                ar: true,
                'ar-modes': 'webxr scene-viewer quick-look',
                'shadow-intensity': '0.8',
                exposure: '1.05',
                style: { width: '100%', height: '100%', background: 'transparent' },
              },
              ...pins3d.map((p, i) =>
                React.createElement(
                  'button',
                  {
                    key: i,
                    slot: `hotspot-${i}`,
                    'data-position': p.position.join(' '),
                    onClick: () => setOpenPin(openPin === i ? null : i),
                    'aria-label': p.title[lang],
                    className: `w-8 h-8 rounded-full border-2 text-[12px] font-bold ${openPin === i ? 'bg-[#FFD60A] text-black border-white' : 'bg-black/60 text-white border-[#FFD60A]'}`,
                  },
                  String(i + 1)
                )
              ),
              React.createElement(
                'button',
                { slot: 'ar-button', key: 'ar', className: 'absolute bottom-4 start-1/2 -translate-x-1/2 h-11 px-5 rounded-full bg-white text-black text-[14px] font-semibold shadow-lg' },
                t('شاهدها في مكانك', 'See it in your room')
              )
            )}
          </div>
        )}
      </section>

      <article className="mx-auto max-w-3xl px-5 pt-5 space-y-5">
        <div>
          <p className="text-[12px] text-[#FFD60A] tracking-wide">{a.categoryLabel[lang]}</p>
          <h1 className="text-[24px] leading-snug font-bold mt-1">{a.title[lang]}</h1>
          {a.subtitle && <p className="text-[15px] text-white/70 mt-1">{a.subtitle[lang]}</p>}
        </div>

        <p className="text-[15.5px] leading-[1.9] text-white/90">{a.description[lang]}</p>

        {openPin != null && pins[openPin] && (
          <div className="rounded-2xl bg-white/8 border border-[#FFD60A]/40 p-4">
            <p className="font-semibold">
              {openPin + 1}. {pins[openPin].title[lang]}
            </p>
            {pins[openPin].text && <p className="text-[14px] text-white/80 mt-1 leading-relaxed">{pins[openPin].text![lang]}</p>}
          </div>
        )}

        <dl className="grid grid-cols-1 gap-3 rounded-2xl bg-white/5 border border-white/10 p-4">
          {facts
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={k}>
                <dt className="text-[12px] text-white/50">{k}</dt>
                <dd className="text-[15px] leading-relaxed">
                  <bdi>{v}</bdi>
                </dd>
              </div>
            ))}
        </dl>

        {pins.length > 0 && (
          <section aria-label={t('أجزاء القطعة', 'Parts of the object')}>
            <h2 className="text-[16px] font-semibold mb-2">{t('أجزاء القطعة', 'Parts of the object')}</h2>
            <ol className="space-y-1.5">
              {pins.map((p, i) => (
                <li key={i}>
                  <button onClick={() => setOpenPin(openPin === i ? null : i)} className="w-full text-start flex gap-3 items-start rounded-xl px-3 py-2 bg-white/5 hover:bg-white/10">
                    <span className="w-7 h-7 shrink-0 rounded-full bg-[#FFD60A] text-black text-[13px] font-bold flex items-center justify-center">{i + 1}</span>
                    <span className="text-[14.5px] pt-0.5">{p.title[lang]}</span>
                  </button>
                </li>
              ))}
            </ol>
          </section>
        )}

        <SpeakingPanel facts={factsFromArtifact(a, lang)} lang={lang} model={a.model.glb} />

        <p className="text-[12px] text-white/45" dir="ltr">
          {a.id} · {a.itemCode}
        </p>
      </article>

      <div className="fixed bottom-0 inset-x-0 z-20 p-3 pb-[calc(env(safe-area-inset-bottom)+12px)] bg-gradient-to-t from-[#0c0a09] to-transparent">
        <a href={scannerUrl()} className="mx-auto max-w-md h-12 rounded-full bg-[#FFD60A] text-black font-semibold text-[15px] flex items-center justify-center gap-2 shadow-xl">
          {t('امسح القطع بالكاميرا', 'Scan objects with the camera')}
        </a>
      </div>
    </main>
  );
};

/** A manuscript page (its scan) with its numbered pins on it. */
const PageWithPins: React.FC<{ a: AlqamiArtifact; lang: Lang; open: number | null; onOpen: (i: number | null) => void }> = ({ a, lang, open, onOpen }) => {
  const scan = assetUrl(a.pageImage ?? a.image);
  return (
    <div className="relative bg-[#1b1714] px-3 pt-3">
      <div className="relative">
        <img src={scan} alt={a.title[lang]} className="w-full h-auto rounded-lg" />
        {(a.pagePins ?? []).map((p, i) => (
          <button
            key={i}
            onClick={() => onOpen(open === i ? null : i)}
            aria-label={p.title[lang]}
            className={`absolute -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full border-2 text-[12px] font-bold shadow-[0_0_10px_rgba(0,0,0,0.6)] ${
              open === i ? 'bg-[#FFD60A] text-black border-white' : 'bg-black/60 text-white border-[#FFD60A]'
            }`}
            style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
          >
            {i + 1}
          </button>
        ))}
      </div>
    </div>
  );
};
