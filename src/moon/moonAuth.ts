/**
 * Authentication client for Moon (mooon.site) using its Supabase Auth endpoint.
 * Allows visitors/curators to sign in with their mooon.site account so private/draft
 * records and user session state are available inside ALQAMI & Scan Mode.
 */

import { MOON_PROJECT_ID, MOON_PUBLIC_KEY, MOON_SITE } from './moonApi';

const AUTH_STORAGE_KEY = 'alqami.moon.session';

export interface MoonSession {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  user: {
    id: string;
    email: string;
    name?: string;
  };
}

export function getMoonSession(): MoonSession | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MoonSession;
    if (!parsed?.accessToken) return null;
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

export async function signInToMoon(email: string, password: string): Promise<MoonSession> {
  const url = `https://${MOON_PROJECT_ID}.supabase.co/auth/v1/token?grant_type=password`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: MOON_PUBLIC_KEY,
    },
    body: JSON.stringify({ email: email.trim(), password }),
  });

  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error_description?: string;
    msg?: string;
    user?: { id?: string; email?: string; user_metadata?: { full_name?: string; name?: string } };
  };

  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || data.msg || 'بيانات الدخول غير صحيحة · Invalid mooon.site credentials');
  }

  const session: MoonSession = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
    user: {
      id: data.user?.id || '',
      email: data.user?.email || email.trim(),
      name: data.user?.user_metadata?.full_name || data.user?.user_metadata?.name,
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

export async function signUpToMoon(email: string, password: string, fullName?: string): Promise<{ session: MoonSession | null; needsConfirmation: boolean }> {
  const url = `https://${MOON_PROJECT_ID}.supabase.co/auth/v1/signup`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: MOON_PUBLIC_KEY,
    },
    body: JSON.stringify({
      email: email.trim(),
      password,
      data: fullName?.trim() ? { full_name: fullName.trim(), name: fullName.trim() } : undefined,
    }),
  });

  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error_description?: string;
    msg?: string;
    message?: string;
    user?: { id?: string; email?: string; user_metadata?: { full_name?: string; name?: string } };
  };

  if (!res.ok) {
    throw new Error(data.error_description || data.msg || data.message || 'تعذر إنشاء الحساب · Sign up failed');
  }

  if (data.access_token) {
    const session: MoonSession = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
      user: {
        id: data.user?.id || '',
        email: data.user?.email || email.trim(),
        name: data.user?.user_metadata?.full_name || data.user?.user_metadata?.name || fullName?.trim(),
      },
    };
    try {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
      window.dispatchEvent(new Event('alqami:moon-auth-changed'));
    } catch {
      /* ignore */
    }
    return { session, needsConfirmation: false };
  }

  return { session: null, needsConfirmation: true };
}

export { MOON_SITE };
