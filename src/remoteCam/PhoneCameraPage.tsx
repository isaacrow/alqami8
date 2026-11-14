import React, { useEffect, useRef, useState } from 'react';
import { PhoneCommand, sendPhoneCamera } from './phoneCamera';
import { ModelOverlay } from '../components/three/ModelOverlay';

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

      {shown && <ModelOverlay model={shown.model} title={shown.title} onClose={() => setShown(null)} />}
    </div>
  );
};

export default PhoneCameraPage;
