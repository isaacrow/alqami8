/**
 * The web address printed on an object's QR label. Any phone camera opens it (no app, no scanner needed): the
 * object's own page (object.html). ALQAMI's scanner reads the same link and opens the object in the camera view
 * (src/scan/resolveCode.ts accepts "?artifact=<id>" links). Labels are always printed with the public site's address,
 * even when made on a test copy of the site.
 */
export const SITE_URL = (import.meta.env.VITE_SITE_URL as string | undefined) || 'https://isaacrow.github.io/alqami8/';

export function objectUrl(id: string): string {
  return new URL(`object.html?artifact=${encodeURIComponent(id)}`, SITE_URL).href;
}

/** The app with the scanner open (index.html?scan=1). */
export function scannerUrl(): string {
  return new URL('index.html?scan=1', new URL(import.meta.env.BASE_URL || './', location.href)).href;
}
