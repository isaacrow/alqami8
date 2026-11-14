import React from 'react';
import {
  Wifi,
  BatteryCharging,
  Users,
  Mountain,
  AppWindow,
  Layers,
  Bell,
  Search,
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

// Arabic names for the launcher, by the English name (two entries share an id).
const ARABIC_NAMES: Record<string, string> = {
  '100 Tools Hub': 'مركز الأدوات',
  Siri: 'المساعد',
  'Photos & Memories': 'الصور والذكريات',
  'Air Canvas': 'الرسم في الهواء',
  'Planet Earth': 'كوكب الأرض',
  'ARKit 3D Scanner & RDF': 'الماسح',
  'Image Playground': 'ملعب الصور',
  Safari: 'المتصفح',
  Notes: 'الملاحظات',
  'Alqami Heritage': 'تراث علقمي',
  '3D Studio & PBR': 'استوديو ثلاثي الأبعاد',
  'الجواهري · Talk': 'حاور الجواهري',
  Spotlight: 'البحث',
  Messages: 'الرسائل',
  'AR Anchors': 'مراسي الواقع المعزز',
  'Mac Virtual Display': 'شاشة افتراضية',
  'Quick Look': 'معاينة سريعة',
};

interface HomeAppItem {
  id: AppId;
  /** Opens a separate page instead of an app window. */
  href?: string;
  name: string;
  bg: string;
  glyph: React.ReactNode;
}

export const HomeViewLauncher: React.FC<HomeViewLauncherProps> = ({
  isOpen,
  onLaunchApp,
  onOpenControlCenter,
  onToggleEnvironments,
  lang = 'ar',
}) => {
  if (!isOpen) return null;
  const now = new Date();

  // Exact 3-row staggered honeycomb layout from images.jpg + full access to all 12 spatial experiences
  const row1: HomeAppItem[] = [
    {
      id: 'tools-hub',
      name: '100 Tools Hub',
      bg: 'linear-gradient(180deg, #10b981 0%, #059669 100%)',
      glyph: <span className="text-[28px]">⚡</span>,
    },
    {
      id: 'siri',
      name: 'Siri',
      bg: 'radial-gradient(circle at 35% 25%, #3a3a3c, #141416)',
      glyph: <span className="w-10 h-10 rounded-full ai-morph-sphere border border-white/40" />,
    },
    {
      id: 'photos',
      name: 'Photos & Memories',
      bg: 'linear-gradient(180deg, #ff453a 0%, #ff2d55 100%)',
      glyph: (
        <div className="grid grid-cols-2 gap-0.5 w-9 h-9 rotate-12">
          <span className="rounded-full bg-amber-400/90" />
          <span className="rounded-full bg-rose-500/90" />
          <span className="rounded-full bg-emerald-400/90" />
          <span className="rounded-full bg-blue-500/90" />
        </div>
      ),
    },
    {
      id: 'aircanvas',
      name: 'Air Canvas',
      bg: 'linear-gradient(180deg, #05d6a0 0%, #009688 100%)',
      glyph: <span className="text-[28px]">🎨</span>,
    },
    {
      id: 'earth',
      name: 'Planet Earth',
      bg: 'radial-gradient(circle at 30% 30%, #64d2ff, #0a84ff, #0040dd)',
      glyph: <span className="text-[30px]">🌍</span>,
    },
    {
      id: 'object-tracking',
      name: 'ARKit 3D Scanner & RDF',
      bg: 'linear-gradient(180deg, #10b981 0%, #047857 100%)',
      glyph: <span className="text-[28px]">📦</span>,
    },
  ];

  const row2: HomeAppItem[] = [
    {
      id: 'playground',
      name: 'Image Playground',
      bg: 'radial-gradient(circle at 30% 30%, #ffffff, #f2f2f7)',
      glyph: (
        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-500 via-purple-500 to-amber-400 flex items-center justify-center text-white text-lg font-bold shadow">
          ✨
        </div>
      ),
    },
    {
      id: 'safari',
      name: 'Safari',
      bg: 'linear-gradient(180deg, #32ade6 0%, #007aff 100%)',
      glyph: (
        <div className="w-11 h-11 rounded-full border-2 border-white/80 flex items-center justify-center relative">
          <div className="w-1.5 h-7 bg-gradient-to-b from-red-500 to-white rotate-45 rounded-full" />
        </div>
      ),
    },
    {
      id: 'notes',
      name: 'Notes',
      bg: 'linear-gradient(180deg, #ffd60a 0%, #ff9f0a 100%)',
      glyph: (
        <div className="w-9 h-9 rounded-lg bg-white flex flex-col overflow-hidden shadow">
          <div className="h-2.5 bg-amber-400" />
          <div className="flex-1 p-1 space-y-1">
            <div className="h-0.5 bg-stone-300 w-full" />
            <div className="h-0.5 bg-stone-300 w-4/5" />
          </div>
        </div>
      ),
    },
    {
      id: 'ikea',
      name: 'Alqami Heritage',
      bg: 'linear-gradient(180deg, #1e3a8a 0%, #0f172a 100%)',
      glyph: (
        <span className="rounded-lg bg-gradient-to-r from-amber-400 to-amber-500 px-2 py-0.5 text-[12px] font-extrabold text-black tracking-tight shadow">
          علقمي
        </span>
      ),
    },
    {
      id: 'studio3d',
      name: '3D Studio & PBR',
      bg: 'linear-gradient(180deg, #6366f1 0%, #4338ca 100%)',
      glyph: <span className="text-[28px]">🧊</span>,
    },
  ];

  const row3: HomeAppItem[] = [
    {
      id: 'messages',
      href: './jawahiri.html',
      name: 'الجواهري · Talk',
      bg: 'radial-gradient(circle at 50% 30%, #6b5536, #1a140c)',
      glyph: <span className="text-[30px]">🗣️</span>,
    },
    {
      id: 'search',
      name: 'Spotlight',
      bg: 'linear-gradient(180deg, #0a84ff 0%, #32ade6 100%)',
      glyph: <Search className="w-9 h-9 text-white" strokeWidth={2.5} />,
    },
    {
      id: 'messages',
      name: 'Messages',
      bg: 'linear-gradient(180deg, #32d74b 0%, #28cd41 100%)',
      glyph: (
        <div className="w-9 h-8 bg-white rounded-full flex items-center justify-center shadow">
          <span className="text-emerald-500 text-xs font-black">💬</span>
        </div>
      ),
    },
    {
      id: 'anchors',
      name: 'AR Anchors',
      bg: 'linear-gradient(180deg, #0284c7 0%, #0369a1 100%)',
      glyph: <span className="text-[28px]">📍</span>,
    },
    {
      id: 'mac-display',
      name: 'Mac Virtual Display',
      bg: 'linear-gradient(180deg, #409cff 0%, #0055b3 100%)',
      glyph: <span className="text-[26px]">🖥️</span>,
    },
    {
      id: 'quicklook',
      name: 'Quick Look',
      bg: 'rgba(255, 255, 255, 0.25)',
      glyph: (
        <div className="grid grid-cols-3 gap-1 p-2">
          <span className="w-2.5 h-2.5 rounded-full bg-sky-400" />
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
          <span className="w-2.5 h-2.5 rounded-full bg-rose-400" />
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
          <span className="w-2.5 h-2.5 rounded-full bg-purple-400" />
          <span className="w-2.5 h-2.5 rounded-full bg-white" />
        </div>
      ),
    },
  ];

  const renderRow = (items: HomeAppItem[], zOffset: number) => (
    <div
      style={{ transform: `translateZ(${zOffset}px)` }}
      className="home-app-row flex items-center justify-center gap-9 preserve-3d"
    >
      {items.map((item) => (
        <button
          key={`${item.id}-${item.name}`}
          onMouseEnter={() => spatialSound.playHover()}
          onClick={() => {
            spatialSound.playPinchTap();
            if (item.href) window.location.href = item.href;
            else onLaunchApp(item.id);
          }}
          className="group flex flex-col items-center gap-2.5 preserve-3d"
        >
          <div
            style={{ background: item.bg }}
            className="w-[74px] h-[74px] rounded-[22px] flex items-center justify-center shadow-[0_18px_38px_rgba(0,0,0,0.45),inset_0_2px_2px_rgba(255,255,255,0.5)] border border-white/25 transition-all duration-300 group-hover:scale-110 group-hover:translate-z-4 group-active:scale-95 relative"
          >
            <div className="transition-transform duration-300 group-hover:scale-110">
              {item.glyph}
            </div>
          </div>
          <span className="text-[12px] font-medium text-white/95 drop-shadow-[0_2px_6px_rgba(0,0,0,0.85)] tracking-tight">
            {lang === 'ar' ? ARABIC_NAMES[item.name] ?? item.name : item.name}
          </span>
        </button>
      ))}
    </div>
  );

  return (
    <div className="fixed inset-0 z-[65] flex flex-col items-center justify-center pointer-events-auto select-none">
      {/* Left Vertical Mode Switcher Pill (from images.jpg top-left lamp area: Apps, People, Environments) */}
      <div
        style={{ left: 'max(12px, calc(50% - 520px))', transform: 'translateY(-50%) translateZ(40px)' }}
        className="launcher-sidebar fixed top-1/2 vision-ornament rounded-full p-1.5 flex flex-col gap-2"
      >
        <div
          aria-current="page"
          className="w-9 h-9 rounded-full bg-white/30 flex items-center justify-center text-white shadow"
          title="Apps"
        >
          <AppWindow className="w-4 h-4" />
        </div>
        <button
          onClick={() => {
            spatialSound.playPinchTap();
            onLaunchApp('messages');
          }}
          className="w-9 h-9 rounded-full hover:bg-white/15 flex items-center justify-center text-white/75"
          title="People"
        >
          <Users className="w-4 h-4" />
        </button>
        <button
          onClick={() => {
            spatialSound.playPinchTap();
            onToggleEnvironments();
          }}
          className="w-9 h-9 rounded-full hover:bg-white/15 flex items-center justify-center text-white/75"
          title="Environments"
        >
          <Mountain className="w-4 h-4" />
        </button>
      </div>

      <div className="launcher-content flex flex-col items-center preserve-3d">
        <div className="mb-5 text-center">
          <h1 className="text-[23px] font-semibold tracking-tight text-white drop-shadow">Your apps</h1>
          <p className="mt-1 text-[11px] text-white/65">Open multiple floating windows</p>
        </div>
        <div className="flex flex-col items-center gap-6 preserve-3d">
          {renderRow(row1, 20)}
          {renderRow(row2, 42)}
          {renderRow(row3, 28)}
        </div>
      </div>

      {/* Bottom Status Line & Frosted Environment / Control Dock (Exact match to images.jpg) */}
      <div
        style={{ transform: 'translateZ(50px)' }}
        className="mt-10 flex flex-col items-center gap-3"
      >
        {/* Status Timestamp Bar: 11:20 Mon Jun 10 + Wi-Fi + Battery */}
        <button
          onClick={() => {
            spatialSound.playPinchTap();
            onOpenControlCenter();
          }}
          className="vision-btn px-4 py-1 rounded-full bg-black/25 backdrop-blur-md border border-white/15 flex items-center gap-3 text-[12px] font-medium text-white/90"
        >
          <span>{now.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · {now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
          <Wifi className="w-3.5 h-3.5 text-white/85" />
          <BatteryCharging className="w-4 h-4 text-white/85" />
        </button>

        {/* Wide Frosted Glass Bottom Dock Console (from images.jpg) */}
        <div style={{ width: 'min(330px, calc(100vw - 32px))' }} className="h-[84px] rounded-[28px] vision-glass px-6 py-3 flex flex-col justify-between">
          <div className="flex items-center justify-between text-white/85">
            <button
              onClick={() => onLaunchApp('ikea')}
              className="hover:text-white transition flex items-center gap-1.5 text-xs font-medium"
            >
              <AppWindow className="w-4 h-4" />
              <span>Store</span>
            </button>
            <button
              onClick={onToggleEnvironments}
              className="hover:text-white transition flex items-center gap-1.5 text-xs font-medium"
            >
              <Mountain className="w-4 h-4" />
              <span>Environment</span>
            </button>
            <button
              onClick={() => onLaunchApp('mac-display')}
              className="hover:text-white transition flex items-center gap-1.5 text-xs font-medium"
            >
              <span>🖥️ Mac</span>
            </button>
            <button
              onClick={() => onLaunchApp('tools-hub')}
              className="hover:text-white transition flex items-center gap-1.5 text-xs font-medium"
              title="Open Spatial Tools Hub"
            >
              <Layers className="w-4 h-4" />
              <span>Tools</span>
            </button>
            <button
              onClick={onOpenControlCenter}
              className="hover:text-white transition"
              title="Open Control Center"
            >
              <Bell className="w-4 h-4" />
            </button>
          </div>

          {/* Home indicator */}
          <div className="flex justify-center">
            <div className="w-16 h-1 rounded-full bg-white/70" />
          </div>
        </div>
      </div>
    </div>
  );
};
