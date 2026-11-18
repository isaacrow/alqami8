/**
 * Authentication client for Alqami (alqami.net).
 * Restricted strictly to Isaac Faleh's authorized account. No other users or guest access permitted.
 */

import { MOON_PROJECT_ID, MOON_PUBLIC_KEY, MOON_SITE } from './moonApi';

const AUTH_STORAGE_KEY = 'alqami.moon.session';

// SHA-256 hashes of the sole authorized owner credentials
const ALLOWED_EMAIL = 'eshak100falah@gmail.com';
const ALLOWED_ID_HASHES = new Set([
  '9ff4cb95dbabd6418ca9c70e3dd743a20da82b55e8c0c9bf2c205ea3192a9442', // eshak100falah@gmail.com
  '1fd6227a465211891ddf2da7cd8b8f143097d5ebefa804e65afe3724ee127a20', // isaac
]);
const ALLOWED_PASS_HASH = '48670c062401dd703dd26e2f4b42695e1a2ba4addd46cb75dfff78698aa5ab6c';

export interface MoonSession {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  authorizedOwner?: boolean;
  user: {
    id: string;
    email: string;
    name?: string;
  };
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // Minimal pure-JS SHA-256 fallback for non-HTTPS contexts
  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);
  const H = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const bitLen = bytes.length * 8;
  const paddedLen = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLen);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLen - 8, Math.floor(bitLen / 0x100000000), false);
  view.setUint32(paddedLen - 4, bitLen >>> 0, false);
  const W = new Uint32Array(64);
  const rotr = (n: number, x: number) => (x >>> n) | (x << (32 - n));
  for (let o = 0; o < paddedLen; o += 64) {
    for (let i = 0; i < 16; i++) W[i] = view.getUint32(o + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(7, W[i - 15]) ^ rotr(18, W[i - 15]) ^ (W[i - 15] >>> 3);
      const s1 = rotr(17, W[i - 2]) ^ rotr(19, W[i - 2]) ^ (W[i - 2] >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(6, e) ^ rotr(11, e) ^ rotr(25, e);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + W[i]) >>> 0;
      const S0 = rotr(2, a) ^ rotr(13, a) ^ rotr(22, a);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
  }
  return Array.from(H)
    .map((x) => x.toString(16).padStart(8, '0'))
    .join('');
}

export function getMoonSession(): MoonSession | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MoonSession;
    if (!parsed?.accessToken || !parsed.authorizedOwner) return null;
    if ((parsed.user?.email || '').toLowerCase() !== ALLOWED_EMAIL) {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearMoonSession(): void {
  try {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    window.dispatchEvent(new Event('alqami:moon-auth-changed'));
  } catch {
    /* ignore */
  }
}

export async function signInToMoon(identifier: string, password: string): Promise<MoonSession> {
  const cleanId = identifier.trim().toLowerCase();
  const [idHash, passHash] = await Promise.all([sha256Hex(cleanId), sha256Hex(password)]);

  if (!ALLOWED_ID_HASHES.has(idHash) || passHash !== ALLOWED_PASS_HASH) {
    throw new Error('الدخول مقتصر على الحساب المصرّح به فقط · Access denied — authorized owner only');
  }

  // Best-effort Moon Supabase token sync in parallel (never blocks Isaac's authorized login)
  let accessToken = `alqami-owner-${Date.now()}`;
  let refreshToken: string | undefined;
  let expiresAt: number | undefined;
  let userId = 'isaac-owner';

  try {
    const url = `https://${MOON_PROJECT_ID}.supabase.co/auth/v1/token?grant_type=password`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: MOON_PUBLIC_KEY,
      },
      body: JSON.stringify({ email: ALLOWED_EMAIL, password }),
    });
    if (res.ok) {
      const data = (await res.json().catch(() => ({}))) as {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
        user?: { id?: string };
      };
      if (data.access_token) {
        accessToken = data.access_token;
        refreshToken = data.refresh_token;
        expiresAt = data.expires_in ? Date.now() + data.expires_in * 1000 : undefined;
        if (data.user?.id) userId = data.user.id;
      }
    }
  } catch {
    /* offline or Moon sync unavailable — local owner session still succeeds */
  }

  const session: MoonSession = {
    accessToken,
    refreshToken,
    expiresAt,
    authorizedOwner: true,
    user: {
      id: userId,
      email: ALLOWED_EMAIL,
      name: 'Isaac Faleh',
    },
  };

  try {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
    window.dispatchEvent(new Event('alqami:moon-auth-changed'));
  } catch {
    /* ignore */
  }

  return session;
}

export { MOON_SITE };
