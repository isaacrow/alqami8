import React, { useEffect, useRef, useState } from 'react';
import { Camera, Check, Download, Trash2 } from 'lucide-react';
import { ALQAMI_ARTIFACTS } from '../../data/alqamiArtifacts';
import { useMoonSearch } from '../../moon/useMoon';
import { Embedder } from '../../recognize/embedder';
import { encodeView } from '../../recognize/recognitionIndex';
import { EnrolledObject, enrolmentZip, listEnrolled, removeEnrolled, saveEnrolled } from '../../recognize/localEnrol';

/**
 * "Teach ALQAMI": photograph an object from the sides visitors will see and link it to its Moon record (or a built-in
 * object). This phone recognises it at once; the photos can be exported for the repository's enrol/ folder, which the
 * nightly index build turns into recognition for everyone.
 */

const SHOTS = [
  'الواجهة · Front',
  'الجانب الأيسر · Left side',
  'الجانب الأيمن · Right side',
  'الخلف · Back',
  'من الأعلى · From above',
  'عن قرب · Close up',
  'القطعة كاملة · The whole object',
];
const MIN_SHOTS = 5;

interface Target {
  key: string;
  title: string;
}

// The centre square of the frame, as recognition sees it (Embedder crops 80% of the short side), saved at 640 px.
function captureSquare(video: HTMLVideoElement): HTMLCanvasElement | null {
  if (!video.videoWidth) return null;
  const side = Math.min(video.videoWidth, video.videoHeight) * 0.8;
  const c = document.createElement('canvas');
  c.width = 640;
  c.height = 640;
  c.getContext('2d')!.drawImage(video, (video.videoWidth - side) / 2, (video.videoHeight - side) / 2, side, side, 0, 0, 640, 640);
  return c;
}

export const TeachPanel: React.FC<{ videoRef: React.RefObject<HTMLVideoElement | null>; onTaught?: () => void }> = ({ videoRef, onTaught }) => {
  const [query, setQuery] = useState('');
  const [target, setTarget] = useState<Target | null>(null);
  const [shots, setShots] = useState<Array<{ photo: Blob; view: string; thumb: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [taught, setTaught] = useState<EnrolledObject[]>([]);
  const [saved, setSaved] = useState<string | null>(null);
  const embedder = useRef<Embedder | null>(null);
  const search = useMoonSearch(query.trim(), 'ar', 6);

  useEffect(() => {
    embedder.current = new Embedder();
    void listEnrolled().then(setTaught);
    return () => {
      void embedder.current?.dispose();
      shots.forEach((s) => URL.revokeObjectURL(s.thumb));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const take = async () => {
    const video = videoRef.current;
    if (!video || !embedder.current || busy) return;
    setBusy(true);
    try {
      const canvas = captureSquare(video);
      if (!canvas) return;
      const view = await embedder.current.embed(canvas);
      const photo = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
      if (view && photo) setShots((s) => [...s, { photo, view: encodeView(view), thumb: URL.createObjectURL(photo) }]);
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!target || shots.length < MIN_SHOTS) return;
    setBusy(true);
    await saveEnrolled({ key: target.key, title: target.title, views: shots.map((s) => s.view), photos: shots.map((s) => s.photo), savedAt: new Date().toISOString() });
    setTaught(await listEnrolled());
    setSaved(target.title);
    shots.forEach((s) => URL.revokeObjectURL(s.thumb));
    setShots([]);
    setTarget(null);
    setBusy(false);
    onTaught?.();
  };

  const exportZip = async () => {
    const blob = await enrolmentZip(taught);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `alqami-enrol-${new Date().toISOString().slice(0, 10)}.zip`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  };

  const chip = 'px-3 py-1.5 rounded-full text-[12px] border transition cursor-pointer active:scale-95';

  return (
    <div dir="rtl" className="p-4 rounded-2xl vision-glass border border-white/25 bg-[#0e1628]/95 space-y-3 max-h-[42vh] overflow-y-auto custom-scrollbar text-white">
      {saved && !target && (
        <p className="text-[12px] text-emerald-200 flex items-center gap-1.5">
          <Check className="w-4 h-4" /> تعلّم ALQAMI «{saved}» على هذا الجهاز · Learned on this phone
        </p>
      )}

      {!target ? (
        <>
          <h4 className="text-xs font-bold text-amber-300">١. ما هذه القطعة؟ · What is this object?</h4>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ابحث في مون · Search Moon"
            className="w-full h-9 px-3 rounded-xl bg-white/10 border border-white/20 text-[13px] placeholder-white/40 focus:outline-none"
          />
          <div className="flex flex-wrap gap-1.5">
            {search.state === 'ready' &&
              search.data.cards.map((c) => (
                <button key={c.id} dir="auto" onClick={() => setTarget({ key: `moon:${c.id}`, title: c.title })} className={`${chip} bg-white/10 border-white/20 hover:bg-white/20 max-w-[15rem] truncate`}>
                  {c.title}
                </button>
              ))}
          </div>
          <p className="text-[11px] text-white/50">أو قطعة من ALQAMI · or one of ALQAMI's objects</p>
          <div className="flex flex-wrap gap-1.5">
            {ALQAMI_ARTIFACTS.map((a) => (
              <button key={a.id} onClick={() => setTarget({ key: `artifact:${a.id}`, title: a.title.ar })} className={`${chip} bg-white/5 border-white/15 hover:bg-white/15`}>
                {a.title.ar}
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-xs font-bold text-amber-300 truncate" dir="auto">
              ٢. صوّر «{target.title}»
            </h4>
            <button onClick={() => setTarget(null)} className="text-[11px] text-white/60 underline cursor-pointer">
              تغيير · Change
            </button>
          </div>
          <p className="text-[12px] text-white/80">
            {shots.length < SHOTS.length ? `الصورة ${shots.length + 1}/${SHOTS.length}: ${SHOTS[shots.length]}` : 'يكفي هذا · That is plenty'} — داخل المربع الأخضر، في ضوء المكان.
          </p>
          <div className="flex items-center gap-2">
            <button onClick={take} disabled={busy || shots.length >= SHOTS.length} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-[#FFD60A] text-black text-[13px] font-semibold disabled:opacity-50 cursor-pointer active:scale-95">
              <Camera className="w-4 h-4" /> صوّر · Take photo
            </button>
            <button onClick={save} disabled={busy || shots.length < MIN_SHOTS} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-emerald-400 text-black text-[13px] font-semibold disabled:opacity-40 cursor-pointer active:scale-95">
              <Check className="w-4 h-4" /> احفظ · Save ({shots.length}/{MIN_SHOTS}+)
            </button>
          </div>
          {shots.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto">
              {shots.map((s, i) => (
                <img key={i} src={s.thumb} alt="" className="w-12 h-12 rounded-lg object-cover border border-white/20 flex-shrink-0" />
              ))}
            </div>
          )}
        </>
      )}

      {taught.length > 0 && (
        <div className="pt-2 border-t border-white/10 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-white/60">ما تعلّمه هذا الجهاز · Taught on this phone</span>
            <button onClick={exportZip} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-white/15 hover:bg-white/25 border border-white/20 text-[11.5px] cursor-pointer">
              <Download className="w-3.5 h-3.5" /> الصور لـ enrol/ · Photos (.zip)
            </button>
          </div>
          {taught.map((o) => (
            <div key={o.key} className="flex items-center justify-between gap-2 text-[12px]">
              <span dir="auto" className="truncate">
                {o.title} <span className="text-white/45">({o.photos.length})</span>
              </span>
              <button
                onClick={async () => {
                  await removeEnrolled(o.key);
                  setTaught(await listEnrolled());
                  onTaught?.();
                }}
                aria-label="حذف · Remove"
                className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
