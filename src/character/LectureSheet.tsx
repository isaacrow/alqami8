import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, Loader2, Play, Search, X } from 'lucide-react';
import { clock, embedUrl, LectureHit, LectureIndex, loadLectures, snippet } from './lectureSearch';

type Lang = 'ar' | 'en';

/** Topics to start from, for a visitor who does not know what to search. */
const STARTERS = ['الصبر', 'الإمام الحسين', 'نوح', 'الأخلاق', 'الربا', 'الصلاة', 'العقل', 'الشباب'];

/**
 * His recorded lectures in the character's own window: search every passage (the matching words marked), and play
 * the lecture right here, from that second. `clip` opens straight on a passage (a "hear him" card under his answer).
 */
export const LectureSheet: React.FC<{
  url: string;
  lang: Lang;
  name: string;
  clip: LectureHit | null;
  onClose: () => void;
}> = ({ url, lang, name, clip, onClose }) => {
  const t = (ar: string, en: string) => (lang === 'ar' ? ar : en);
  const [index, setIndex] = useState<LectureIndex | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [asked, setAsked] = useState('');
  const [playing, setPlaying] = useState<LectureHit | null>(clip);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    loadLectures(url).then(
      (ix) => live && setIndex(ix),
      () => live && setFailed(true)
    );
    return () => {
      live = false;
    };
  }, [url]);

  const results = useMemo(() => (index && asked ? index.search(asked, 40, 3) : []), [index, asked]);
  const run = (q: string) => {
    setQuery(q);
    setAsked(q.trim());
    input.current?.blur();
  };

  return (
    <div className="absolute inset-0 z-40 bg-black/70 backdrop-blur-sm flex items-end justify-center" onClick={onClose}>
      <div
        dir="rtl"
        className="w-full sm:max-w-lg h-[92dvh] flex flex-col rounded-t-3xl bg-[#17140f] border border-white/10 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 pt-4 pb-3 shrink-0">
          <div className="flex-1 min-w-0">
            <h2 className="text-[17px] font-semibold leading-tight">{t('محاضراته', 'His lectures')}</h2>
            <p className="text-[11.5px] text-white/55 truncate">
              {index
                ? t(`${name} · ${index.counts.lectures} محاضرة · ${index.counts.passages} مقطعًا`, `${name} · ${index.counts.lectures} lectures · ${index.counts.passages} passages`)
                : t('يجهّز المحاضرات…', 'Getting the lectures ready…')}
            </p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center" aria-label={t('إغلاق', 'Close')}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* The lecture, playing here from the chosen second. */}
        {playing && (
          <div className="px-4 pb-3 shrink-0">
            <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-black border border-white/10">
              <iframe
                key={`${playing.video}-${playing.start}`}
                src={embedUrl(playing.video, playing.start)}
                title={playing.title}
                className="absolute inset-0 w-full h-full"
                allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                allowFullScreen
              />
            </div>
            <div className="flex items-center gap-2 mt-2">
              <p dir="auto" className="flex-1 min-w-0 text-[13px] font-semibold truncate">
                {playing.title}
              </p>
              <span className="text-[11.5px] text-[#FFD60A] tabular-nums" dir="ltr">
                {clock(playing.start)}
              </span>
              <a href={playing.url} target="_blank" rel="noopener noreferrer" className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center" aria-label={t('افتح في يوتيوب', 'Open on YouTube')}>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <button onClick={() => setPlaying(null)} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center" aria-label={t('أغلق المقطع', 'Close the clip')}>
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        <form
          className="px-4 pb-3 shrink-0"
          onSubmit={(e) => {
            e.preventDefault();
            run(query);
          }}
        >
          <div className="flex items-center gap-2 h-12 rounded-2xl bg-white/10 border border-white/15 px-3 focus-within:border-[#FFD60A]">
            <Search className="w-4.5 h-4.5 text-white/50 shrink-0" />
            <input
              ref={input}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              enterKeyHint="search"
              placeholder={t('ابحث في محاضراته: آية، موضوع، كلمة…', 'Search his lectures: a verse, a topic, a word…')}
              className="flex-1 min-w-0 bg-transparent outline-none text-[15px] placeholder:text-white/40"
            />
            {query && (
              <button type="button" onClick={() => run('')} className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center" aria-label={t('مسح', 'Clear')}>
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </form>

        <div className="flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] space-y-2.5">
          {failed && <p className="text-[13px] text-rose-300">{t('تعذّر تحميل المحاضرات. تحقّق من الاتصال.', 'Could not load the lectures. Check the connection.')}</p>}
          {!index && !failed && (
            <div className="flex items-center gap-2 text-white/60 text-[13px] py-6 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" />
              {t('يحمّل نصوص المحاضرات…', 'Loading the lecture texts…')}
            </div>
          )}
          {index && !asked && (
            <div className="space-y-3 pt-1">
              <p className="text-[12.5px] text-white/55">{t('جرّب:', 'Try:')}</p>
              <div className="flex flex-wrap gap-2">
                {STARTERS.map((s) => (
                  <button key={s} onClick={() => run(s)} className="px-3.5 h-9 rounded-full bg-white/10 border border-white/10 text-[13.5px] active:scale-95 transition">
                    {s}
                  </button>
                ))}
              </div>
              <p className="text-[11.5px] text-white/40 leading-relaxed">
                {t(
                  'النصوص تفريغ آلي لصوت المحاضرات، وفيها كلمات مسموعة خطأً؛ التسجيل نفسه هو الأصل.',
                  'The texts are machine transcriptions of the recordings and contain misheard words; the recording is the authority.'
                )}
              </p>
            </div>
          )}
          {index && asked && (
            <p className="text-[12px] text-white/50">
              {results.length ? t(`${results.length} نتيجة لـ «${asked}»`, `${results.length} results for “${asked}”`) : t(`لا نتائج لـ «${asked}»`, `No results for “${asked}”`)}
            </p>
          )}
          {results.map((r) => {
            const active = playing?.video === r.video && playing.start === r.start;
            return (
              <button
                key={`${r.video}-${r.start}`}
                onClick={() => setPlaying(r)}
                className={`w-full text-start rounded-2xl p-3 border transition active:scale-[0.99] ${active ? 'bg-[#FFD60A]/15 border-[#FFD60A]/50' : 'bg-white/[0.06] border-white/10'}`}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="w-7 h-7 rounded-full bg-[#FFD60A] text-black flex items-center justify-center shrink-0">
                    <Play className="w-3.5 h-3.5 fill-current" />
                  </span>
                  <span dir="auto" className="flex-1 min-w-0 text-[13px] font-semibold truncate">
                    {r.title}
                  </span>
                  <span className="text-[11.5px] text-white/60 tabular-nums" dir="ltr">
                    {clock(r.start)}
                  </span>
                </div>
                <p className="text-[13.5px] leading-relaxed text-white/80">
                  {snippet(r.text, asked).map((p, i) =>
                    p.hit ? (
                      <mark key={i} className="bg-[#FFD60A]/25 text-[#FFE680] rounded px-0.5">
                        {p.t}
                      </mark>
                    ) : (
                      <React.Fragment key={i}>{p.t}</React.Fragment>
                    )
                  )}
                </p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
