import React, { useEffect, useRef, useState } from 'react';
import { PhoneCommand, sendPhoneCamera } from './phoneCamera';

/** <model-viewer> (public/js): the same viewer as the AR page; AR Quick Look on iPhone, Scene Viewer on Android. */
let viewerLoading: Promise<void> | null = null;
function loadModelViewer() {
  viewerLoading ??= new Promise((resolve, reject) => {
    if (customElements.get('model-viewer')) return resolve();
    const s = document.createElement('script');
    s.type = 'module';
    s.src = new URL('js/model-viewer.min.js', new URL(import.meta.env.BASE_URL || './', location.href)).href;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('model-viewer'));
    document.head.appendChild(s);
  });
  return viewerLoading;
}

/**
 * What the phone shows when it opens the PC's QR code: its camera, going to the PC; and, when the PC sends one,
 * a 3D object over it, to turn with a finger or to place in the room (AR).
 */
export const PhoneCameraPage: React.FC<{ hostId: string }> = ({ hostId }) => {
  const video = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState('');
  const [running, setRunning] = useState(false);
  const [shown, setShown] = useState<{ model: string; title: string } | null>(null);
  const stop = useRef<(() => void) | null>(null);

  useEffect(() => () => stop.current?.(), []);
  useEffect(() => {
    if (shown) void loadModelViewer().catch(() => undefined);
  }, [shown]);

  const onCommand = (c: PhoneCommand) => {
    if (c.t === 'show') {
      setShown({ model: c.model, title: c.title });
      navigator.vibrate?.(30);
    } else setShown(null);
  };

  const start = async () => {
    if (!video.current) return;
    setRunning(true);
    setStatus('يبدأ… · Starting…');
    try {
      stop.current = await sendPhoneCamera(hostId, video.current, setStatus, onCommand);
    } catch (e) {
      setRunning(false);
      setStatus(`تعذّر تشغيل الكاميرا · Camera unavailable: ${(e as Error).message}`);
    }
  };

  return (
    <div dir="rtl" className="fixed inset-0 bg-black text-white flex flex-col">
      <video ref={video} playsInline muted autoPlay className="absolute inset-0 w-full h-full object-cover" />
      <div className="relative z-10 p-4 pt-[calc(env(safe-area-inset-top)+16px)] bg-gradient-to-b from-black/80 to-transparent">
        <p className="text-[17px] font-semibold">كاميرا علقمي على الحاسوب</p>
        <p className="text-[12.5px] text-white/70">ALQAMI on your PC is using this phone as its camera.</p>
        {status && <p className="mt-2 inline-block px-3 py-1 rounded-full bg-white/15 text-[12.5px]">{status}</p>}
      </div>
      <div className="relative z-10 mt-auto p-4 pb-[calc(env(safe-area-inset-bottom)+20px)] bg-gradient-to-t from-black/80 to-transparent">
        {!running ? (
          <button onClick={start} className="w-full h-14 rounded-full bg-[#FFD60A] text-black text-[16px] font-semibold">
            ابدأ · Start camera
          </button>
        ) : (
          <p className="text-center text-[12px] text-white/70">أبقِ هذه الصفحة مفتوحة · Keep this page open — move the phone to look around</p>
        )}
      </div>

      {shown && (
        <div className="absolute inset-0 z-20 bg-[#0c0a09] flex flex-col">
          <div className="flex items-center gap-3 p-4 pt-[calc(env(safe-area-inset-top)+12px)]">
            <p className="flex-1 text-[16px] font-semibold leading-snug" dir="auto">
              {shown.title}
            </p>
            <button onClick={() => setShown(null)} aria-label="Close" className="w-10 h-10 rounded-full bg-white/12 text-[18px]">
              ✕
            </button>
          </div>
          {React.createElement(
            'model-viewer',
            {
              src: shown.model,
              alt: shown.title,
              'camera-controls': true,
              'touch-action': 'pan-y',
              'auto-rotate': true,
              'shadow-intensity': '1',
              exposure: '1.05',
              'environment-image': 'neutral',
              ar: true,
              'ar-modes': 'quick-look scene-viewer webxr',
              'ar-scale': 'auto',
              style: { flex: 1, width: '100%', background: 'radial-gradient(circle at 50% 40%, #2a2420, #0c0a09)' },
            },
            <button
              slot="ar-button"
              className="absolute bottom-[calc(env(safe-area-inset-bottom)+20px)] inset-x-4 h-14 rounded-full bg-[#FFD60A] text-black text-[16px] font-semibold"
            >
              ضعها في مكانك · View in your space (AR)
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default PhoneCameraPage;
