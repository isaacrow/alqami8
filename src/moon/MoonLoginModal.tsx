import React, { Suspense, lazy, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { LogIn, UserCheck } from 'lucide-react';
import { getMoonSession, MoonSession } from './moonAuth';

const AlqamiLoginScreen = lazy(() => import('../components/login/AlqamiLoginScreen'));

export const MoonLoginButton: React.FC<{ lang?: 'ar' | 'en'; compact?: boolean }> = ({ lang = 'ar', compact = false }) => {
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState<MoonSession | null>(() => getMoonSession());

  const isAr = lang === 'ar';

  useEffect(() => {
    const sync = () => setSession(getMoonSession());
    window.addEventListener('alqami:moon-auth-changed', sync);
    return () => window.removeEventListener('alqami:moon-auth-changed', sync);
  }, []);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`h-9 px-3 rounded-full border text-[12px] font-semibold flex items-center gap-1.5 transition active:scale-95 ${
          session
            ? 'bg-emerald-500/20 border-emerald-400/60 text-emerald-200'
            : 'bg-white/15 hover:bg-white/25 border-white/25 text-white'
        }`}
        title="alqami.net"
      >
        {session ? <UserCheck className="w-3.5 h-3.5 text-emerald-300" /> : <LogIn className="w-3.5 h-3.5 text-amber-300" />}
        <span className="truncate max-w-[120px]">
          {session ? session.user.name || session.user.email : compact ? (isAr ? 'دخول' : 'Sign in') : isAr ? 'تسجيل الدخول' : 'Sign in'}
        </span>
      </button>

      {open &&
        createPortal(
          <Suspense
            fallback={
              <div className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-xl flex items-center justify-center text-white text-sm">
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/25 border-t-white mr-2" />
                <span>{isAr ? 'جاري فتح بوابة الدخول...' : 'Opening sign in…'}</span>
              </div>
            }
          >
            <AlqamiLoginScreen
              initialLang={lang}
              session={session}
              onSessionChange={setSession}
              onClose={() => setOpen(false)}
            />
          </Suspense>,
          document.body
        )}
    </>
  );
};
