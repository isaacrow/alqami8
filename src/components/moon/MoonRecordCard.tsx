import React from 'react';
import { BookOpen, Box, ExternalLink, QrCode, WifiOff } from 'lucide-react';
import { MoonCardData, MoonLink, UiLang } from '../../moon/readRecord';
import { downloadQrLabel } from '../../scan/qrLabel';
import { roomViewUrl } from '../../moon/roomView';
import { SpeakingPanel } from '../voice/SpeakingPanel';
import { factsFromCard } from '../../voice/persona';
import { MoonLoad } from '../../moon/useMoon';

const words = (lang: UiLang, ar: string, en: string) => (lang === 'ar' ? ar : en);

/** A name that opens its Moon page when Moon gave it a URI that resolves on the web. */
const LinkOrText: React.FC<{ item: MoonLink }> = ({ item }) =>
  item.uri && /^https?:\/\//.test(item.uri) ? (
    <a href={item.uri} target="_blank" rel="noopener noreferrer" className="underline decoration-white/30 underline-offset-2 hover:decoration-white">
      {item.label}
    </a>
  ) : (
    <>{item.label}</>
  );

const Fact: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="grid grid-cols-[5.5rem_1fr] sm:grid-cols-[7.5rem_1fr] gap-3 py-1.5 border-b border-white/10 last:border-b-0">
    <dt className="text-white/55">{label}</dt>
    <dd className="text-white/90 min-w-0 break-words" dir="auto">
      {children}
    </dd>
  </div>
);

export const MoonRecordCard: React.FC<{ card: MoonCardData; lang: UiLang; offline?: boolean }> = ({ card, lang, offline }) => {
  const t = (ar: string, en: string) => words(lang, ar, en);
  const published = [card.place?.label, card.publisher?.label].filter(Boolean).join(t(': ', ': '));

  return (
    <article className="space-y-4 text-white" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <header className="flex gap-4">
        {card.coverUrl && (
          <img
            src={card.coverUrl}
            crossOrigin="anonymous"
            alt=""
            loading="lazy"
            className="w-20 h-28 object-cover rounded-lg border border-white/20 shadow-lg flex-shrink-0 bg-white/10"
          />
        )}
        <div className="min-w-0 space-y-1">
          <h2 className="text-[22px] font-bold leading-tight" dir={card.rtl ? 'rtl' : 'ltr'}>
            {card.title}
          </h2>
          {card.subtitle && (
            <p className="text-[13.5px] text-white/75" dir="auto">
              {card.subtitle}
            </p>
          )}
          {card.contributors.length > 0 && (
            <p className="text-[13px] text-white/85" dir="auto">
              {card.contributors.map((c, i) => (
                <React.Fragment key={`${c.label}-${i}`}>
                  {i > 0 && ' · '}
                  <LinkOrText item={c} />
                  {c.role && <span className="text-white/50"> ({c.role})</span>}
                </React.Fragment>
              ))}
            </p>
          )}
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <a
          href={card.opacUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full bg-white text-black text-[12.5px] font-semibold hover:bg-white/90 transition active:scale-95"
        >
          <BookOpen className="w-3.5 h-3.5" />
          {t('افتح في مون', 'Open in Moon')}
          <ExternalLink className="w-3 h-3 opacity-60" />
        </a>
        {card.modelUrl && (
          <a
            href={roomViewUrl(card.modelUrl, card.title)}
            className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full bg-[#FFD60A] text-black text-[12.5px] font-semibold hover:bg-[#ffe03b] transition active:scale-95"
            title={t('ضعه في مكانك بالحجم الحقيقي', 'Place it in your room at true size')}
          >
            <Box className="w-3.5 h-3.5" />
            {t('اعرضه في مكانك', 'View in your room')}
          </a>
        )}
        <button
          onClick={() => void downloadQrLabel(card)}
          className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full bg-white/15 hover:bg-white/25 border border-white/20 text-[12.5px] font-medium transition active:scale-95 cursor-pointer"
          title={t('ملصق للطباعة يفتح هذا السجل', 'A printable label that opens this record')}
        >
          <QrCode className="w-3.5 h-3.5" />
          {t('ملصق QR', 'QR label')}
        </button>
        <span className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-white/10 border border-white/15 text-[11.5px] text-white/70">
          {offline ? <WifiOff className="w-3.5 h-3.5" /> : <span className="w-2 h-2 rounded-full bg-emerald-400" />}
          {offline ? t('نسخة محفوظة على الجهاز', 'Copy saved on this device') : t('من فهرس مون', 'From the Moon catalogue')}
        </span>
      </div>

      <SpeakingPanel facts={factsFromCard(card)} lang={lang} model={card.modelUrl} />

      {card.summary && (
        <p className="text-[13px] leading-relaxed text-white/80" dir="auto">
          {card.summary}
        </p>
      )}

      <dl className="text-[12.5px] rounded-2xl bg-white/5 border border-white/10 px-4 py-1">
        {(published || card.date) && (
          <Fact label={t('النشر', 'Published')}>{[published, card.date].filter(Boolean).join(t('، ', ', '))}</Fact>
        )}
        {card.responsibility && <Fact label={t('المسؤولية', 'Statement')}>{card.responsibility}</Fact>}
        {card.edition && <Fact label={t('الطبعة', 'Edition')}>{card.edition}</Fact>}
        {card.series && <Fact label={t('السلسلة', 'Series')}>{card.series}</Fact>}
        {card.extent && <Fact label={t('الوصف المادي', 'Extent')}>{card.extent}</Fact>}
        {card.dimensions && <Fact label={t('القياسات', 'Dimensions')}>{card.dimensions}</Fact>}
        {card.language && (
          <Fact label={t('اللغة', 'Language')}>
            <LinkOrText item={card.language} />
          </Fact>
        )}
        {card.genres.length > 0 && <Fact label={t('النوع', 'Genre')}>{card.genres.join(t('، ', ', '))}</Fact>}
        {card.classification.length > 0 && <Fact label={t('التصنيف', 'Classification')}>{card.classification.join(' · ')}</Fact>}
        {card.shelfMarks.length > 0 && <Fact label={t('رقم الرف', 'Shelf mark')}>{card.shelfMarks.join(' · ')}</Fact>}
        {card.isbns.length > 0 && (
          <Fact label="ISBN">
            <span className="font-mono">{card.isbns.join(' · ')}</span>
          </Fact>
        )}
      </dl>

      {card.subjects.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-[12px] font-semibold text-white/60">{t('الموضوعات', 'Subjects')}</h3>
          <div className="flex flex-wrap gap-1.5">
            {card.subjects.map((s, i) => (
              <span key={`${s.label}-${i}`} className="px-2.5 py-1 rounded-full bg-white/10 border border-white/15 text-[12px] text-white/85" dir="auto">
                <LinkOrText item={s} />
              </span>
            ))}
          </div>
        </div>
      )}

      {(card.tableOfContents || card.notes.length > 0) && (
        <div className="space-y-1.5 text-[12.5px] text-white/70 leading-relaxed">
          {card.tableOfContents && (
            <p dir="auto">
              <strong className="text-white/85">{t('المحتويات: ', 'Contents: ')}</strong>
              {card.tableOfContents}
            </p>
          )}
          {card.notes.map((note, i) => (
            <p key={i} dir="auto">
              {note}
            </p>
          ))}
        </div>
      )}
    </article>
  );
};

/** The card for whatever state the record is in: loading, missing from Moon, offline, or ready. */
export const MoonRecordPanel: React.FC<{ load: MoonLoad<MoonCardData>; lang: UiLang }> = ({ load, lang }) => {
  const t = (ar: string, en: string) => words(lang, ar, en);
  if (load.state === 'ready') return <MoonRecordCard card={load.data} lang={lang} offline={load.offline} />;
  const message =
    load.state === 'loading'
      ? t('جارٍ جلب السجل من مون…', 'Getting the record from Moon…')
      : load.state === 'offline'
        ? t('لا يمكن الوصول إلى مون الآن، ولا توجد نسخة محفوظة من هذا السجل.', 'Moon cannot be reached right now and this record is not saved on the device.')
        : t('هذا السجل غير منشور في مون.', 'This record is not published in Moon.');
  return (
    <p className="text-[13px] text-white/70 py-6 text-center" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      {load.state === 'loading' && <span className="inline-block w-4 h-4 me-2 align-[-3px] rounded-full border-2 border-white/25 border-t-white animate-spin" />}
      {message}
    </p>
  );
};
