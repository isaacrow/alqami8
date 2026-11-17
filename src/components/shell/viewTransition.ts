import { flushSync } from 'react-dom';

/**
 * Moving between things, animated with the browser's View Transitions (Safari 18+, Chrome 111+): the tapped icon
 * grows into the window or page it opens, a closing window shrinks away, the home grid zooms in and out. The looks are
 * in src/styles/pageTransitions.css (shared by every page); where the browser has no View Transitions, or the visitor
 * asked for reduced motion, things just change as before.
 */
export const MORPH = 'app-morph';

let morphing: string | null = null;
/** The window being grown from an icon: it skips its own fade-in, so the icon can turn into it. */
export const isMorphing = (id: string) => morphing === id;

type Doc = Document & { startViewTransition?: (arg: unknown) => { finished: Promise<void> } };

function canAnimate() {
  return typeof document !== 'undefined' && 'startViewTransition' in document && !matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function start(update: () => void, types: string[]) {
  const d = document as Doc;
  try {
    return d.startViewTransition!({ update, types });
  } catch {
    return d.startViewTransition!(update); // browsers without transition types
  }
}

/** Same page, another scene (home grid ↔ windows): the whole view zooms through. */
export function sceneChange(apply: () => void, type: string) {
  if (!canAnimate()) return apply();
  start(() => flushSync(apply), [type]);
}

/**
 * `from` grows into what `apply` shows (found by `target` once it is on screen): an icon into its window, the folder
 * tile into the folder. `windowId` names a window that should skip its own fade-in.
 */
export function morph(from: HTMLElement | null | undefined, apply: () => void, target: string, type = 'open', windowId?: string) {
  if (!canAnimate() || !from) return apply();
  from.style.viewTransitionName = MORPH;
  morphing = windowId ?? null;
  let to: HTMLElement | null = null;
  const vt = start(() => {
    flushSync(apply);
    from.style.viewTransitionName = '';
    to = document.querySelector<HTMLElement>(target);
    if (to) to.style.viewTransitionName = MORPH;
  }, [type]);
  void vt.finished.finally(() => {
    morphing = null;
    if (to) to.style.viewTransitionName = '';
  });
}

/** `el` (a window, the folder) shrinks away while `apply` closes it. */
export function shrinkAway(el: HTMLElement | null | undefined, apply: () => void) {
  if (!canAnimate() || !el) return apply();
  el.style.viewTransitionName = MORPH;
  start(() => {
    flushSync(apply);
    el.style.viewTransitionName = '';
  }, ['close']);
}

/** Another page of the site: the tapped icon grows into it (the next page takes over the name, see index.html head). */
export function navigateFrom(icon: HTMLElement | null | undefined, href: string) {
  if (icon && 'onpagereveal' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    icon.style.viewTransitionName = MORPH;
    try {
      sessionStorage.setItem('alqami-vt', 'open');
      sessionStorage.setItem('alqami-vt-dest', href.split(/[?#]/)[0].split('/').pop() || '');
    } catch {
      /* private mode: plain page change */
    }
  }
  location.href = href;
}
