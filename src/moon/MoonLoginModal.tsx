import React, { useEffect, useState } from 'react';
import { ExternalLink, LogIn, LogOut, UserCheck, X } from 'lucide-react';
import { clearMoonSession, getMoonSession, MOON_SITE, MoonSession, signInToMoon } from './moonAuth';

export const MoonLoginButton: React.FC<{ lang?: 'ar' | 'en'; compact?: boolean }> = ({ lang = 'ar', compact = false }) => {
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState<MoonSession | null>(() => getMoonSession());
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const isAr = lang === 'ar';

  useEffect(() => {
    const sync = () => setSession(getMoonSession());
    window.addEventListener('alqami:moon-auth-changed', sync);
    return () => window.removeEventListener('alqami:moon-auth-changed', sync);
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const s = await signInToMoon(email, password);
      setSession(s);
      setOpen(false);
      setPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`h-9 px-3 rounded-full border text-[12px] font-semibold flex items-center gap-1.5 transition active:scale-95 ${
          session
            ? 'bg-emerald-500/20 border-emerald-400/60 text-emerald-200'
            : 'bg-white/15 hover:bg-white/25 border-white/25 text-white'
        }`}
        title="mooon.site"
      >
        {session ? <UserCheck className="w-3.5 h-3.5 text-emerald-300" /> : <LogIn className="w-3.5 h-3.5 text-amber-300" />}
        <span className="truncate max-w-[120px]">
          {session ? session.user.name || session.user.email : compact ? 'mooon.site' : isAr ? 'دخول mooon.site' : 'Sign in mooon.site'}
        </span>
      </button>

      {open && (
        <div
          dir={isAr ? 'rtl' : 'ltr'}
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-xl flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-3xl bg-[#0c1220] border border-white/20 p-5 text-white shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-[17px] font-bold">
                  {isAr ? 'تسجيل الدخول عبر mooon.site' : 'Sign in with mooon.site'}
                </h2>
                <p className="text-[11.5px] text-white/60">
                  {isAr ? 'مزامنة سجلاتك وصورك في وضع المسح' : 'Sync your catalogue records & photos in Scan Mode'}
                </p>
              </div>
              <button onClick={() => setOpen(false)} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                <X className="w-4 h-4" />
              </button>
            </div>

            {session ? (
              <div className="space-y-3">
                <div className="p-3.5 rounded-2xl bg-emerald-500/15 border border-emerald-400/40">
                  <p className="text-[13px] font-bold text-emerald-200">{session.user.name || session.user.email}</p>
                  <p className="text-[11px] text-white/70">{session.user.email}</p>
                </div>
                <div className="flex gap-2">
                  <a
                    href={MOON_SITE}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 h-10 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center gap-1.5 text-[12.5px] font-semibold"
                  >
                    <ExternalLink className="w-4 h-4" />
                    <span>{isAr ? 'فتح mooon.site' : 'Open mooon.site'}</span>
                  </a>
                  <button
                    onClick={() => {
                      clearMoonSession();
                      setSession(null);
                    }}
                    className="h-10 px-4 rounded-full bg-rose-500/25 border border-rose-400/50 text-rose-200 text-[12.5px] font-semibold flex items-center gap-1.5"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>{isAr ? 'خروج' : 'Sign out'}</span>
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-3">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={isAr ? 'البريد الإلكتروني في mooon.site' : 'mooon.site email'}
                  className="w-full h-11 rounded-2xl bg-white/10 border border-white/20 px-4 text-[13.5px] outline-none focus:border-[#FFD60A]"
                />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={isAr ? 'كلمة المرور' : 'Password'}
                  className="w-full h-11 rounded-2xl bg-white/10 border border-white/20 px-4 text-[13.5px] outline-none focus:border-[#FFD60A]"
                />
                {error && <p className="text-[12px] text-rose-400">{error}</p>}
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full h-11 rounded-full bg-[#FFD60A] text-black font-bold text-[13.5px] disabled:opacity-60"
                >
                  {busy ? (isAr ? 'جاري الدخول…' : 'Signing in…') : isAr ? 'دخول' : 'Sign in'}
                </button>
                <a
                  href={MOON_SITE}
                  target="_blank"
                  rel="noreferrer"
                  className="block text-center text-[11.5px] text-amber-300/90 hover:underline pt-1"
                >
                  {isAr ? 'زيارة mooon.site أو إنشاء حساب جديد ↗' : 'Visit mooon.site or create an account ↗'}
                </a>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
};
