import * as THREE from 'three';

export type LightingPresetId =
  | 'living-room'
  | 'studio-warmth'
  | 'gallery-daylight'
  | 'sunset-amber'
  | 'dramatic-spotlight';

export interface LightingPreset {
  id: LightingPresetId;
  title: { ar: string; en: string };
  subtitle: { ar: string; en: string };
  ambientColor: number;
  ambientIntensity: number;
  keyColor: number;
  keyIntensity: number;
  fillColor: number;
  fillIntensity: number;
  accentColor: number;
  accentIntensity: number;
  exposure: number;
  bgGradient: string;
}

export const LIGHTING_PRESETS: Record<LightingPresetId, LightingPreset> = {
  'living-room': {
    id: 'living-room',
    title: { ar: 'غرفة المعيشة', en: 'Living Room' },
    subtitle: { ar: 'دفء معماري', en: 'Architectural Warmth' },
    ambientColor: 0xfff6ea,
    ambientIntensity: 1.8,
    keyColor: 0xfffaec,
    keyIntensity: 2.8,
    fillColor: 0xb2d2ff,
    fillIntensity: 1.5,
    accentColor: 0xffdf80,
    accentIntensity: 1.6,
    exposure: 1.35,
    bgGradient: 'linear-gradient(180deg, #5e5246 0%, #3d342c 100%)',
  },
  'studio-warmth': {
    id: 'studio-warmth',
    title: { ar: 'استوديو ذهبي', en: 'Studio Warmth' },
    subtitle: { ar: 'إضاءة متحفية مذهبة', en: 'Museum Gilded Studio' },
    ambientColor: 0xffeedd,
    ambientIntensity: 2.1,
    keyColor: 0xffe6b0,
    keyIntensity: 3.2,
    fillColor: 0xffd2a0,
    fillIntensity: 1.7,
    accentColor: 0xffc850,
    accentIntensity: 2.2,
    exposure: 1.45,
    bgGradient: 'linear-gradient(180deg, #7c5836 0%, #46311d 100%)',
  },
  'gallery-daylight': {
    id: 'gallery-daylight',
    title: { ar: 'صالة العرض', en: 'Gallery Daylight' },
    subtitle: { ar: 'إضاءة طبيعية نقية', en: 'Pure Neutral Clarity' },
    ambientColor: 0xffffff,
    ambientIntensity: 2.2,
    keyColor: 0xffffff,
    keyIntensity: 2.6,
    fillColor: 0xddeeff,
    fillIntensity: 1.8,
    accentColor: 0xffffff,
    accentIntensity: 1.5,
    exposure: 1.25,
    bgGradient: 'linear-gradient(180deg, #2c3e50 0%, #1a252f 100%)',
  },
  'sunset-amber': {
    id: 'sunset-amber',
    title: { ar: 'غروب الشمس', en: 'Sunset Amber' },
    subtitle: { ar: 'سحر الشفق الذهبي', en: 'Golden Hour Drama' },
    ambientColor: 0xffc499,
    ambientIntensity: 1.8,
    keyColor: 0xff9944,
    keyIntensity: 3.5,
    fillColor: 0x995577,
    fillIntensity: 1.4,
    accentColor: 0xffbb55,
    accentIntensity: 2.2,
    exposure: 1.4,
    bgGradient: 'linear-gradient(180deg, #c87a5b 0%, #3d2c2e 100%)',
  },
  'dramatic-spotlight': {
    id: 'dramatic-spotlight',
    title: { ar: 'تسليط الضوء', en: 'Dramatic Spotlight' },
    subtitle: { ar: 'تباين أثري مركز', en: 'High Contrast Focus' },
    ambientColor: 0x8899aa,
    ambientIntensity: 1.1,
    keyColor: 0xffffff,
    keyIntensity: 4.2,
    fillColor: 0x446688,
    fillIntensity: 0.9,
    accentColor: 0xffe080,
    accentIntensity: 2.6,
    exposure: 1.5,
    bgGradient: 'linear-gradient(180deg, #1c2331 0%, #0d1117 100%)',
  },
};

export const PRESET_ORDER: LightingPresetId[] = [
  'living-room',
  'studio-warmth',
  'gallery-daylight',
  'sunset-amber',
  'dramatic-spotlight',
];

interface LightingConfig {
  presetId: LightingPresetId;
  brightness: number; // 20 to 200 (100 = default)
}

let currentConfig: LightingConfig = {
  presetId: 'living-room',
  brightness: 100,
};

// Try to initialize from localStorage
try {
  const savedPreset = localStorage.getItem('alqami_lighting_preset') as LightingPresetId;
  const savedBright = Number(localStorage.getItem('alqami_lighting_brightness'));
  if (savedPreset && LIGHTING_PRESETS[savedPreset]) {
    currentConfig.presetId = savedPreset;
  }
  if (!isNaN(savedBright) && savedBright >= 20 && savedBright <= 200) {
    currentConfig.brightness = savedBright;
  }
} catch {
  // Ignore localStorage errors
}

export function getLightingConfig(): {
  preset: LightingPreset;
  brightness: number;
  multiplier: number;
} {
  const preset = LIGHTING_PRESETS[currentConfig.presetId] || LIGHTING_PRESETS['living-room'];
  const multiplier = Math.max(0.2, currentConfig.brightness / 100);
  return { preset, brightness: currentConfig.brightness, multiplier };
}

export function setLightingPreset(id: LightingPresetId) {
  if (!LIGHTING_PRESETS[id]) return;
  currentConfig.presetId = id;
  try {
    localStorage.setItem('alqami_lighting_preset', id);
  } catch {}
  notifyLightingChange();
}

export function cycleLightingPreset(): LightingPresetId {
  const idx = PRESET_ORDER.indexOf(currentConfig.presetId);
  const next = PRESET_ORDER[(idx + 1) % PRESET_ORDER.length];
  setLightingPreset(next);
  return next;
}

export function setLightingBrightness(val: number) {
  const clamped = Math.max(20, Math.min(200, Math.round(val)));
  currentConfig.brightness = clamped;
  try {
    localStorage.setItem('alqami_lighting_brightness', String(clamped));
  } catch {}
  notifyLightingChange();
}

export function notifyLightingChange() {
  const detail = getLightingConfig();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('visionos:lighting-change', { detail }));
  }
}

export function applyLightingToThreeScene(
  renderer: THREE.WebGLRenderer,
  ambientLight: THREE.AmbientLight,
  keyLight: THREE.DirectionalLight,
  fillLight: THREE.DirectionalLight,
  accentLight: THREE.DirectionalLight,
  pointLight?: THREE.PointLight
) {
  const { preset, multiplier } = getLightingConfig();

  // Balanced PBR exposure so models with IBL RoomEnvironment never blow out to white
  renderer.toneMappingExposure = Math.min(1.05, preset.exposure * 0.72) * multiplier;

  ambientLight.color.setHex(preset.ambientColor);
  ambientLight.intensity = preset.ambientIntensity * 0.28 * multiplier;

  keyLight.color.setHex(preset.keyColor);
  keyLight.intensity = preset.keyIntensity * 0.35 * multiplier;

  fillLight.color.setHex(preset.fillColor);
  fillLight.intensity = preset.fillIntensity * 0.28 * multiplier;

  accentLight.color.setHex(preset.accentColor);
  accentLight.intensity = preset.accentIntensity * 0.28 * multiplier;

  if (pointLight) {
    pointLight.color.setHex(preset.accentColor);
    pointLight.intensity = 0.35 * multiplier;
  }
}
