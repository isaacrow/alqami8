import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BookOpen, ScanEye, X } from 'lucide-react';
import { ALQAMI_ARTIFACTS } from '../../../data/alqamiArtifacts';
import { opacUrl } from '../../../moon/moonApi';
import { useMoonRecord } from '../../../moon/useMoon';
import { CodeReader } from '../../../scan/codeReader';
import { resolveCode } from '../../../scan/resolveCode';
import { SightRecognizer, SightTarget } from '../../../recognize/recognizer';

/**
 * Recognition inside the AR world, on the passthrough camera RealARXREngine already owns.
 *
 * QR labels and book barcodes are read all the time (cheap). Recognition by sight runs only when the visitor taps
 * Identify: the AR world already holds the camera and a 3D scene, and the sight model would add tens of MB on top,
 * so it loads for that one look and is released straight after.
 */

const SIGHT_TRY_MS = 6000;

export interface ArRecognitionState {
  recognized: { target: SightTarget; via: 'code' | 'sight' } | null;
  candidates: SightTarget[];
  identifying: boolean;
  sightFailed: boolean;
  identify: () => void;
  pick: (target: SightTarget) => void;
  dismiss: () => void;
}

const passthroughVideo = () => document.querySelector<HTMLVideoElement>('video[data-passthrough-video]');

export function useArRecognition(cameraActive: boolean): ArRecognitionState {
  const [recognized, setRecognized] = useState<ArRecognitionState['recognized']>(null);
  const [candidates, setCandidates] = useState<SightTarget[]>([]);
  const [identifying, setIdentifying] = useState(false);
  const [sightFailed, setSightFailed] = useState(false);
  const identifyRun = useRef(0);

  // Codes, continuously.
  useEffect(() => {
    if (!cameraActive) {
      setRecognized(null);
      return;
    }
    let disposed = false;
    let timer = 0;
    let lastText = '';
    const reader = new CodeReader();
    const tick = async () => {
      const video = passthroughVideo();
      try {
        const code = video ? await reader.read(video) : null;
        if (code && code.text !== lastText && !disposed) {
          lastText = code.text;
          const target = await resolveCode(code.text);
          if (!disposed && target.kind === 'moon') setRecognized({ target, via: 'code' });
          if (!disposed && target.kind === 'artifact') setRecognized({ target: { kind: 'artifact', id: target.id }, via: 'code' });
        }
      } catch {
        // A decoding hiccup or no signal: keep reading.
      }
      if (!disposed) timer = window.setTimeout(tick, 400);
    };
    void tick();
    return () => {
      disposed = true;
      window.clearTimeout(timer);
      reader.dispose();
    };
  }, [cameraActive]);

  // Sight, on request.
  const identify = useCallback(() => {
    const run = ++identifyRun.current;
    setIdentifying(true);
    setSightFailed(false);
    setCandidates([]);
    const sight = new SightRecognizer();
    (async () => {
      let last: SightTarget[] = [];
      try {
        await sight.prepare();
        // The look starts once the model is loaded (the first load alone takes seconds).
        const until = performance.now() + SIGHT_TRY_MS;
        while (run === identifyRun.current && performance.now() < until) {
          const video = passthroughVideo();
          if (!video) break;
          const result = await sight.step(video);
          if (result.kind === 'match') {
            setRecognized({ target: result.target, via: 'sight' });
            last = [];
            break;
          }
          if (result.kind === 'unsure') last = result.candidates.map((c) => c.target);
        }
      } catch {
        if (run === identifyRun.current) setSightFailed(true);
      } finally {
        await sight.dispose();
        if (run === identifyRun.current) {
          setCandidates(last);
          setIdentifying(false);
        }
      }
    })();
  }, []);

  useEffect(() => () => {
    identifyRun.current++;
  }, []);

  return {
    recognized,
    candidates,
    identifying,
    sightFailed,
    identify,
    pick: (target) => {
      setCandidates([]);
      setRecognized({ target, via: 'sight' });
    },
    dismiss: () => {
      setRecognized(null);
      setCandidates([]);
    },
  };
}

const CandidateChip: React.FC<{ target: SightTarget; onPick: () => void }> = ({ target, onPick }) => {
  const load = useMoonRecord(target.kind === 'moon' ? target.recordId : null, 'ar');
  const title =
    target.kind === 'moon'
      ? load?.state === 'ready'
        ? load.data.title
        : '…'
      : ALQAMI_ARTIFACTS.find((a) => a.id === target.id)?.title.ar ?? target.id;
  return (
    <button onClick={onPick} dir="auto" className="max-w-[14rem] truncate px-3 py-1.5 rounded-full bg-white/15 hover:bg-white/25 border border-white/20 text-[12px] cursor-pointer active:scale-95">
      {title}
    </button>
  );
};

const RecognizedCard: React.FC<{ target: SightTarget; via: 'code' | 'sight'; onDismiss: () => void }> = ({ target, via, onDismiss }) => {
  const load = useMoonRecord(target.kind === 'moon' ? target.recordId : null, 'ar');
  const artifact = target.kind === 'artifact' ? ALQAMI_ARTIFACTS.find((a) => a.id === target.id) : undefined;
  const card = load?.state === 'ready' ? load.data : null;
  const title = card?.title ?? artifact?.title.ar ?? (load?.state === 'loading' ? '…' : '');
  const line = card
    ? [card.contributors[0]?.label, card.date, card.publisher?.label].filter(Boolean).join(' · ')
    : artifact
      ? [artifact.period.ar, artifact.details.material.ar].filter(Boolean).join(' · ')
      : '';
  const moonId = target.kind === 'moon' ? target.recordId : null;
  return (
    <div dir="rtl" className="absolute left-1/2 top-[30%] z-[54] w-[min(380px,90vw)] -translate-x-1/2 rounded-2xl vision-glass border border-emerald-300/50 bg-[#071322]/85 p-3.5 text-white shadow-xl pointer-events-auto animate-in fade-in zoom-in-95 duration-200">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[9.5px] font-semibold tracking-wide text-emerald-200/90">
            {via === 'code' ? 'ALQAMI · تمت القراءة من الرمز' : 'ALQAMI · تم التعرّف بالنظر'}
          </div>
          <div className="mt-0.5 text-sm font-bold leading-snug" dir="auto">{title}</div>
          {line && <div className="mt-1 text-[11px] text-white/75" dir="auto">{line}</div>}
        </div>
        <button onClick={onDismiss} aria-label="إغلاق · Close" className="shrink-0 w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center cursor-pointer">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      {moonId && (
        <a href={opacUrl(moonId)} target="_blank" rel="noopener noreferrer" className="mt-2.5 inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-white text-black text-[12px] font-semibold">
          <BookOpen className="w-3.5 h-3.5" />
          افتح في مون · Open in Moon
        </a>
      )}
      {target.kind === 'moon' && load?.state === 'missing' && <div className="mt-2 text-[11px] text-white/60">هذا السجل غير منشور في مون.</div>}
    </div>
  );
};

/** The recognised record, the Identify button, and "is it one of these?" chips, over the AR world. */
export const ArRecognitionOverlay: React.FC<{ state: ArRecognitionState; cameraActive: boolean }> = ({ state, cameraActive }) => {
  if (!cameraActive) return null;
  return (
    <>
      {state.recognized && <RecognizedCard target={state.recognized.target} via={state.recognized.via} onDismiss={state.dismiss} />}
      <div className="absolute bottom-24 left-1/2 z-[54] -translate-x-1/2 flex flex-col items-center gap-2 pointer-events-auto w-[min(420px,92vw)]">
        {state.candidates.length > 0 && (
          <div className="px-3 py-2.5 rounded-2xl vision-glass border border-white/20 bg-black/70 text-white space-y-2">
            <p className="text-[11.5px] text-white/70 text-center">هل هو أحد هذه؟ · Is it one of these?</p>
            <div className="flex flex-wrap justify-center gap-1.5">
              {state.candidates.map((t) => (
                <CandidateChip key={t.kind === 'moon' ? t.recordId : t.id} target={t} onPick={() => state.pick(t)} />
              ))}
            </div>
          </div>
        )}
        <button
          onClick={state.identify}
          disabled={state.identifying}
          className="inline-flex items-center gap-2 h-10 px-4 rounded-full bg-[#FFD60A] text-black text-[13px] font-semibold shadow-lg disabled:opacity-70 cursor-pointer active:scale-95"
        >
          <ScanEye className="w-4 h-4" />
          {state.identifying ? 'جارٍ التعرّف… · Identifying…' : state.sightFailed ? 'أعد المحاولة · Try again' : 'تعرّف على القطعة · Identify'}
        </button>
      </div>
    </>
  );
};
