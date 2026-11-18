// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  User,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Languages,
  X,
  LogOut,
  ExternalLink,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import Topography from './Topography';
import MetallicPaint from './MetallicPaint';
import GlassSurface from './GlassSurface';
import ClickSpark from './ClickSpark';
import Magnet from './Magnet';
import ShinyText from './ShinyText';
import DecryptedText from './DecryptedText';
import AlqamiLanyardPassOverlay from './AlqamiLanyardPassOverlay';
import { assetUrl } from '../../utils/assetUrl';
import {
  clearMoonSession,
  MOON_SITE,
  MoonSession,
  signInToMoon,
  signUpToMoon,
} from '../../moon/moonAuth';

interface AlqamiLoginScreenProps {
  initialLang?: 'ar' | 'en';
  session: MoonSession | null;
  onSessionChange: (session: MoonSession | null) => void;
  onClose: () => void;
}

export function AlqamiLoginScreen({
  initialLang = 'ar',
  session,
  onSessionChange,
  onClose,
}: AlqamiLoginScreenProps) {
  const [lang, setLang] = useState<'ar' | 'en'>(initialLang);
  const isAr = lang === 'ar';

  const [activeTab, setActiveTab] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [showIntro, setShowIntro] = useState(false);
  const [lanyardPass, setLanyardPass] = useState<{
    user: string;
    role: string;
    institution: string;
    type: 'login' | 'signup';
    pendingSession?: MoonSession | null;
  } | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !lanyardPass) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, lanyardPass]);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!email.trim()) {
      setError(isAr ? 'البريد الإلكتروني مطلوب' : 'Email is required');
      return;
    }
    if (!password) {
      setError(isAr ? 'كلمة المرور مطلوبة' : 'Password is required');
      return;
    }

    setLoading(true);
    try {
      const s = await signInToMoon(email, password);
      setLanyardPass({
        user: s.user.name || s.user.email.split('@')[0] || 'Explorer',
        role: 'Spatial Heritage Explorer',
        institution: 'Al-Kafeel Museum • Alqami Spatial',
        type: 'login',
        pendingSession: s,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : (isAr ? 'فشل تسجيل الدخول' : 'Sign in failed'));
    } finally {
      setLoading(false);
    }
  };

  const handleSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!regName.trim()) {
      setError(isAr ? 'الاسم الكامل مطلوب' : 'Full name is required');
      return;
    }
    if (!regEmail.trim() || !regEmail.includes('@')) {
      setError(isAr ? 'البريد الإلكتروني غير صالح' : 'A valid email is required');
      return;
    }
    if (regPassword.length < 8) {
      setError(isAr ? 'كلمة المرور ٨ خانات على الأقل' : 'Password must be at least 8 characters');
      return;
    }

    setLoading(true);
    try {
      const res = await signUpToMoon(regEmail, regPassword, regName);
      if (res.session) {
        setLanyardPass({
          user: res.session.user.name || regName.trim(),
          role: 'Spatial Heritage Explorer',
          institution: 'Al-Kafeel Museum • Alqami Spatial',
          type: 'login',
          pendingSession: res.session,
        });
      } else {
        setLanyardPass({
          user: regName.trim(),
          role: 'Spatial Heritage Explorer',
          institution: 'Al-Kafeel Museum • Alqami Spatial',
          type: 'signup',
          pendingSession: null,
        });
        setSuccess(
          isAr
            ? 'تم إنشاء الحساب! تفقد بريدك الإلكتروني لتأكيد الحساب ثم سجّل الدخول.'
            : 'Account created! Please check your email to confirm, then sign in.'
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : (isAr ? 'تعذر إنشاء الحساب' : 'Sign up failed'));
    } finally {
      setLoading(false);
    }
  };

  const handleProceedFromLanyard = () => {
    if (lanyardPass?.type === 'login' && lanyardPass.pendingSession) {
      onSessionChange(lanyardPass.pendingSession);
      setLanyardPass(null);
      onClose();
    } else if (lanyardPass?.type === 'signup') {
      setLanyardPass(null);
      setActiveTab('login');
      setEmail(regEmail);
    } else {
      setLanyardPass(null);
    }
  };

  const logoSrc = assetUrl('alqami-logo.png');

  return (
    <div
      className="fixed inset-0 z-[200] w-full min-h-screen overflow-hidden flex flex-col items-center justify-center bg-[#06070a]"
      dir={isAr ? 'rtl' : 'ltr'}
    >
      <ClickSpark
        sparkColor="#ffffff"
        sparkSize={12}
        sparkRadius={22}
        sparkCount={8}
        duration={450}
      >
        <div className="relative w-full h-screen flex flex-col items-center justify-center overflow-hidden">
          {/* 1. ReactBits Monochrome Topography Interactive Background */}
          <div className="fixed inset-0 z-0 pointer-events-auto">
            <Topography
              color="#ffffff"
              lineCount={26}
              lineWidth={1.15}
              elevation={1.15}
              tilt={30}
              speed={0.22}
              morph={0.25}
              glow={0.45}
              brightness={0.9}
              fog={0.45}
              mouseInteraction={true}
              hoverEffect="lift"
              clickEffect="pulse"
              className="w-full h-full"
            />
          </div>

          {/* 2. Top Floating Notch (Alqami MetallicPaint Logo + Attribution) */}
          <motion.div
            initial={{ y: -60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
            className="fixed top-0 inset-x-0 mx-auto w-fit z-40 pointer-events-auto"
          >
            <div
              className="px-5 sm:px-7 py-2 sm:py-2.5 flex items-center gap-3 backdrop-blur-2xl"
              style={{
                background: 'rgba(255, 255, 255, 0.48)',
                borderRadius: '0 0 22px 22px',
                boxShadow: '0 6px 28px rgba(0, 0, 0, 0.16)',
                backdropFilter: 'blur(24px)',
                WebkitBackdropFilter: 'blur(24px)',
                border: '1px solid rgba(255, 255, 255, 0.92)',
                borderTop: 'none',
              }}
            >
              <div className="w-9 h-9 rounded-full bg-black/90 flex items-center justify-center p-1.5 shadow-sm overflow-hidden shrink-0">
                <MetallicPaint imageSrc={logoSrc} scale={0.9} />
              </div>
              <span className="text-[11px] sm:text-xs font-extrabold tracking-wide text-slate-900 select-none whitespace-nowrap">
                {isAr ? 'تصميم وتطوير: إسحاق فالح' : 'DESIGN & DEVELOPED BY ISAAC FALEH'}
              </span>
            </div>
          </motion.div>

          {/* 3. Main Frosted Glass Login Card */}
          <motion.div
            initial={{ scale: 0.94, opacity: 0, y: 18 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            className="relative z-20 w-[560px] md:w-[600px] max-w-[94vw] pointer-events-auto"
          >
            <GlassSurface
              width="100%"
              height="auto"
              borderRadius={20}
              blur={22}
              backgroundOpacity={0.47}
              brightness={65}
              className="w-full overflow-hidden relative shadow-[0_18px_55px_rgba(0,0,0,0.35)]"
              style={{
                background: 'rgba(255, 255, 255, 0.50)',
                borderRadius: '20px',
                boxShadow: '0 12px 48px rgba(0, 0, 0, 0.25)',
                backdropFilter: 'blur(24px)',
                WebkitBackdropFilter: 'blur(24px)',
                border: '1px solid rgba(255, 255, 255, 0.98)',
              }}
            >
              <div className="w-full p-5 sm:p-7 space-y-5 text-slate-900">
                {/* Header */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3.5">
                    <div className="w-12 h-12 rounded-2xl bg-black flex items-center justify-center p-2 shadow-md overflow-hidden shrink-0">
                      <MetallicPaint imageSrc={logoSrc} scale={0.92} />
                    </div>
                    <div>
                      <h1 className="text-lg sm:text-xl font-black tracking-tight text-slate-950 leading-tight">
                        {isAr ? 'بوابة علقمي' : 'Alqami Portal'}
                      </h1>
                      <p className="text-[11px] font-semibold text-slate-700 tracking-wide">
                        {isAr
                          ? 'متحف الكفيل للنفائس والمخطوطات • alqami.net'
                          : 'AL-KAFEEL MUSEUM SPATIAL PORTAL • alqami.net'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setLang(isAr ? 'en' : 'ar')}
                      className="h-9 px-3 rounded-xl bg-white/70 hover:bg-white/95 border border-white text-slate-900 text-xs font-bold flex items-center gap-1.5 shadow-sm transition cursor-pointer"
                      title={isAr ? 'Switch to English' : 'التبديل للعربية'}
                    >
                      <Languages className="w-3.5 h-3.5" />
                      <span>{isAr ? 'EN' : 'عربي'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={onClose}
                      className="h-9 w-9 rounded-xl bg-white/70 hover:bg-white/95 border border-white text-slate-900 flex items-center justify-center shadow-sm transition cursor-pointer"
                      title={isAr ? 'إغلاق' : 'Close'}
                      aria-label="Close"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Signed-in State vs Auth Forms */}
                {session ? (
                  <div className="space-y-4 py-2">
                    <div className="p-4 rounded-2xl bg-white/75 border border-white shadow-sm space-y-1">
                      <div className="flex items-center gap-2 text-emerald-700 text-xs font-bold">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>{isAr ? 'تم تسجيل الدخول بنجاح' : 'Signed in successfully'}</span>
                      </div>
                      <p className="text-base font-black text-slate-950 pt-1">
                        {session.user.name || session.user.email}
                      </p>
                      <p className="text-xs font-medium text-slate-600">{session.user.email}</p>
                    </div>

                    <div className="flex flex-wrap gap-2.5">
                      <a
                        href={MOON_SITE}
                        target="_blank"
                        rel="noreferrer"
                        className="flex-1 h-11 rounded-xl bg-slate-950 hover:bg-slate-900 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md transition"
                      >
                        <ExternalLink className="w-4 h-4" />
                        <span>{isAr ? 'فتح mooon.site' : 'Open mooon.site'}</span>
                      </a>
                      <button
                        type="button"
                        onClick={() => {
                          clearMoonSession();
                          onSessionChange(null);
                        }}
                        className="h-11 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs sm:text-sm flex items-center gap-1.5 shadow-md transition cursor-pointer"
                      >
                        <LogOut className="w-4 h-4" />
                        <span>{isAr ? 'تسجيل الخروج' : 'Sign out'}</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Animated Subtitle */}
                    <div className="h-5 overflow-hidden flex items-center">
                      <AnimatePresence mode="wait">
                        <motion.p
                          key={activeTab + lang}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -6 }}
                          transition={{ duration: 0.2 }}
                          className="text-xs font-semibold text-slate-700"
                        >
                          {activeTab === 'login'
                            ? isAr
                              ? 'سجّل الدخول لمزامنة سجلاتك ومقتنياتك ثلاثية الأبعاد'
                              : 'Sign in to sync your 3D heritage records & workspace'
                            : isAr
                              ? 'أنشئ حساباً جديداً للوصول إلى جميع المزايا السحابية'
                              : 'Create an account to unlock spatial cloud sync'}
                        </motion.p>
                      </AnimatePresence>
                    </div>

                    {/* Tab Switcher */}
                    <div className="grid grid-cols-2 p-1 rounded-xl bg-white/55 border border-white/90 shadow-inner relative">
                      {(['login', 'signup'] as const).map((tab) => {
                        const active = activeTab === tab;
                        return (
                          <button
                            key={tab}
                            type="button"
                            onClick={() => {
                              setActiveTab(tab);
                              setError('');
                              setSuccess('');
                            }}
                            className={`relative z-10 h-9 rounded-lg text-xs font-extrabold tracking-wide transition-colors cursor-pointer ${
                              active ? 'text-white' : 'text-slate-700 hover:text-slate-950'
                            }`}
                          >
                            {active && (
                              <motion.div
                                layoutId="alqami-auth-tab-pill"
                                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                                className="absolute inset-0 rounded-lg bg-slate-950 shadow-md -z-10"
                              />
                            )}
                            {tab === 'login'
                              ? isAr ? 'تسجيل الدخول' : 'Sign In'
                              : isAr ? 'حساب جديد' : 'Sign Up'}
                          </button>
                        );
                      })}
                    </div>

                    {/* Smooth Spring Height + Directional Blur Slide Form Container */}
                    <motion.div
                      layout
                      transition={{ layout: { type: 'spring', stiffness: 350, damping: 32 } }}
                      className="overflow-hidden"
                    >
                      <AnimatePresence mode="wait">
                        {activeTab === 'login' ? (
                          <motion.form
                            key="login-form"
                            initial={{ opacity: 0, x: isAr ? 32 : -32, filter: 'blur(4px)' }}
                            animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
                            exit={{ opacity: 0, x: isAr ? -32 : 32, filter: 'blur(4px)' }}
                            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                            onSubmit={handleLoginSubmit}
                            className="space-y-3.5"
                          >
                            <div className="space-y-1">
                              <label className="text-slate-800 text-[11px] font-bold block" htmlFor="alqamiEmail">
                                {isAr ? 'البريد الإلكتروني *' : 'EMAIL ADDRESS *'}
                              </label>
                              <div className="relative group">
                                <Mail
                                  strokeWidth={2.5}
                                  className={`absolute ${isAr ? 'right-3.5' : 'left-3.5'} top-3 h-[18px] w-[18px] text-slate-950 transition-colors pointer-events-none`}
                                />
                                <input
                                  id="alqamiEmail"
                                  type="email"
                                  value={email}
                                  onChange={(e) => setEmail(e.target.value)}
                                  className={`w-full ${isAr ? 'pr-11 pl-4 text-right' : 'pl-11 pr-4 text-left'} h-10 text-slate-950 placeholder:text-slate-500 font-medium text-sm rounded-xl border outline-none focus:ring-2 focus:ring-slate-900/20 transition-all`}
                                  style={{
                                    background: 'rgba(255, 255, 255, 0.55)',
                                    borderColor: 'rgba(255, 255, 255, 0.96)',
                                  }}
                                  placeholder={isAr ? 'name@example.com' : 'name@example.com'}
                                  disabled={loading}
                                  dir="ltr"
                                  required
                                />
                              </div>
                            </div>

                            <div className="space-y-1">
                              <label className="text-slate-800 text-[11px] font-bold block" htmlFor="alqamiPassword">
                                {isAr ? 'كلمة المرور *' : 'PASSWORD *'}
                              </label>
                              <div className="relative group">
                                <Lock
                                  strokeWidth={2.5}
                                  className={`absolute ${isAr ? 'right-3.5' : 'left-3.5'} top-3 h-[18px] w-[18px] text-slate-950 transition-colors pointer-events-none`}
                                />
                                <input
                                  id="alqamiPassword"
                                  type={showPassword ? 'text' : 'password'}
                                  value={password}
                                  onChange={(e) => setPassword(e.target.value)}
                                  className={`w-full ${isAr ? 'pr-11 pl-11 text-right' : 'pl-11 pr-11 text-left'} h-10 text-slate-950 placeholder:text-slate-500 font-medium text-sm rounded-xl border outline-none focus:ring-2 focus:ring-slate-900/20 transition-all`}
                                  style={{
                                    background: 'rgba(255, 255, 255, 0.55)',
                                    borderColor: 'rgba(255, 255, 255, 0.96)',
                                  }}
                                  placeholder={isAr ? 'أدخل كلمة المرور' : 'Enter password'}
                                  disabled={loading}
                                  required
                                />
                                <button
                                  type="button"
                                  onClick={() => setShowPassword(!showPassword)}
                                  className={`absolute ${isAr ? 'left-3.5' : 'right-3.5'} top-3 text-slate-800 hover:text-black cursor-pointer`}
                                  tabIndex={-1}
                                >
                                  {showPassword ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
                                </button>
                              </div>
                            </div>

                            {error && (
                              <div className="p-3 rounded-xl bg-rose-50/90 border border-rose-300 text-rose-900 text-xs flex items-start gap-2">
                                <XCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                                <span className="font-semibold">{error}</span>
                              </div>
                            )}

                            {success && (
                              <div className="p-3 rounded-xl bg-emerald-50/90 border border-emerald-300 text-emerald-900 text-xs flex items-start gap-2">
                                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                                <span className="font-semibold">{success}</span>
                              </div>
                            )}

                            <button
                              type="submit"
                              disabled={loading}
                              className="w-full h-11 rounded-xl bg-slate-950 hover:bg-slate-900 active:scale-[0.99] text-white font-black text-xs sm:text-sm tracking-wide shadow-lg flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-60"
                            >
                              <ShinyText
                                text={loading ? (isAr ? 'جارٍ تسجيل الدخول...' : 'Signing in...') : isAr ? 'دخول إلى علقمي' : 'SIGN IN TO ALQAMI'}
                                color="#ffffff"
                                shineColor="#cbd5e1"
                                speed={3}
                                className="font-black text-xs sm:text-sm"
                              />
                              <ArrowRight className={`w-4 h-4 ${isAr ? 'rotate-180' : ''}`} />
                            </button>
                          </motion.form>
                        ) : (
                          <motion.form
                            key="signup-form"
                            initial={{ opacity: 0, x: isAr ? -32 : 32, filter: 'blur(4px)' }}
                            animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
                            exit={{ opacity: 0, x: isAr ? 32 : -32, filter: 'blur(4px)' }}
                            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                            onSubmit={handleSignupSubmit}
                            className="space-y-3.5"
                          >
                            <div className="space-y-1">
                              <label className="text-slate-800 text-[11px] font-bold block" htmlFor="alqamiRegName">
                                {isAr ? 'الاسم الكامل *' : 'FULL NAME *'}
                              </label>
                              <div className="relative group">
                                <User
                                  strokeWidth={2.5}
                                  className={`absolute ${isAr ? 'right-3.5' : 'left-3.5'} top-3 h-[18px] w-[18px] text-slate-950 transition-colors pointer-events-none`}
                                />
                                <input
                                  id="alqamiRegName"
                                  value={regName}
                                  onChange={(e) => setRegName(e.target.value)}
                                  className={`w-full ${isAr ? 'pr-11 pl-4 text-right' : 'pl-11 pr-4 text-left'} h-10 text-slate-950 placeholder:text-slate-500 font-medium text-sm rounded-xl border outline-none focus:ring-2 focus:ring-slate-900/20 transition-all`}
                                  style={{
                                    background: 'rgba(255, 255, 255, 0.55)',
                                    borderColor: 'rgba(255, 255, 255, 0.96)',
                                  }}
                                  placeholder={isAr ? 'الاسم الثلاثي أو اللقب' : 'e.g. Isaac Faleh'}
                                  disabled={loading}
                                  required
                                />
                              </div>
                            </div>

                            <div className="space-y-1">
                              <label className="text-slate-800 text-[11px] font-bold block" htmlFor="alqamiRegEmail">
                                {isAr ? 'البريد الإلكتروني *' : 'EMAIL ADDRESS *'}
                              </label>
                              <div className="relative group">
                                <Mail
                                  strokeWidth={2.5}
                                  className={`absolute ${isAr ? 'right-3.5' : 'left-3.5'} top-3 h-[18px] w-[18px] text-slate-950 transition-colors pointer-events-none`}
                                />
                                <input
                                  id="alqamiRegEmail"
                                  type="email"
                                  value={regEmail}
                                  onChange={(e) => setRegEmail(e.target.value)}
                                  className={`w-full ${isAr ? 'pr-11 pl-4 text-right' : 'pl-11 pr-4 text-left'} h-10 text-slate-950 placeholder:text-slate-500 font-medium text-sm rounded-xl border outline-none focus:ring-2 focus:ring-slate-900/20 transition-all`}
                                  style={{
                                    background: 'rgba(255, 255, 255, 0.55)',
                                    borderColor: 'rgba(255, 255, 255, 0.96)',
                                  }}
                                  placeholder="name@example.com"
                                  disabled={loading}
                                  dir="ltr"
                                  required
                                />
                              </div>
                            </div>

                            <div className="space-y-1">
                              <label className="text-slate-800 text-[11px] font-bold block" htmlFor="alqamiRegPassword">
                                {isAr ? 'كلمة المرور (٨ خانات على الأقل) *' : 'PASSWORD (MIN 8 CHARS) *'}
                              </label>
                              <div className="relative group">
                                <Lock
                                  strokeWidth={2.5}
                                  className={`absolute ${isAr ? 'right-3.5' : 'left-3.5'} top-3 h-[18px] w-[18px] text-slate-950 transition-colors pointer-events-none`}
                                />
                                <input
                                  id="alqamiRegPassword"
                                  type={showRegPassword ? 'text' : 'password'}
                                  value={regPassword}
                                  onChange={(e) => setRegPassword(e.target.value)}
                                  className={`w-full ${isAr ? 'pr-11 pl-11 text-right' : 'pl-11 pr-11 text-left'} h-10 text-slate-950 placeholder:text-slate-500 font-medium text-sm rounded-xl border outline-none focus:ring-2 focus:ring-slate-900/20 transition-all`}
                                  style={{
                                    background: 'rgba(255, 255, 255, 0.55)',
                                    borderColor: 'rgba(255, 255, 255, 0.96)',
                                  }}
                                  placeholder={isAr ? 'أنشئ كلمة مرور قوية' : 'Create password'}
                                  disabled={loading}
                                  required
                                />
                                <button
                                  type="button"
                                  onClick={() => setShowRegPassword(!showRegPassword)}
                                  className={`absolute ${isAr ? 'left-3.5' : 'right-3.5'} top-3 text-slate-800 hover:text-black cursor-pointer`}
                                  tabIndex={-1}
                                >
                                  {showRegPassword ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
                                </button>
                              </div>
                            </div>

                            {error && (
                              <div className="p-3 rounded-xl bg-rose-50/90 border border-rose-300 text-rose-900 text-xs flex items-start gap-2">
                                <XCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                                <span className="font-semibold">{error}</span>
                              </div>
                            )}

                            <button
                              type="submit"
                              disabled={loading}
                              className="w-full h-11 rounded-xl bg-slate-950 hover:bg-slate-900 active:scale-[0.99] text-white font-black text-xs sm:text-sm tracking-wide shadow-lg flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-60"
                            >
                              <ShinyText
                                text={loading ? (isAr ? 'جارٍ إنشاء الحساب...' : 'Creating account...') : isAr ? 'إنشاء حساب علقمي' : 'CREATE ALQAMI ACCOUNT'}
                                color="#ffffff"
                                shineColor="#cbd5e1"
                                speed={3}
                                className="font-black text-xs sm:text-sm"
                              />
                              <ArrowRight className={`w-4 h-4 ${isAr ? 'rotate-180' : ''}`} />
                            </button>
                          </motion.form>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  </>
                )}

                {/* Card Footer */}
                <div className="pt-2 border-t border-slate-900/10 flex items-center justify-between text-[10px] font-bold text-slate-700 tracking-wider">
                  <span>ALQAMI SPATIAL</span>
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-3 py-1 rounded-full bg-white/70 hover:bg-white text-slate-900 font-bold text-[10.5px] border border-white shadow-sm transition cursor-pointer"
                  >
                    {isAr ? 'دخول كزائر ↗' : 'Continue as Guest ↗'}
                  </button>
                  <span>alqami.net</span>
                </div>
              </div>
            </GlassSurface>
          </motion.div>

          {/* 4. Bottom Floating Magnet Dock */}
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.25, duration: 0.5 }}
            className="fixed bottom-6 inset-x-0 mx-auto w-fit z-30 flex items-center gap-2.5 p-1.5 rounded-full backdrop-blur-2xl"
            style={{
              background: 'rgba(255, 255, 255, 0.48)',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.22)',
              border: '1px solid rgba(255, 255, 255, 0.92)',
            }}
          >
            <Magnet padding={24} magnetStrength={2}>
              <button
                type="button"
                onClick={() => setShowIntro(true)}
                className="w-9 h-9 rounded-full bg-slate-950 text-white flex items-center justify-center shadow hover:scale-105 transition cursor-pointer"
                title={isAr ? 'عرض المقدمة' : 'Replay Intro'}
              >
                <Sparkles className="w-4 h-4" />
              </button>
            </Magnet>
            <Magnet padding={24} magnetStrength={2}>
              <button
                type="button"
                onClick={() => setLang(isAr ? 'en' : 'ar')}
                className="w-9 h-9 rounded-full bg-white/80 text-slate-950 flex items-center justify-center shadow hover:scale-105 transition cursor-pointer"
                title={isAr ? 'English' : 'العربية'}
              >
                <Languages className="w-4 h-4" />
              </button>
            </Magnet>
            <Magnet padding={24} magnetStrength={2}>
              <button
                type="button"
                onClick={() => {
                  setEmail('');
                  setPassword('');
                  setRegName('');
                  setRegEmail('');
                  setRegPassword('');
                  setError('');
                  setSuccess('');
                }}
                className="w-9 h-9 rounded-full bg-white/80 text-slate-950 flex items-center justify-center shadow hover:scale-105 transition cursor-pointer"
                title={isAr ? 'إعادة ضبط' : 'Reset'}
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </Magnet>
          </motion.div>

          {/* 5. Optional Intro Splash Overlay */}
          <AnimatePresence>
            {showIntro && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[140] bg-black/95 backdrop-blur-2xl flex flex-col items-center justify-center gap-6 p-6"
              >
                <div className="w-36 h-36 rounded-3xl bg-black border border-white/15 flex items-center justify-center p-5 shadow-2xl">
                  <MetallicPaint imageSrc={logoSrc} scale={1} />
                </div>
                <div className="text-center space-y-2">
                  <DecryptedText
                    text={isAr ? 'علقمي المكاني • متحف الكفيل' : 'ALQAMI SPATIAL • AL-KAFEEL MUSEUM'}
                    animateOn="view"
                    speed={40}
                    className="text-white font-black text-lg sm:text-2xl tracking-widest"
                  />
                  <p className="text-xs text-white/60 font-mono">alqami.net</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowIntro(false)}
                  className="px-7 py-2.5 rounded-full bg-white text-black font-black text-xs tracking-wide shadow-lg hover:scale-105 transition cursor-pointer"
                >
                  {isAr ? 'الدخول' : 'Enter'}
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* 6. 3D Interactive Lanyard Pass Overlay */}
          <AnimatePresence>
            {lanyardPass && (
              <AlqamiLanyardPassOverlay
                user={lanyardPass.user}
                role={lanyardPass.role}
                institution={lanyardPass.institution}
                type={lanyardPass.type}
                isAr={isAr}
                onProceed={handleProceedFromLanyard}
              />
            )}
          </AnimatePresence>
        </div>
      </ClickSpark>
    </div>
  );
}

export default AlqamiLoginScreen;
