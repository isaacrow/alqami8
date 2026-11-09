import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { assetUrl } from '../../utils/assetUrl';
import {
  X,
  Scan,
  Box,
  Sparkles,
  Check,
  ArrowRight,
  ShieldCheck,
  Compass,
  Download,
  Copy,
  Layers,
  Sliders,
  RotateCw,
  Plus,
  Eye,
  FileCode,
  CheckCircle2,
  Maximize2,
  Trash2,
  ExternalLink,
} from 'lucide-react';
import {
  getAllReferenceObjects,
  RdfParsedMetadata,
  ScannedReferenceObject,
  saveCustomScannedObject,
  generateCustomTurtle,
} from '../../utils/alqamiRdfStore';
import { spatialSound } from '../../utils/spatialSound';
import { ALQAMI_ARTIFACTS, AlqamiArtifact } from '../../data/alqamiArtifacts';
import { CodeReader } from '../../scan/codeReader';
import { resolveCode } from '../../scan/resolveCode';

interface AlqamiARKitObjectScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onDeployInSpace?: (artifact: AlqamiArtifact) => void;
  onOpenDetail?: (artifact: AlqamiArtifact) => void;
  /** A scanned QR label or book barcode matched a published Moon record. */
  onMoonRecord?: (recordId: string) => void;
}

export const AlqamiARKitObjectScanner: React.FC<AlqamiARKitObjectScannerProps> = ({
  isOpen,
  onClose,
  onDeployInSpace,
  onOpenDetail,
  onMoonRecord,
}) => {
  // Catalog identification by printed QR label, plus metadata record creation.
  const [activeMode, setActiveMode] = useState<'detect' | 'scan'>('detect');

  // Detection state
  const referenceObjects = getAllReferenceObjects();
  const [selectedTargetIndex, setSelectedTargetIndex] = useState(0);
  const [activeRdfTab, setActiveRdfTab] = useState<'summary' | 'transcription' | 'turtle' | 'bibframe'>('summary');
  const [scanMessage, setScanMessage] = useState('وجّه الكاميرا نحو ملصق QR أو باركود الكتاب · Point at a QR label or a book barcode');
  const [copiedRdf, setCopiedRdf] = useState(false);
  const [isLockedOnObject, setIsLockedOnObject] = useState(false);

  // The web workflow stores an RDF record; it does not reconstruct a 3D scan.

  // Custom Metadata Form
  const [customForm, setCustomForm] = useState({
    scanName: 'My Scanned Heritage Artifact',
    titleAr: '',
    titleEn: '',
    creatorAr: '',
    date: '',
    materialsAr: '',
    dimensions: '',
    transcriptionAr: '',
  });

  const [savedSuccessToast, setSavedSuccessToast] = useState(false);

  // Live camera and QR decoder refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const activeTarget = referenceObjects[selectedTargetIndex] || referenceObjects[0];

  const downloadCatalogLabel = async () => {
    const dataUrl = await QRCode.toDataURL(`ALQAMI:${activeTarget.id}`, {
      width: 720,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#111827', light: '#ffffff' },
    });
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `alqami-${activeTarget.slug}-label.png`;
    link.click();
    setScanMessage('تم تنزيل ملصق QR. اطبعه وضعه قرب القطعة ليتعرف عليها الماسح.');
  };

  // Read QR labels and book barcodes (ISBN) from the live camera. A Moon link, Moon URI or ISBN opens the Moon
  // record; an ALQAMI label ("ALQAMI:<id>", "?artifact=<id>") selects one of the objects listed here.
  useEffect(() => {
    if (!isOpen || activeMode !== 'detect') return;
    let disposed = false;
    let timer = 0;
    let lastText = '';
    let lastAt = 0;
    const reader = new CodeReader();

    const tick = async () => {
      const video = videoRef.current;
      try {
        const code = video ? await reader.read(video) : null;
        // The same code held in view is resolved once, not every frame.
        if (code && !disposed && (code.text !== lastText || performance.now() - lastAt > 4000)) {
          lastText = code.text;
          lastAt = performance.now();
          setScanMessage('جارٍ البحث في مون… · Looking it up in Moon…');
          const target = await resolveCode(code.text);
          if (disposed) return;
          if (target.kind === 'moon') {
            spatialSound.playPinchTap();
            setScanMessage('وُجد في مون · Found in Moon');
            onMoonRecord?.(target.recordId);
          } else if (target.kind === 'artifact') {
            const targetIndex = referenceObjects.findIndex((item) =>
              [item.id, item.slug].some((value) => value.toLowerCase() === target.id.toLowerCase())
            );
            if (targetIndex >= 0) {
              setSelectedTargetIndex(targetIndex);
              setIsLockedOnObject(true);
              setScanMessage('تم التعرّف على رمز القطعة · Object label recognised');
            } else {
              setScanMessage(`رمز غير موجود في السجل · Not in the catalogue: ${target.id.slice(0, 48)}`);
            }
          } else if (target.reason === 'not-in-moon') {
            setScanMessage(`غير مفهرس في مون بعد · Not catalogued in Moon yet: ${target.text.slice(0, 48)}`);
          } else {
            setScanMessage(`رمز غير معروف · Code not recognised: ${target.text.slice(0, 48)}`);
          }
        }
      } catch {
        // Moon unreachable or a decoding hiccup: keep scanning.
      }
      if (!disposed) timer = window.setTimeout(tick, 200);
    };
    void tick();

    return () => {
      disposed = true;
      window.clearTimeout(timer);
      reader.dispose();
    };
  }, [isOpen, activeMode]);

  // Camera stream setup
  useEffect(() => {
    if (!isOpen) {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      return;
    }

    let active = true;

    async function initCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });

        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        setScanMessage('الكاميرا جاهزة — امسح رمز ALQAMI على القطعة أو اختر سجلاً للمعاينة');
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
      } catch (err) {
        console.warn('Camera access is unavailable:', err);
        setScanMessage('تعذّر فتح الكاميرا. استخدم Safari عبر HTTPS واسمح بالوصول للكاميرا.');
      }
    }

    initCamera();

    return () => {
      active = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [isOpen]);

  // Copy Turtle / RDF Code
  const handleCopyCode = () => {
    const code = activeTarget.metadata.rawTtl || activeTarget.metadata.rawRdf || '';
    navigator.clipboard.writeText(code);
    setCopiedRdf(true);
    spatialSound.playPinchTap?.();
    window.setTimeout(() => setCopiedRdf(false), 2000);
  };

  // Download .ttl or .rdf file
  const handleDownloadRdf = () => {
    const code = activeTarget.metadata.rawTtl || activeTarget.metadata.rawRdf || '';
    const blob = new Blob([code], { type: 'text/turtle;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeTarget.slug}-ontology.ttl`;
    a.click();
    URL.revokeObjectURL(url);
    spatialSound.playPinchTap?.();
  };

  // Save a custom catalog record and download its JSON metadata.
  const handleSaveScannedObject = () => {
    const newTtl = generateCustomTurtle({
      titleAr: customForm.titleAr || customForm.scanName,
      titleEn: customForm.titleEn,
      creatorAr: customForm.creatorAr,
      date: customForm.date,
      materialsAr: customForm.materialsAr,
      dimensions: customForm.dimensions,
      transcriptionAr: customForm.transcriptionAr,
    });

    const customId = `ALQ-CUSTOM-${Date.now()}`;

    const newObj: ScannedReferenceObject = {
      id: customId,
      scanName: customForm.scanName,
      timestamp: Date.now(),
      boundingBox: { widthCm: 0, heightCm: 0, depthCm: 0 },
      origin: { x: 0, y: 0, z: 0 },
      featurePointsCount: 0,
      coverageScore: 0,
      metadata: {
        uri: `urn:alqami:artifact:${customId}`,
        type: 'schema:VisualArtwork',
        titleAr: customForm.titleAr || customForm.scanName,
        titleEn: customForm.titleEn || customForm.scanName,
        creatorAr: customForm.creatorAr || 'حرفي غير معروف',
        creatorEn: '',
        date: customForm.date,
        materialsAr: customForm.materialsAr,
        materialsEn: '',
        dimensions: customForm.dimensions,
        publisherAr: 'مستودع علقمي',
        publisherEn: 'Alqami catalog',
        identifier: customId,
        transcriptionAr: customForm.transcriptionAr,
        rawTtl: newTtl,
        summaryAr: customForm.transcriptionAr || customForm.titleAr || customForm.scanName,
        summaryEn: customForm.titleEn || customForm.scanName,
      },
      customRdfTurtle: newTtl,
    };

    saveCustomScannedObject(newObj);
    setSelectedTargetIndex(getAllReferenceObjects().findIndex((item) => item.id === newObj.id));

    // Store metadata only; this browser flow does not reconstruct a 3D mesh.
    const recordBlob = new Blob([JSON.stringify(newObj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(recordBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${customForm.scanName.replace(/[^\p{L}\p{N}-]+/gu, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);

    setSavedSuccessToast(true);
    spatialSound.playAlqamiChime();
    window.setTimeout(() => {
      setSavedSuccessToast(false);
      setActiveMode('detect');
    }, 1800);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[88] bg-black/92 backdrop-blur-2xl flex flex-col justify-between p-3 sm:p-5 select-none animate-in fade-in duration-200">
      {/* ── TOP HEADER / MODE SWITCHER ── */}
      <div className="flex items-center justify-between z-20 gap-3">
      {/* Camera QR scanner status */}
        <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full vision-glass border border-emerald-400/40 text-xs font-semibold text-emerald-300 shadow-[0_0_20px_rgba(52,211,153,0.35)]">
          <Scan className="w-4 h-4 animate-pulse text-emerald-300" />
          <span>مسح رمز القطعة وبياناتها • Camera QR scanner</span>
        </div>

        {/* Mode Selector Toggle: Detect vs Scan */}
        <div className="flex items-center gap-1 p-1 rounded-full vision-glass border border-white/20 bg-black/40">
          <button
            onClick={() => {
              spatialSound.playPinchTap?.();
              setActiveMode('detect');
            }}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
              activeMode === 'detect'
                ? 'bg-emerald-400 text-black shadow-md font-bold'
                : 'text-white/80 hover:text-white'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>مسح رمز الفهرس (Scan catalog code)</span>
          </button>

          <button
            onClick={() => {
              spatialSound.playPinchTap?.();
              setActiveMode('scan');
            }}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
              activeMode === 'scan'
                ? 'bg-amber-400 text-black shadow-md font-bold'
                : 'text-white/80 hover:text-white'
            }`}
          >
            <Box className="w-3.5 h-3.5" />
            <span>إضافة سجل بيانات (Add metadata record)</span>
          </button>
        </div>

        {/* Close Button */}
        <button
          onClick={onClose}
          className="w-9 h-9 rounded-full vision-glass border border-white/20 flex items-center justify-center text-white hover:bg-white/20 transition cursor-pointer active:scale-95"
          title="Close Scanner"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

        {/* Live camera view and QR metadata overlay */}
      <div className="relative flex-1 my-2 rounded-[28px] overflow-hidden border border-white/20 bg-black/60 flex items-center justify-center">
        {/* Real camera video */}
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="w-full h-full object-cover pointer-events-none"
        />

        {activeMode === 'detect' && (
          <>
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 px-4 py-2 rounded-full vision-glass border border-white/20 bg-black/65 text-white text-xs text-center max-w-[92%] pointer-events-none">
              {scanMessage}
            </div>
            <div className="absolute inset-0 z-10 pointer-events-none flex items-center justify-center">
              <div className="w-56 h-40 border-2 border-emerald-300/80 rounded-2xl shadow-[0_0_28px_rgba(52,211,153,0.3)]" />
            </div>
          </>
        )}

        {/* 3D rendering is reserved for the catalog preview; camera recognition uses QR data. */}

        {/* Catalog metadata card. Touch selection is used on phones instead of hover. */}
        {activeMode === 'detect' && isLockedOnObject && (
          <div
            dir="rtl"
            style={{
              transform: 'translate(-50%, -60%)',
            }}
            className="absolute top-1/2 left-1/2 z-30 w-[min(480px,92vw)] p-4 sm:p-5 rounded-[26px] vision-glass border border-emerald-400/60 bg-[#0a1324]/90 shadow-[0_20px_50px_rgba(0,0,0,0.85)] space-y-3.5 animate-in zoom-in-95 duration-200 pointer-events-auto"
          >
            {/* Pre-entered catalog metadata */}
            <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-emerald-400/20 border border-emerald-400 flex items-center justify-center text-emerald-300">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white leading-tight">
                    {activeTarget.metadata.titleAr}
                  </h3>
                  <span className="text-[10px] text-white/70 font-sans">
                    {activeTarget.metadata.titleEn}
                  </span>
                </div>
              </div>

              <div className="text-left font-mono">
                <span className="text-xs font-bold text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full border border-emerald-400/30">
                  {activeTarget.isCustom ? 'سجل مخصص' : 'سجل فهرس'}
                </span>
                {activeTarget.defaultBox.widthCm > 0 && activeTarget.defaultBox.heightCm > 0 && (
                  <div className="text-[9px] text-white/50 pt-0.5">
                    {activeTarget.defaultBox.widthCm}×{activeTarget.defaultBox.heightCm}×{activeTarget.defaultBox.depthCm} cm
                  </div>
                )}
              </div>
            </div>

            {/* RDF Navigation Tabs */}
            <div className="flex items-center gap-1 p-0.5 rounded-xl bg-white/10 text-[11px] font-semibold">
              <button
                onClick={() => setActiveRdfTab('summary')}
                className={`flex-1 py-1 rounded-lg transition ${
                  activeRdfTab === 'summary' ? 'bg-emerald-400 text-black font-bold' : 'text-white/70 hover:text-white'
                }`}
              >
                ملخص الوصف
              </button>
              <button
                onClick={() => setActiveRdfTab('transcription')}
                className={`flex-1 py-1 rounded-lg transition ${
                  activeRdfTab === 'transcription' ? 'bg-emerald-400 text-black font-bold' : 'text-white/70 hover:text-white'
                }`}
              >
                النص التراثي
              </button>
              <button
                onClick={() => setActiveRdfTab('turtle')}
                className={`flex-1 py-1 rounded-lg transition flex items-center justify-center gap-1 ${
                  activeRdfTab === 'turtle' ? 'bg-emerald-400 text-black font-bold' : 'text-white/70 hover:text-white'
                }`}
              >
                <FileCode className="w-3 h-3" />
                <span>W3C Turtle</span>
              </button>
            </div>

            {/* Tab 1: Summary */}
            {activeRdfTab === 'summary' && (
              <div className="space-y-2 text-xs text-white/85">
                <div className="grid grid-cols-2 gap-2 text-[11px] bg-white/5 p-2.5 rounded-xl border border-white/10">
                  <div>
                    <span className="text-white/50 block">المؤلف / الصانع:</span>
                    <span className="font-semibold text-amber-200">{activeTarget.metadata.creatorAr}</span>
                  </div>
                  <div>
                    <span className="text-white/50 block">التاريخ / العصر:</span>
                    <span className="font-semibold text-emerald-200">{activeTarget.metadata.date}</span>
                  </div>
                  <div>
                    <span className="text-white/50 block">المادة والأبعاد:</span>
                    <span>{activeTarget.metadata.materialsAr} ({activeTarget.metadata.dimensions})</span>
                  </div>
                  <div>
                    <span className="text-white/50 block">مكان الحفظ / المستودع:</span>
                    <span className="truncate block">{activeTarget.metadata.publisherAr}</span>
                  </div>
                </div>

                <div className="text-[11px] font-mono text-cyan-300/90 truncate bg-cyan-950/40 p-1.5 rounded-lg border border-cyan-800/40">
                  URI: &lt;{activeTarget.metadata.uri}&gt;
                </div>
              </div>
            )}

            {/* Tab 2: Transcription */}
            {activeRdfTab === 'transcription' && (
              <div className="max-h-36 overflow-y-auto custom-scrollbar p-2.5 rounded-xl bg-black/40 border border-white/10 text-xs text-amber-100/95 leading-relaxed font-serif">
                {activeTarget.metadata.transcriptionAr}
              </div>
            )}

            {/* Tab 3: Raw RDF / Turtle Code */}
            {activeRdfTab === 'turtle' && (
              <div className="relative">
                <pre className="max-h-40 overflow-y-auto text-left custom-scrollbar p-2.5 rounded-xl bg-black/80 border border-white/15 text-[10px] font-mono text-emerald-300 leading-tight">
                  {activeTarget.metadata.rawTtl}
                </pre>
                <div className="absolute top-2 left-2 flex items-center gap-1.5">
                  <button
                    onClick={handleCopyCode}
                    className="p-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white text-[10px] font-mono flex items-center gap-1 transition"
                  >
                    {copiedRdf ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedRdf ? 'تم النسخ' : 'نسخ'}</span>
                  </button>
                  <button
                    onClick={handleDownloadRdf}
                    className="p-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white text-[10px] font-mono flex items-center gap-1 transition"
                  >
                    <Download className="w-3 h-3" />
                    <span>تحميل .ttl</span>
                  </button>
                </div>
              </div>
            )}

            {/* Existing catalog models can be previewed; metadata-only records cannot. */}
            {!activeTarget.isCustom && <div className="flex items-center gap-2 pt-1 border-t border-white/10">
              <button
                onClick={() => {
                  spatialSound.playPinchTap?.();
                  const matchingArtifact = ALQAMI_ARTIFACTS.find((a) => a.id === activeTarget.id) || ALQAMI_ARTIFACTS[0];
                  onDeployInSpace?.(matchingArtifact);
                  onClose();
                }}
                className="flex-1 py-2 px-3.5 rounded-full bg-emerald-400 hover:bg-emerald-300 text-black font-bold text-xs shadow-lg flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition"
              >
                <Box className="w-4 h-4" />
                <span>انشر النسخة ثلاثية الأبعاد (Deploy 3D Replica)</span>
              </button>

              <button
                onClick={() => {
                  spatialSound.playPinchTap?.();
                  const matchingArtifact = ALQAMI_ARTIFACTS.find((a) => a.id === activeTarget.id) || ALQAMI_ARTIFACTS[0];
                  onOpenDetail?.(matchingArtifact);
                  onClose();
                }}
                className="py-2 px-3.5 rounded-full vision-glass border border-white/20 text-white hover:bg-white/15 text-xs font-semibold flex items-center justify-center gap-1 cursor-pointer transition active:scale-95"
              >
                <span>تفاصيل القطعة</span>
                <ArrowRight className="w-3.5 h-3.5 rotate-180" />
              </button>
            </div>}
            {activeTarget.isCustom && (
              <div className="pt-2 border-t border-white/10 text-xs text-amber-100/80">
                سجل بيانات فقط. لا يوجد نموذج ثلاثي الأبعاد مرفق بهذا السجل.
              </div>
            )}
          </div>
        )}

        {/* Metadata registration. This browser flow does not reconstruct a 3D mesh. */}
        {activeMode === 'scan' && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 px-4 py-2 rounded-xl vision-glass border border-amber-400/40 bg-black/75 text-[11px] text-amber-100 text-center max-w-md">
            أدخل بيانات القطعة لحفظ سجل فهرس. هذا النموذج لا ينشئ مسحاً ثلاثي الأبعاد.
          </div>
        )}
      </div>

      {/* ── BOTTOM DOCK CONTROLS ── */}
      <div className="z-20 pt-1">
        {/* Detect Mode: Quick Switcher for Detectable Artifacts */}
        {activeMode === 'detect' && (
          <div className="flex items-center justify-between gap-3 overflow-x-auto py-1 custom-scrollbar">
            <span className="text-xs font-bold text-white/80 whitespace-nowrap pl-1">
              السجلات المتاحة للمعاينة (Catalog records):
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={downloadCatalogLabel}
                className="px-3 py-1.5 rounded-2xl flex items-center gap-2 text-xs transition cursor-pointer whitespace-nowrap vision-glass border border-amber-300/50 text-amber-100 hover:bg-white/15"
                title="Download a printable QR label for this record"
              >
                <Download className="w-4 h-4" />
                <span>تنزيل ملصق QR</span>
              </button>
              {referenceObjects.map((refObj, idx) => (
                <button
                  key={refObj.id}
                  onClick={() => {
                    spatialSound.playPinchTap?.();
                    setSelectedTargetIndex(idx);
                    setIsLockedOnObject(true);
                    setScanMessage('معاينة من الفهرس — وجّه الكاميرا نحو رمز هذه القطعة للتعرّف عليها');
                  }}
                  className={`px-3 py-1.5 rounded-2xl flex items-center gap-2 text-xs transition cursor-pointer whitespace-nowrap ${
                    selectedTargetIndex === idx
                      ? 'bg-emerald-400 text-black font-bold shadow-[0_0_15px_rgba(52,211,153,0.4)]'
                      : 'vision-glass border border-white/15 text-white hover:bg-white/15'
                  }`}
                >
                  {refObj.image ? (
                    <img
                      src={assetUrl(refObj.image)}
                      alt={refObj.name}
                      className="w-5 h-5 rounded-md object-cover bg-black/40"
                    />
                  ) : (
                    <Box className="w-4 h-4" aria-hidden="true" />
                  )}
                  <span>{refObj.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Scan Mode Step 4: Metadata Form */}
        {activeMode === 'scan' && (
          <div
            dir="rtl"
            className="p-4 rounded-2xl vision-glass border border-white/25 bg-[#0e1628]/95 space-y-3 max-h-[38vh] overflow-y-auto custom-scrollbar"
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <h4 className="text-xs font-bold text-amber-300">إضافة سجل بيانات (RDF / Turtle)</h4>
              <span className="text-[10px] text-white/50">Metadata only • No 3D reconstruction</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
              <div>
                <label className="text-[10px] text-white/60 block mb-1">اسم المجسم (Title AR):</label>
                <input
                  type="text"
                  value={customForm.titleAr}
                  onChange={(e) => setCustomForm((p) => ({ ...p, titleAr: e.target.value }))}
                  placeholder="مثال: خوذة قتالية مذهبة"
                  className="w-full px-3 py-1.5 rounded-xl bg-black/50 border border-white/20 text-white text-xs focus:border-amber-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[10px] text-white/60 block mb-1">الاسم بالإنجليزية (Title EN):</label>
                <input
                  type="text"
                  value={customForm.titleEn}
                  onChange={(e) => setCustomForm((p) => ({ ...p, titleEn: e.target.value }))}
                  placeholder="e.g. Ancient Islamic Gilded Helmet"
                  className="w-full px-3 py-1.5 rounded-xl bg-black/50 border border-white/20 text-white text-xs focus:border-amber-400 focus:outline-none text-left"
                />
              </div>

              <div>
                <label className="text-[10px] text-white/60 block mb-1">الصانع / المصدر:</label>
                <input
                  type="text"
                  value={customForm.creatorAr}
                  onChange={(e) => setCustomForm((p) => ({ ...p, creatorAr: e.target.value }))}
                  placeholder="صانع غير معروف (العصر العثماني/الصفوي)"
                  className="w-full px-3 py-1.5 rounded-xl bg-black/50 border border-white/20 text-white text-xs focus:border-amber-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[10px] text-white/60 block mb-1">المادة والمواصفات:</label>
                <input
                  type="text"
                  value={customForm.materialsAr}
                  onChange={(e) => setCustomForm((p) => ({ ...p, materialsAr: e.target.value }))}
                  placeholder="صلب مطروق، ذهب، فضة"
                  className="w-full px-3 py-1.5 rounded-xl bg-black/50 border border-white/20 text-white text-xs focus:border-amber-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[10px] text-white/60 block mb-1">التاريخ أو الفترة:</label>
                <input
                  type="text"
                  value={customForm.date}
                  onChange={(e) => setCustomForm((p) => ({ ...p, date: e.target.value }))}
                  className="w-full px-3 py-1.5 rounded-xl bg-black/50 border border-white/20 text-white text-xs focus:border-amber-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[10px] text-white/60 block mb-1">الأبعاد المسجلة:</label>
                <input
                  type="text"
                  value={customForm.dimensions}
                  onChange={(e) => setCustomForm((p) => ({ ...p, dimensions: e.target.value }))}
                  placeholder="الارتفاع × العرض × العمق (سم)"
                  className="w-full px-3 py-1.5 rounded-xl bg-black/50 border border-white/20 text-white text-xs focus:border-amber-400 focus:outline-none"
                />
              </div>

              <div className="col-span-full">
                <label className="text-[10px] text-white/60 block mb-1">النص التراثي أو الوصف (Transcription):</label>
                <textarea
                  rows={2}
                  value={customForm.transcriptionAr}
                  onChange={(e) => setCustomForm((p) => ({ ...p, transcriptionAr: e.target.value }))}
                  placeholder="اكتب هنا النص التاريخي أو الوصف للقطعة..."
                  className="w-full px-3 py-1.5 rounded-xl bg-black/50 border border-white/20 text-white text-xs focus:border-amber-400 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
              <button
                onClick={handleSaveScannedObject}
                className="px-5 py-2 rounded-full bg-emerald-400 hover:bg-emerald-300 text-black font-bold text-xs shadow-md flex items-center gap-1.5 cursor-pointer active:scale-95 transition"
              >
                <Download className="w-4 h-4" />
                <span>حفظ سجل البيانات وملف JSON (Save record)</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Saved Toast */}
      {savedSuccessToast && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 px-6 py-4 rounded-2xl vision-glass border border-emerald-400 bg-black/90 text-emerald-300 font-bold text-sm shadow-2xl flex items-center gap-2 animate-in zoom-in-95">
          <CheckCircle2 className="w-5 h-5" />
          <span>تم حفظ سجل البيانات وملف JSON!</span>
        </div>
      )}
    </div>
  );
};
