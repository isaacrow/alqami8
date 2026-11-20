import React, { useState } from 'react';
import {
  Building2,
  ExternalLink,
  FlaskConical,
  History,
  Landmark,
  Layers,
  MapPin,
  Sparkles,
  X,
} from 'lucide-react';
import { ALKAFEEL_MUSEUM_INFO } from '../../data/alkafeelMuseumInfo';

export interface AlKafeelMuseumGuideModalProps {
  open: boolean;
  onClose: () => void;
  lang?: 'ar' | 'en';
  /** Called when the user selects one of the 28 museum halls (prefix like 'KFL-SWD'). */
  onSelectHall?: (hallPrefix: string) => void;
  /** Optional callback to open the Spatial Portal VFX right from the museum guide. */
  onOpenPortal?: () => void;
}

type GuideTab = 'history' | 'divisions' | 'halls';

export const AlKafeelMuseumGuideModal: React.FC<AlKafeelMuseumGuideModalProps> = ({
  open,
  onClose,
  lang = 'ar',
  onSelectHall,
  onOpenPortal,
}) => {
  const [tab, setTab] = useState<GuideTab>('history');
  const isAr = lang === 'ar';
  const t = (ar: string, en: string) => (isAr ? ar : en);

  if (!open) return null;

  return (
    <div
      dir={isAr ? 'rtl' : 'ltr'}
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 backdrop-blur-xl p-3 sm:p-5"
      onClick={onClose}
    >
      <div
        className="relative flex flex-col w-full max-w-3xl max-h-[88vh] rounded-[28px] overflow-hidden border border-white/25 bg-[#111319]/92 text-white shadow-[0_30px_100px_rgba(0,0,0,0.65)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative px-5 pt-5 pb-4 border-b border-white/15 bg-gradient-to-br from-amber-500/20 via-amber-900/15 to-transparent">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-2xl bg-amber-400/20 border border-amber-300/40 flex items-center justify-center shrink-0">
                <Landmark className="w-5 h-5 text-amber-300" />
              </div>
              <div>
                <div className="inline-flex items-center gap-1.5 text-[11px] font-medium text-amber-300/95 mb-0.5">
                  <MapPin className="w-3.5 h-3.5" />
                  <span>{t(ALKAFEEL_MUSEUM_INFO.parentAr, ALKAFEEL_MUSEUM_INFO.parentEn)}</span>
                </div>
                <h2 className="text-lg sm:text-xl font-bold tracking-tight text-white">
                  {t(ALKAFEEL_MUSEUM_INFO.nameAr, ALKAFEEL_MUSEUM_INFO.nameEn)}
                </h2>
                <p className="text-xs text-white/75 mt-0.5">
                  {t(
                    `التأسيس: ${ALKAFEEL_MUSEUM_INFO.foundedAr}`,
                    `Founded: ${ALKAFEEL_MUSEUM_INFO.foundedEn}`
                  )}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label={t('إغلاق', 'Close')}
              className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 flex items-center justify-center transition"
            >
              <X className="w-4 h-4 text-white" />
            </button>
          </div>

          {/* Stats strip */}
          <div className="grid grid-cols-4 gap-2 mt-4">
            {ALKAFEEL_MUSEUM_INFO.stats.map((s) => (
              <div
                key={s.labelEn}
                className="rounded-2xl bg-white/[0.06] border border-white/10 px-2.5 py-2 text-center"
              >
                <div className="text-base sm:text-lg font-bold text-amber-300 leading-tight">
                  {t(s.valueAr, s.valueEn)}
                </div>
                <div className="text-[10px] sm:text-[11px] text-white/70 mt-0.5 leading-tight">
                  {t(s.labelAr, s.labelEn)}
                </div>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-2 mt-4">
            <button
              type="button"
              onClick={() => setTab('history')}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold transition ${
                tab === 'history'
                  ? 'bg-amber-400 text-black shadow-md'
                  : 'bg-white/10 text-white/80 hover:bg-white/15'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>{t('التاريخ والنشأة', 'History & Heritage')}</span>
            </button>
            <button
              type="button"
              onClick={() => setTab('divisions')}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold transition ${
                tab === 'divisions'
                  ? 'bg-amber-400 text-black shadow-md'
                  : 'bg-white/10 text-white/80 hover:bg-white/15'
              }`}
            >
              <FlaskConical className="w-3.5 h-3.5" />
              <span>{t('الشُّعب والمختبر (5)', 'Divisions & Lab (5)')}</span>
            </button>
            <button
              type="button"
              onClick={() => setTab('halls')}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold transition ${
                tab === 'halls'
                  ? 'bg-amber-400 text-black shadow-md'
                  : 'bg-white/10 text-white/80 hover:bg-white/15'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>{t('القاعات (28)', 'Halls (28)')}</span>
            </button>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {tab === 'history' && (
            <>
              <div className="rounded-2xl bg-white/[0.05] border border-white/10 p-4">
                <p className="text-sm leading-relaxed text-white/90">
                  {t(ALKAFEEL_MUSEUM_INFO.overviewAr, ALKAFEEL_MUSEUM_INFO.overviewEn)}
                </p>
              </div>

              <div className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-300/90 flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5" />
                  <span>{t('المحطات التاريخية للمتحف', 'Institutional Milestones')}</span>
                </h3>
                {ALKAFEEL_MUSEUM_INFO.milestones.map((m) => (
                  <div
                    key={m.yearEn}
                    className="rounded-2xl bg-white/[0.04] border border-white/10 p-3.5 flex flex-col sm:flex-row sm:items-start gap-2.5"
                  >
                    <div className="shrink-0 px-2.5 py-1 rounded-xl bg-amber-400/15 border border-amber-300/30 text-amber-200 text-xs font-bold self-start">
                      {t(m.yearAr, m.yearEn)}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white">
                        {t(m.titleAr, m.titleEn)}
                      </h4>
                      <p className="text-xs text-white/75 mt-1 leading-relaxed">
                        {t(m.bodyAr, m.bodyEn)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {tab === 'divisions' && (
            <div className="grid grid-cols-1 gap-3">
              {ALKAFEEL_MUSEUM_INFO.divisions.map((d) => (
                <div
                  key={d.id}
                  className="rounded-2xl bg-white/[0.05] border border-white/12 p-4"
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <h3 className="text-sm sm:text-base font-bold text-white">
                      {t(d.nameAr, d.nameEn)}
                    </h3>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-400/15 text-amber-200 border border-amber-300/25 shrink-0">
                      {t(d.tagAr, d.tagEn)}
                    </span>
                  </div>
                  <p className="text-xs text-white/80 leading-relaxed">
                    {t(d.summaryAr, d.summaryEn)}
                  </p>
                  <ul className="mt-2.5 space-y-1">
                    {(isAr ? d.highlightsAr : d.highlightsEn).map((h, i) => (
                      <li key={i} className="text-[11px] text-white/75 flex items-start gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                        <span>{h}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}

          {tab === 'halls' && (
            <div>
              <p className="text-xs text-white/70 mb-3">
                {t(
                  'اختر أي قاعة للانتقال المباشر إلى نفائسها المجسّمة ثلاثية الأبعاد (183 قطعة موثّقة):',
                  'Select any hall to jump directly to its 3D digitized museum treasures (183 documented items):'
                )}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {ALKAFEEL_MUSEUM_INFO.halls.map((hall) => (
                  <button
                    key={hall.prefix}
                    type="button"
                    onClick={() => {
                      onSelectHall?.(hall.prefix);
                      onClose();
                    }}
                    className="group text-start rounded-2xl bg-white/[0.05] hover:bg-amber-400/15 border border-white/10 hover:border-amber-300/40 p-3 transition flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="text-xs sm:text-sm font-bold text-white group-hover:text-amber-200 truncate">
                        {t(hall.nameAr, hall.nameEn)}
                      </div>
                      <div className="text-[11px] text-white/60 truncate mt-0.5">
                        {t(hall.eraAr, hall.eraEn)}
                      </div>
                    </div>
                    <div className="shrink-0 px-2.5 py-1 rounded-xl bg-white/10 group-hover:bg-amber-400 group-hover:text-black text-xs font-bold transition">
                      {hall.count}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-white/15 bg-black/35 flex flex-wrap items-center justify-between gap-2.5">
          <a
            href={ALKAFEEL_MUSEUM_INFO.officialUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-white/75 hover:text-amber-300 transition"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>museum.alkafeel.net</span>
          </a>

          <div className="flex items-center gap-2">
            {onOpenPortal && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenPortal();
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold bg-gradient-to-r from-amber-400 via-orange-400 to-amber-500 text-black hover:brightness-110 shadow-lg transition"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{t('بوابة الزمن · ادخل اللحظة 3D', 'Step Into the Moment · Portal VFX')}</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-full text-xs font-semibold bg-white/10 hover:bg-white/20 text-white transition"
            >
              {t('إغلاق', 'Close')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
