import React from 'react';
import { BookOpen, WifiOff, X } from 'lucide-react';
import { coverGuess } from '../../moon/moonApi';
import { UiLang } from '../../moon/readRecord';
import { useMoonRecord, useMoonSearch } from '../../moon/useMoon';
import { MoonRecordPanel } from './MoonRecordCard';
import { OfflineButton } from './OfflineButton';

/** Records from Moon for the gallery: Moon's newest, or what matches the gallery search. */
export const MoonShelf: React.FC<{ query: string; lang: UiLang; onOpen: (recordId: string) => void }> = ({ query, lang, onOpen }) => {
  const t = (ar: string, en: string) => (lang === 'ar' ? ar : en);
  const search = useMoonSearch(query.trim(), lang);

  return (
    <section className="space-y-3" aria-label={t('من فهرس مون', 'From the Moon catalogue')}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-[20px] font-bold">{t('من فهرس مون', 'From the Moon catalogue')}</h3>
        <OfflineButton lang={lang} />
        {search.state === 'ready' && (
          <span className="text-[12px] text-white/60 flex items-center gap-1.5">
            {search.offline && <WifiOff className="w-3.5 h-3.5" />}
            {search.offline
              ? t('محفوظ على الجهاز', 'Saved on this device')
              : query.trim()
                ? t(`${search.data.total} نتيجة`, `${search.data.total} results`)
                : t(`${search.data.total} سجلًا منشورًا`, `${search.data.total} published records`)}
          </span>
        )}
      </div>

      {search.state === 'loading' && (
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="w-36 h-52 flex-shrink-0 rounded-[20px] bg-white/10 animate-pulse" />
          ))}
        </div>
      )}

      {search.state === 'offline' && (
        <p className="text-[13px] text-white/65">{t('لا يمكن الوصول إلى مون الآن.', 'Moon cannot be reached right now.')}</p>
      )}

      {search.state === 'ready' && search.data.cards.length === 0 && (
        <p className="text-[13px] text-white/65">{t('لا توجد سجلات في مون تطابق البحث.', 'No Moon records match this search.')}</p>
      )}

      {search.state === 'ready' && search.data.cards.length > 0 && (
        <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar snap-x">
          {search.data.cards.map((card) => (
            <button
              key={card.id}
              onClick={() => onOpen(card.id)}
              className="snap-start w-36 flex-shrink-0 text-start rounded-[20px] bg-white/10 hover:bg-white/20 border border-white/10 hover:border-white/30 p-2.5 space-y-2 transition cursor-pointer active:scale-[0.98]"
            >
              <div className="relative h-36 rounded-[14px] bg-white/10 overflow-hidden flex items-center justify-center">
                <BookOpen className="w-8 h-8 text-white/35" />
                <img
                  src={coverGuess(card.id)}
                  alt=""
                  loading="lazy"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                  className="absolute inset-0 w-full h-full object-cover"
                />
              </div>
              <p className="text-[12.5px] font-semibold leading-snug line-clamp-2" dir={card.rtl ? 'rtl' : 'ltr'}>
                {card.title}
              </p>
              <p className="text-[11px] text-white/60 line-clamp-1" dir="auto">
                {[card.contributors[0]?.label, card.date].filter(Boolean).join(' · ')}
              </p>
            </button>
          ))}
        </div>
      )}
    </section>
  );
};

/** A Moon record over the gallery, read live from Moon (or the copy saved on this device). */
export const MoonRecordSheet: React.FC<{ recordId: string; lang: UiLang; onClose: () => void }> = ({ recordId, lang, onClose }) => {
  const load = useMoonRecord(recordId, lang);
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center p-4 pointer-events-auto" role="dialog" aria-modal="true">
      <div onClick={onClose} className="absolute inset-0 bg-black/55 backdrop-blur-xl" />
      <div className="relative w-full max-w-[560px] max-h-full overflow-y-auto custom-scrollbar rounded-[28px] bg-neutral-900/85 border border-white/20 backdrop-blur-2xl shadow-2xl p-5 sm:p-6">
        <button
          onClick={onClose}
          className="absolute top-4 end-4 w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-white transition cursor-pointer"
          aria-label={lang === 'ar' ? 'إغلاق' : 'Close'}
        >
          <X className="w-4 h-4" />
        </button>
        {load && <MoonRecordPanel load={load} lang={lang} />}
      </div>
    </div>
  );
};
