/**
 * Museum mode, for ALQAMI on the museum's own devices (a tablet on a stand in a hall) and on visitors' phones:
 *   ?museum=kiosk   a shared device: no deleting, and after 2 minutes untouched it goes back to where it started
 *                   with a fresh state (favourites, language, open pages), ready for the next visitor
 *   ?museum=visitor a visitor's phone (put it in the QR codes): no deleting, nothing else changes
 *   ?museum=off     back to the owner's normal app
 * The choice is remembered on the device, so a kiosk stays a kiosk after a reload or a crash.
 */
import { saveFavoritesMap } from './favoritesStore';

export type MuseumMode = 'off' | 'visitor' | 'kiosk';

const KEY = 'alqami.museum.mode';
const HOME_KEY = 'alqami.museum.home';
/** Untouched this long, a kiosk starts over. */
export const KIOSK_IDLE_MS = 120_000;

function read(): MuseumMode {
  try {
    const asked = new URLSearchParams(location.search).get('museum');
    if (asked === 'kiosk' || asked === 'visitor' || asked === 'off') {
      if (asked === 'off') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, asked);
      if (asked === 'kiosk') localStorage.setItem(HOME_KEY, location.href);
      return asked;
    }
    const saved = localStorage.getItem(KEY);
    return saved === 'kiosk' || saved === 'visitor' ? saved : 'off';
  } catch {
    return 'off';
  }
}

const mode = read();

export const museumMode = (): MuseumMode => mode;
/** Visitors never see "delete" or other owner-only controls. */
export const isMuseumMode = (): boolean => mode !== 'off';

let started = false;
/** On a kiosk: start the idle timer that hands a fresh app to the next visitor. Safe to call more than once. */
export function startMuseumMode(): void {
  if (mode !== 'kiosk' || started) return;
  started = true;
  document.documentElement.dataset.museum = 'kiosk';
  let timer = 0;
  const reset = () => {
    try {
      saveFavoritesMap({});
      for (const k of Object.keys(localStorage)) {
        if (k !== KEY && k !== HOME_KEY && /^alqami\.(object\.lang|lang|view|last)/.test(k)) localStorage.removeItem(k);
      }
      sessionStorage.clear();
    } catch {
      /* storage blocked: the reload still clears the screen */
    }
    let home = location.href;
    try {
      home = localStorage.getItem(HOME_KEY) || home;
    } catch {
      /* keep the current page */
    }
    location.replace(home);
  };
  const touched = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(reset, KIOSK_IDLE_MS);
  };
  for (const ev of ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const) window.addEventListener(ev, touched, { passive: true });
  touched();
  // A kiosk never opens a second tab the next visitor cannot close.
  document.addEventListener(
    'click',
    (e) => {
      const a = (e.target as HTMLElement | null)?.closest?.('a[target="_blank"]') as HTMLAnchorElement | null;
      if (a) a.removeAttribute('target');
    },
    true,
  );
}
