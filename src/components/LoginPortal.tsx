import React, { useState } from 'react';
import {
  ArrowRight,
  Car,
  CheckCircle2,
  KeyRound,
  MapPin,
  ShieldCheck,
} from 'lucide-react';
import { UserRole, UserSession } from '../types/parkpool';
import { LiveMobilityBackground } from './LiveMobilityBackground';

interface LoginPortalProps {
  onLoginSuccess: (user: UserSession, token: string) => void;
}

const ROLE_OPTIONS: Array<{
  role: UserRole;
  title: string;
  subtitle: string;
  defaultName: string;
  defaultEmail: string;
  accentText: string;
  accentBg: string;
  accentBorder: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    role: 'driver',
    title: 'Driver',
    subtitle: 'Search, book & navigate',
    defaultName: 'Aarav Sharma',
    defaultEmail: 'aarav.sharma@bengaluru.in',
    accentText: 'text-[#C83709]',
    accentBg: 'bg-[#FFF0EA]',
    accentBorder: 'border-[#D93F0B] ring-1 ring-[#D93F0B]',
    icon: Car,
  },
  {
    role: 'host',
    title: 'Provider',
    subtitle: 'Onboard, slots & payouts',
    defaultName: 'Raghavendra K.',
    defaultEmail: 'raghavendra.host@parkpool.in',
    accentText: 'text-[#047857]',
    accentBg: 'bg-emerald-50',
    accentBorder: 'border-[#047857] ring-1 ring-[#047857]',
    icon: KeyRound,
  },
  {
    role: 'admin',
    title: 'Admin',
    subtitle: 'Verify, approve & audit',
    defaultName: 'Ananya Ops',
    defaultEmail: 'ananya.ops@parkpool.in',
    accentText: 'text-[#4338CA]',
    accentBg: 'bg-indigo-50',
    accentBorder: 'border-[#4338CA] ring-1 ring-[#4338CA]',
    icon: ShieldCheck,
  },
];

export const LoginPortal: React.FC<LoginPortalProps> = ({ onLoginSuccess }) => {
  const [selectedRole, setSelectedRole] = useState<UserRole>('driver');
  const [name, setName] = useState(ROLE_OPTIONS[0].defaultName);
  const [email, setEmail] = useState(ROLE_OPTIONS[0].defaultEmail);
  const [password, setPassword] = useState('••••••••••');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectRole = (opt: (typeof ROLE_OPTIONS)[number]) => {
    setSelectedRole(opt.role);
    setName(opt.defaultName);
    setEmail(opt.defaultEmail);
  };

  const submitLogin = async (roleOverride?: UserRole) => {
    setBusy(true);
    setError(null);
    const activeRole = roleOverride ?? selectedRole;
    const preset = ROLE_OPTIONS.find((r) => r.role === activeRole)!;

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: activeRole,
          name: roleOverride ? preset.defaultName : name,
          email: roleOverride ? preset.defaultEmail : email,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Sign-in failed');
      onLoginSuccess(data.user, data.token);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to sign in');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4 py-8 text-[#111827]">
      <LiveMobilityBackground />

      <div className="grid w-full max-w-5xl grid-cols-1 overflow-hidden rounded-3xl border border-black/[0.08] bg-white/90 shadow-2xl backdrop-blur-xl lg:grid-cols-12">
        {/* Left Energetic Ride-App Showcase Panel */}
        <div className="relative flex flex-col justify-between overflow-hidden bg-gradient-to-br from-[#18122B] via-[#2B1B3D] to-[#0D3B36] p-6 text-white sm:p-8 lg:col-span-6">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[#FF5A1F]/25 blur-3xl"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-16 -left-16 h-56 w-56 rounded-full bg-[#10B981]/25 blur-3xl"
          />

          <div className="relative z-10">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-[#FF5A1F] to-[#D93F0B] font-display text-xl font-extrabold text-white shadow-md">
                P
              </div>
              <div>
                <div className="font-display text-2xl font-extrabold tracking-tight">
                  ParkPool <span className="text-[#FF8A5C]">AI</span>
                </div>
                <div className="text-xs text-slate-300">Smart Parking. Shared Possibilities.</div>
              </div>
            </div>

            <h1 className="mt-8 font-display text-3xl font-bold leading-snug text-white">
              Find, Book & Share Verified Parking
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-slate-200">
              Connect with verified residential, community, and commercial spaces across Bengaluru
              with exact gate walking routes and instant booking protection.
            </p>

            <ul className="mt-6 space-y-3 text-sm text-slate-100">
              {[
                'Verified listings & transparent hourly pricing',
                'Live walking routes to exact parking gates',
                'AI assistant with live Supervisor verification',
                'Instant confirmation & conflict-free slots',
              ].map((item) => (
                <li key={item} className="flex items-center gap-2.5">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-[#34D399]" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="relative z-10 mt-8 flex items-center justify-between border-t border-white/15 pt-4 text-xs text-slate-300">
            <span className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-[#FF8A5C]" />
              Bengaluru City Network
            </span>
            <span>Find · Book · Share</span>
          </div>
        </div>

        {/* Right Clean Sign-In Card */}
        <div className="flex flex-col justify-between p-6 sm:p-8 lg:col-span-6">
          <div className="space-y-5">
            <div>
              <h2 className="font-display text-2xl font-bold text-[#111827]">Welcome Back</h2>
              <p className="mt-1 text-sm text-[#4B5563]">Sign in to continue to ParkPool AI.</p>
            </div>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              {ROLE_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const active = selectedRole === opt.role;
                return (
                  <button
                    key={opt.role}
                    type="button"
                    onClick={() => selectRole(opt)}
                    className={`rounded-xl border p-3 text-left transition-all ${
                      active
                        ? `${opt.accentBorder} ${opt.accentBg}`
                        : 'border-black/[0.08] bg-[#F8F7F4] hover:border-black/20'
                    }`}
                  >
                    <Icon
                      className={`h-4 w-4 ${active ? opt.accentText : 'text-[#4B5563]'}`}
                    />
                    <div className="mt-2 font-display text-sm font-bold text-[#111827]">
                      {opt.title}
                    </div>
                    <div className="text-[11px] text-[#4B5563]">{opt.subtitle}</div>
                  </button>
                );
              })}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void submitLogin();
              }}
              className="space-y-3.5"
            >
              <div>
                <label htmlFor="login-name" className="mb-1 block text-xs font-semibold text-[#374151]">
                  Full Name
                </label>
                <input
                  id="login-name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-xl border border-black/[0.1] bg-[#F8F7F4] px-3.5 py-2.5 text-sm text-[#111827] focus:border-[#D93F0B] focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="login-email" className="mb-1 block text-xs font-semibold text-[#374151]">
                  Email Address
                </label>
                <input
                  id="login-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl border border-black/[0.1] bg-[#F8F7F4] px-3.5 py-2.5 text-sm text-[#111827] focus:border-[#D93F0B] focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="login-pass" className="mb-1 block text-xs font-semibold text-[#374151]">
                  Password
                </label>
                <input
                  id="login-pass"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-black/[0.1] bg-[#F8F7F4] px-3.5 py-2.5 text-sm text-[#111827] focus:border-[#D93F0B] focus:bg-white focus:outline-none"
                />
              </div>

              {error && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={busy}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#E0430D] to-[#C83709] px-5 py-3 text-sm font-bold text-white shadow-sm transition-all hover:brightness-110 disabled:opacity-60"
              >
                <span>{busy ? 'Signing in...' : 'Sign In'}</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </form>
          </div>

          <div className="mt-6 border-t border-black/[0.06] pt-4">
            <div className="mb-2 text-xs font-medium text-[#4B5563]">Quick Demo Access:</div>
            <div className="flex flex-wrap gap-2">
              {ROLE_OPTIONS.map((opt) => (
                <button
                  key={opt.role}
                  type="button"
                  disabled={busy}
                  onClick={() => void submitLogin(opt.role)}
                  className="whitespace-nowrap shrink-0 rounded-lg border border-black/[0.08] bg-white px-3 py-1.5 text-xs font-semibold text-[#111827] transition-colors hover:border-[#D93F0B] hover:text-[#C83709]"
                >
                  Demo {opt.title}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
