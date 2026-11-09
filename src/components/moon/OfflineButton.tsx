import React, { useEffect, useState } from 'react';
import { CloudDownload, CloudOff } from 'lucide-react';
import { offlineSaved, offlineSize, OfflineProgress, saveForOffline } from '../../offline/saveOffline';
import { UiLang } from '../../moon/readRecord';

/** "Save for offline": prepares the phone for a hall with no signal, and shows when it last did. */
export const OfflineButton: React.FC<{ lang: UiLang }> = ({ lang }) => {
  const t = (ar: string, en: string) => (lang === 'ar' ? ar : en);
  const [size, setSize] = useState<number | null>(null);
  const [saved, setSaved] = useState(offlineSaved);
  const [progress, setProgress] = useState<OfflineProgress | null>(null);
  const [failed, setFailed] = useState(false);
  const supported = typeof caches !== 'undefined' && 'serviceWorker' in navigator;

  useEffect(() => {
    if (supported) void offlineSize().then(setSize).catch(() => setSize(null));
  }, [supported]);

  if (!supported) return null;
  const mb = (bytes: number) => `${Math.round(bytes / 1e6)} MB`;
  const busy = progress && progress.step !== 'done';

  const run = async () => {
    setFailed(false);
    try {
      setSaved(await saveForOffline(setProgress));
    } catch {
      setFailed(true);
    }
    setProgress(null);
  };

  return (
    <button
      onClick={run}
      disabled={!!busy}
      className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 text-[11.5px] text-white/85 cursor-pointer disabled:cursor-default transition"
      title={t('احفظ كل ما تحتاجه الزيارة على هذا الجهاز لاستخدامه بلا اتصال', 'Keep everything a visit needs on this phone, for use without signal')}
    >
      {busy ? (
        <>
          <CloudDownload className="w-3.5 h-3.5 animate-pulse" />
          {t('جارٍ الحفظ', 'Saving')} {Math.round((100 * progress!.done) / progress!.total)}%
        </>
      ) : failed ? (
        <>
          <CloudOff className="w-3.5 h-3.5" />
          {t('تعذّر الحفظ، أعد المحاولة', 'Could not save, try again')}
        </>
      ) : saved ? (
        <>
          <CloudOff className="w-3.5 h-3.5" />
          {t('محفوظ للاستخدام بلا اتصال', 'Saved for offline')} · {new Date(saved.at).toLocaleDateString(lang === 'ar' ? 'ar' : 'en-GB')}
        </>
      ) : (
        <>
          <CloudDownload className="w-3.5 h-3.5" />
          {t('احفظ للاستخدام بلا اتصال', 'Save for offline')}
          {size ? ` (${mb(size)})` : ''}
        </>
      )}
    </button>
  );
};
