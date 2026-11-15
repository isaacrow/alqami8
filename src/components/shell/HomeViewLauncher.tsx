import React, { useState } from 'react';
import {
  Wifi,
  BatteryCharging,
  Users,
  Mountain,
  AppWindow,
  Layers,
  Bell,
  Search,
  Landmark,
  ScanLine,
  Images,
  Rotate3d,
  Feather,
  Swords,
  Mic,
  QrCode,
  Folder,
  X,
  Zap,
  Bot,
  Palette,
  Globe,
  Sparkles,
  Compass,
  StickyNote,
  Box,
  MessageCircle,
  MapPin,
  Monitor,
  Eye,
  type LucideIcon,
} from 'lucide-react';
import { AppId } from '../../types/spatial';
import { spatialSound } from '../../utils/spatialSound';

interface HomeViewLauncherProps {
  lang?: 'ar' | 'en';
  isOpen: boolean;
  onLaunchApp: (id: AppId) => void;
  onOpenControlCenter: () => void;
  onToggleEnvironments: () => void;
}

/**
 * The home screen. On top, the apps that make ALQAMI (the heritage gallery, the scanner and alqami3's two scan
 * modes, the three talking characters, the QR labels); everything else sits in one "More" folder. A grid that fits
 * the screen and scrolls, so every app is in reach on a phone. Icons are SVG (lucide), no emoji.
 */
interface HomeAppItem {
  key: string;
  /** Opens an app window... */
  id?: AppId;
  /** ...or a separate page. */
  href?: string;
  ar: string;
  en: string;
  bg: string;
  Icon: LucideIcon;
}

const MAIN: HomeAppItem[] = [
  { key: 'heritage', id: 'ikea', ar: 'تراث علقمي', en: 'Alqami Heritage', bg: 'linear-gradient(180deg, #1e3a8a 0%, #0f172a 100%)', Icon: Landmark },
  { key: 'scanner', id: 'object-tracking', ar: 'الماسح', en: 'Scanner', bg: 'linear-gradient(180deg, #ffd60a 0%, #f59e0b 100%)', Icon: ScanLine },
  { key: 'a3-scan', href: './alqami3-scan.html', ar: 'تتبع الصور', en: 'Picture tracking', bg: 'linear-gradient(180deg, #0ea5e9 0%, #0369a1 100%)', Icon: Images },
  { key: 'a3-360', href: './alqami3-360.html', ar: 'التعرّف 360°', en: '360° recognition', bg: 'linear-gradient(180deg, #14b8a6 0%, #0f766e 100%)', Icon: Rotate3d },
  { key: 'jawahiri', href: './jawahiri.html', ar: 'الجواهري', en: 'al-Jawahiri', bg: 'radial-gradient(circle at 50% 30%, #6b5536, #1a140c)', Icon: Feather },
  { key: 'mutanabbi', href: './mutanabbi.html', ar: 'المتنبي', en: 'al-Mutanabbi', bg: 'radial-gradient(circle at 50% 30%, #7a5a2e, #1a1209)', Icon: Swords },
  { key: 'waili', href: './waili.html', ar: 'الوائلي', en: 'al-Waili', bg: 'radial-gradient(circle at 50% 30%, #4a3a2a, #120d08)', Icon: Mic },
  { key: 'labels', href: './labels.html', ar: 'ملصقات QR', en: 'QR labels', bg: 'linear-gradient(180deg, #f8fafc 0%, #94a3b8 100%)', Icon: QrCode },
];

const MORE: HomeAppItem[] = [
  { key: 'tools', id: 'tools-hub', ar: 'مركز الأدوات', en: 'Tools Hub', bg: 'linear-gradient(180deg, #10b981 0%, #059669 100%)', Icon: Zap },
  { key: 'siri', id: 'siri', ar: 'المساعد', en: 'Assistant', bg: 'radial-gradient(circle at 35% 25%, #3a3a3c, #141416)', Icon: Bot },
  { key: 'photos', id: 'photos', ar: 'الصور والذكريات', en: 'Photos', bg: 'linear-gradient(180deg, #ff453a 0%, #ff2d55 100%)', Icon: Images },
  { key: 'canvas', id: 'aircanvas', ar: 'الرسم في الهواء', en: 'Air Canvas', bg: 'linear-gradient(180deg, #05d6a0 0%, #009688 100%)', Icon: Palette },
  { key: 'earth', id: 'earth', ar: 'كوكب الأرض', en: 'Planet Earth', bg: 'radial-gradient(circle at 30% 30%, #64d2ff, #0a84ff, #0040dd)', Icon: Globe },
  { key: 'playground', id: 'playground', ar: 'ملعب الصور', en: 'Image Playground', bg: 'linear-gradient(135deg, #3b82f6, #a855f7, #f59e0b)', Icon: Sparkles },
  { key: 'safari', id: 'safari', ar: 'المتصفح', en: 'Browser', bg: 'linear-gradient(180deg, #32ade6 0%, #007aff 100%)', Icon: Compass },
  { key: 'notes', id: 'notes', ar: 'الملاحظات', en: 'Notes', bg: 'linear-gradient(180deg, #ffd60a 0%, #ff9f0a 100%)', Icon: StickyNote },
  { key: 'studio', id: 'studio3d', ar: 'استوديو ثلاثي الأبعاد', en: '3D Studio', bg: 'linear-gradient(180deg, #6366f1 0%, #4338ca 100%)', Icon: Box },
  { key: 'search', id: 'search', ar: 'البحث', en: 'Search', bg: 'linear-gradient(180deg, #0a84ff 0%, #32ade6 100%)', Icon: Search },
  { key: 'messages', id: 'messages', ar: 'الرسائل', en: 'Messages', bg: 'linear-gradient(180deg, #32d74b 0%, #28cd41 100%)', Icon: MessageCircle },
  { key: 'anchors', id: 'anchors', ar: 'مراسي الواقع المعزز', en: 'AR Anchors', bg: 'linear-gradient(180deg, #0284c7 0%, #0369a1 100%)', Icon: MapPin },
  { key: 'mac', id: 'mac-display', ar: 'شاشة افتراضية', en: 'Virtual Display', bg: 'linear-gradient(180deg, #409cff 0%, #0055b3 100%)', Icon: Monitor },
  { key: 'quicklook', id: 'quicklook', ar: 'معاينة سريعة', en: 'Quick Look', bg: 'linear-gradient(180deg, #64748b 0%, #334155 100%)', Icon: Eye },
];

export const HomeViewLauncher: React.FC<HomeViewLauncherProps> = ({ isOpen, onLaunchApp, onOpenControlCenter, onToggleEnvironments, lang = 'ar' }) => {
  const [folderOpen, setFolderOpen] = useState(false);
  if (!isOpen) return null;
  const now = new Date();
  const name = (a: HomeAppItem) => (lang === 'ar' ? a.ar : a.en);
  const open = (a: HomeAppItem) => {
    spatialSound.playPinchTap();
    if (a.href) window.location.href = a.href;
    else if (a.id) onLaunchApp(a.id);
  };

  const tile = (a: HomeAppItem) => (
    <button key={a.key} onMouseEnter={() => spatialSound.playHover()} onClick={() => open(a)} className="group flex flex-col items-center gap-1.5 min-w-0">
      <div
        style={{ background: a.bg }}
        className="w-[62px] h-[62px] sm:w-[72px] sm:h-[72px] rounded-[20px] flex items-center justify-center shadow-[0_14px_30px_rgba(0,0,0,0.4),inset_0_2px_2px_rgba(255,255,255,0.45)] border border-white/25 transition-transform duration-200 group-hover:scale-105 group-active:scale-95"
      >
        <a.Icon className={`w-8 h-8 sm:w-9 sm:h-9 ${a.key === 'labels' ? 'text-slate-900' : 'text-white'}`} strokeWidth={1.9} />
      </div>
      <span className="w-full text-center text-[11.5px] leading-tight font-medium text-white/95 drop-shadow-[0_2px_6px_rgba(0,0,0,0.85)] line-clamp-2">{name(a)}</span>
    </button>
  );

  return (
    <div className="fixed inset-0 z-[65] flex flex-col items-center pointer-events-auto select-none pt-[calc(env(safe-area-inset-top)+96px)] pb-[calc(env(safe-area-inset-bottom)+16px)]">
      {/* Side pill (apps, people, environments): on wider screens only, where there is room beside the grid. */}
      <div style={{ left: 'max(12px, calc(50% - 520px))' }} className="launcher-sidebar fixed top-1/2 -translate-y-1/2 vision-ornament rounded-full p-1.5 hidden sm:flex flex-col gap-2">
        <div aria-current="page" className="w-9 h-9 rounded-full bg-white/30 flex items-center justify-center text-white shadow" title="Apps">
          <AppWindow className="w-4 h-4" />
        </div>
        <button onClick={() => onLaunchApp('messages')} className="w-9 h-9 rounded-full hover:bg-white/15 flex items-center justify-center text-white/75" title="People">
          <Users className="w-4 h-4" />
        </button>
        <button onClick={onToggleEnvironments} className="w-9 h-9 rounded-full hover:bg-white/15 flex items-center justify-center text-white/75" title="Environments">
          <Mountain className="w-4 h-4" />
        </button>
      </div>

      <div className="w-full max-w-[560px] flex-1 min-h-0 flex flex-col px-4">
        <div className="mb-4 text-center">
          <h1 className="text-[22px] font-semibold tracking-tight text-white drop-shadow">{lang === 'ar' ? 'تطبيقاتك' : 'Your apps'}</h1>
        </div>
        {/* Every app in reach: a grid that fits the width and scrolls when it is taller than the screen. */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain pb-2" style={{ WebkitOverflowScrolling: 'touch' }}>
          <div dir={lang === 'ar' ? 'rtl' : 'ltr'} className="grid grid-cols-4 gap-x-3 gap-y-5">
            {MAIN.map(tile)}
            {/* The rest, in one folder. */}
            <button onClick={() => setFolderOpen(true)} className="group flex flex-col items-center gap-1.5 min-w-0">
              <div className="w-[62px] h-[62px] sm:w-[72px] sm:h-[72px] rounded-[20px] bg-white/20 backdrop-blur-md border border-white/25 p-2 grid grid-cols-3 gap-1 shadow-[0_14px_30px_rgba(0,0,0,0.35)] group-active:scale-95 transition-transform">
                {MORE.slice(0, 9).map((a) => (
                  <span key={a.key} style={{ background: a.bg }} className="rounded-[5px] flex items-center justify-center">
                    <a.Icon className="w-2.5 h-2.5 text-white" strokeWidth={2.4} />
                  </span>
                ))}
              </div>
              <span className="text-[11.5px] font-medium text-white/95 drop-shadow-[0_2px_6px_rgba(0,0,0,0.85)] flex items-center gap-1">
                <Folder className="w-3 h-3" />
                {lang === 'ar' ? 'المزيد' : 'More'}
              </span>
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-col items-center gap-2.5">
          <button onClick={onOpenControlCenter} className="vision-btn px-4 py-1 rounded-full bg-black/25 backdrop-blur-md border border-white/15 flex items-center gap-3 text-[12px] font-medium text-white/90">
            <span>
              {now.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · {now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
            </span>
            <Wifi className="w-3.5 h-3.5 text-white/85" />
            <BatteryCharging className="w-4 h-4 text-white/85" />
          </button>
          <div style={{ width: 'min(330px, calc(100vw - 32px))' }} className="rounded-[24px] vision-glass px-5 py-3 flex items-center justify-between text-white/85">
            <button onClick={() => onLaunchApp('ikea')} className="hover:text-white flex items-center gap-1.5 text-xs font-medium">
              <AppWindow className="w-4 h-4" />
              <span>Store</span>
            </button>
            <button onClick={onToggleEnvironments} className="hover:text-white flex items-center gap-1.5 text-xs font-medium">
              <Mountain className="w-4 h-4" />
              <span>Environment</span>
            </button>
            <button onClick={() => onLaunchApp('mac-display')} className="hover:text-white flex items-center gap-1.5 text-xs font-medium">
              <Monitor className="w-4 h-4" />
              <span>Mac</span>
            </button>
            <button onClick={() => onLaunchApp('tools-hub')} className="hover:text-white flex items-center gap-1.5 text-xs font-medium" title="Tools">
              <Layers className="w-4 h-4" />
              <span>Tools</span>
            </button>
            <button onClick={onOpenControlCenter} className="hover:text-white" title="Control Center">
              <Bell className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {folderOpen && (
        <div className="fixed inset-0 z-[70] bg-black/45 backdrop-blur-xl flex items-center justify-center p-5" onClick={() => setFolderOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-[460px] max-h-[80dvh] overflow-y-auto rounded-[32px] vision-glass p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[17px] font-semibold text-white flex items-center gap-2">
                <Folder className="w-4 h-4" />
                {lang === 'ar' ? 'المزيد' : 'More'}
              </h2>
              <button onClick={() => setFolderOpen(false)} aria-label="Close" className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div dir={lang === 'ar' ? 'rtl' : 'ltr'} className="grid grid-cols-4 gap-x-3 gap-y-5">
              {MORE.map(tile)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
