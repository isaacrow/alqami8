import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { ALQAMI_ARTIFACTS, AlqamiArtifact } from '../data/alqamiArtifacts';
import { objectUrl } from './links';

/**
 * Every object's QR label on A4 sheets, ready to print and place beside the object (8 labels a page, 95 × 66 mm).
 * Each label: the QR (the object's web page, so any phone camera opens it; ALQAMI's scanner also places the 3D
 * model on it), the title in Arabic and English, the period, the ALQAMI ID, and how to use it.
 */
export const LabelSheet: React.FC = () => {
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [picked, setPicked] = useState<Set<string>>(() => new Set(ALQAMI_ARTIFACTS.map((a) => a.id)));
  useEffect(() => {
    void Promise.all(
      ALQAMI_ARTIFACTS.map(async (a) => [a.id, await QRCode.toDataURL(objectUrl(a.id), { width: 520, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#111111', light: '#ffffff' } })] as const)
    ).then((list) => setCodes(Object.fromEntries(list)));
  }, []);
  const chosen = ALQAMI_ARTIFACTS.filter((a) => picked.has(a.id));
  const toggle = (id: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div dir="rtl">
      <div className="no-print max-w-4xl mx-auto p-5 space-y-4">
        <h1 className="text-[22px] font-bold">ملصقات QR للقطع · QR labels</h1>
        <p className="text-[14px] text-white/70 leading-relaxed">
          اطبع الملصقات وضع كل ملصق قرب قطعته. أي كاميرا هاتف تفتح صفحة القطعة دون تطبيق، وماسح علقمي يُظهر المجسّم ثلاثي الأبعاد واقفًا على الرمز. ·
          <span dir="ltr">Print and place each label beside its object: any phone camera opens the object's page with no app, and ALQAMI's scanner stands its 3D model on the code.</span>
        </p>
        <div className="flex flex-wrap gap-2">
          {ALQAMI_ARTIFACTS.map((a) => (
            <label key={a.id} className={`px-3 h-9 rounded-full text-[13px] flex items-center gap-2 cursor-pointer ${picked.has(a.id) ? 'bg-white text-black' : 'bg-white/10'}`}>
              <input type="checkbox" className="sr-only" checked={picked.has(a.id)} onChange={() => toggle(a.id)} />
              {a.title.ar}
            </label>
          ))}
        </div>
        <button onClick={() => window.print()} className="h-11 px-6 rounded-full bg-[#FFD60A] text-black font-semibold">
          اطبع {chosen.length} ملصقًا · Print {chosen.length} labels
        </button>
      </div>
      <div className="sheet">
        {chosen.map((a) => (
          <Label key={a.id} a={a} qr={codes[a.id]} />
        ))}
      </div>
    </div>
  );
};

const Label: React.FC<{ a: AlqamiArtifact; qr?: string }> = ({ a, qr }) => (
  <div className="label">
    <div className="qr">{qr && <img src={qr} alt={`QR ${a.id}`} />}</div>
    <div className="text">
      <p className="ar">{a.title.ar}</p>
      <p className="en" dir="ltr">
        {a.title.en}
      </p>
      <p className="meta">
        <bdi>{a.period.ar}</bdi>
      </p>
      <p className="hint">
        امسح بكاميرا هاتفك
        <br />
        <span dir="ltr">Scan with your phone camera</span>
      </p>
      <p className="id" dir="ltr">
        ALQAMI · {a.id}
      </p>
    </div>
  </div>
);
