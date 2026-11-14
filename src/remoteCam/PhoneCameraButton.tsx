import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Smartphone, X } from 'lucide-react';
import { HostStatus, PhoneCameraHost } from './phoneCamera';

/** On the PC: "use your phone as the camera" — a QR to scan with the phone, and the connection's state. */
export const PhoneCameraButton: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<HostStatus | null>(null);
  const [qr, setQr] = useState('');
  const host = useRef<PhoneCameraHost | null>(null);

  useEffect(() => () => host.current?.stop(), []);
  useEffect(() => {
    if (status?.state === 'waiting') void QRCode.toDataURL(status.url, { margin: 1, width: 240 }).then(setQr);
  }, [status]);

  const toggle = () => {
    setOpen((o) => !o);
    if (!host.current) {
      host.current = new PhoneCameraHost(setStatus);
      void host.current.start().catch((e) => setStatus({ state: 'error', message: String(e) }));
    }
  };
  const disconnect = () => {
    host.current?.stop();
    host.current = null;
    setStatus(null);
    setQr('');
    setOpen(false);
  };
  const connected = status?.state === 'connected';

  return (
    <>
      <button
        onClick={toggle}
        className={`vision-btn w-8 h-8 rounded-full flex items-center justify-center transition active:scale-95 ${connected ? 'bg-emerald-400 text-black' : 'vision-ornament text-white/90'}`}
        title={connected ? 'Phone camera connected' : 'Use your phone as the camera'}
        aria-label="Phone as camera"
      >
        <Smartphone className="w-3.5 h-3.5" />
      </button>
      {open && (
        <div dir="rtl" className="fixed top-14 left-1/2 -translate-x-1/2 z-[95] w-[300px] rounded-3xl bg-black/80 backdrop-blur-xl border border-white/20 p-4 text-white shadow-2xl pointer-events-auto">
          <div className="flex items-center justify-between">
            <p className="text-[14px] font-semibold">الهاتف كاميرا · Phone as camera</p>
            <button onClick={() => setOpen(false)} aria-label="Close" className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center">
              <X className="w-4 h-4" />
            </button>
          </div>
          {!status && <p className="mt-3 text-[12.5px] text-white/70">يجهّز… · Preparing…</p>}
          {status?.state === 'waiting' && (
            <>
              <p className="mt-2 text-[12px] text-white/75">
                امسح الرمز بكاميرا الهاتف، ثم «ابدأ». يستخدم الواقع المعزز والمسح كاميرا الهاتف وحركته. · Scan with your phone, tap Start: AR and scanning will use the phone's camera and motion.
              </p>
              {qr && <img src={qr} alt="QR" title={status.url} data-url={status.url} className="mt-3 mx-auto w-48 h-48 rounded-xl bg-white p-2" />}
            </>
          )}
          {connected && (
            <>
              <p className="mt-3 text-[13px] text-emerald-300">● متصل · Connected ({status.label})</p>
              <p className="mt-1 text-[12px] text-white/70">افتح العالم المكاني أو الماسح — سيستخدمان كاميرا الهاتف. · Open the AR world or the scanner: they use the phone's camera now.</p>
              <button onClick={disconnect} className="mt-3 w-full h-9 rounded-full bg-white/15 text-[12.5px]">
                افصل · Disconnect
              </button>
            </>
          )}
          {status?.state === 'error' && <p className="mt-3 text-[12.5px] text-rose-300">تعذّر الاتصال · Could not connect: {status.message}</p>}
        </div>
      )}
    </>
  );
};
