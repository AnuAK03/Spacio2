import React, { useState } from 'react';
import { User as FirebaseUser } from 'firebase/auth';
import {
  ArrowRight,
  Car,
  CheckCircle2,
  KeyRound,
  LogOut,
  MapPin,
  ShieldCheck,
} from 'lucide-react';
import {
  registerUserAccountInFirestore,
  signInWithGooglePopup,
  signOutFirebase,
  toUserSession,
} from '../firebase';
import { UserRole, UserSession } from '../types/parkpool';
import { LiveMobilityBackground } from './LiveMobilityBackground';

interface LoginPortalProps {
  pendingFirebaseUser: FirebaseUser | null;
  isAdminEligible: boolean;
  onAuthComplete: (user: UserSession) => void;
  onRegistrationStarted?: () => void;
}

const ROLE_OPTIONS: Array<{
  role: UserRole;
  title: string;
  subtitle: string;
  defaultOrg: string;
  accentText: string;
  accentBg: string;
  accentBorder: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    role: 'driver',
    title: 'Driver',
    subtitle: 'Search, book & navigate',
    defaultOrg: 'Bengaluru Commuter',
    accentText: 'text-[#C83709]',
    accentBg: 'bg-[#FFF0EA]',
    accentBorder: 'border-[#D93F0B] ring-1 ring-[#D93F0B]',
    icon: Car,
  },
  {
    role: 'host',
    title: 'Provider',
    subtitle: 'Onboard, slots & payouts',
    defaultOrg: 'Bengaluru Parking Partner',
    accentText: 'text-[#047857]',
    accentBg: 'bg-emerald-50',
    accentBorder: 'border-[#047857] ring-1 ring-[#047857]',
    icon: KeyRound,
  },
  {
    role: 'admin',
    title: 'Admin',
    subtitle: 'Verify, approve & audit',
    defaultOrg: 'Compliance & Operations Command',
    accentText: 'text-[#4338CA]',
    accentBg: 'bg-indigo-50',
    accentBorder: 'border-[#4338CA] ring-1 ring-[#4338CA]',
    icon: ShieldCheck,
  },
];

export const LoginPortal: React.FC<LoginPortalProps> = ({
  pendingFirebaseUser,
  isAdminEligible,
  onAuthComplete,
}) => {
  const [selectedRole, setSelectedRole] = useState<UserRole>(
    isAdminEligible ? 'admin' : 'driver'
  );
  const [displayName, setDisplayName] = useState(
    pendingFirebaseUser?.displayName || ''
  );
  const [organization, setOrganization] = useState(
    isAdminEligible ? 'Compliance & Operations Command' : 'Bengaluru Commuter'
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visibleRoles = ROLE_OPTIONS.filter(
    (opt) => opt.role !== 'admin' || isAdminEligible
  );

  const handleGoogleSignIn = async () => {
    setBusy(true);
    setError(null);
    try {
      await signInWithGooglePopup();
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Google Sign-In could not be completed.';
      setError(msg.replace(/^Firebase:\s*/i, ''));
    } finally {
      setBusy(false);
    }
  };

  const handleCompleteRegistration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingFirebaseUser) return;
    setBusy(true);
    setError(null);
    try {
      const account = await registerUserAccountInFirestore({
        fbUser: pendingFirebaseUser,
        role: selectedRole,
        organization,
        displayName: displayName || pendingFirebaseUser.displayName || undefined,
      });
      const idToken = await pendingFirebaseUser.getIdToken();
      const res = await fetch('/api/auth/session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          role: account.role,
          organization: account.organization,
          displayName: account.displayName,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Could not establish verified session.');
      }
      onAuthComplete(data.user || toUserSession(account));
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : 'Registration failed. Please try again.'
      );
    } finally {
      setBusy(false);
    }
  };

  const handleSelectRole = (opt: (typeof ROLE_OPTIONS)[number]) => {
    setSelectedRole(opt.role);
    setOrganization(opt.defaultOrg);
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
                <div className="text-xs text-slate-300">
                  Smart Parking. Shared Possibilities.
                </div>
              </div>
            </div>

            <h1 className="mt-8 font-display text-3xl font-bold leading-snug text-white">
              Find, Book & Share Verified Parking
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-slate-200">
              Connect with verified residential, community, and commercial spaces across
              Bengaluru with exact gate walking routes and instant booking protection.
            </p>

            <ul className="mt-6 space-y-3 text-sm text-slate-100">
              {[
                'Verified listings & transparent hourly pricing',
                'Live walking routes to exact parking gates',
                'QR gate verification & zero-loss overstay protection',
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

        {/* Right Firebase Google Auth & Role Onboarding Card */}
        <div className="flex flex-col justify-center p-6 sm:p-8 lg:col-span-6">
          {!pendingFirebaseUser ? (
            <div className="space-y-6">
              <div>
                <h2 className="font-display text-2xl font-bold text-[#111827]">
                  Sign In to ParkPool AI
                </h2>
                <p className="mt-1.5 text-sm text-[#4B5563]">
                  Authenticate securely with your Google account. Your role, driver
                  profile, and verification records are stored in your encrypted account
                  database.
                </p>
              </div>

              {error && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-700">
                  {error}
                </div>
              )}

              <button
                type="button"
                disabled={busy}
                onClick={() => void handleGoogleSignIn()}
                className="flex w-full items-center justify-center gap-3 rounded-xl border border-black/[0.12] bg-white px-5 py-3.5 text-sm font-bold text-[#111827] shadow-sm transition-all hover:border-[#D93F0B] hover:bg-[#FFF9F6] disabled:opacity-60"
              >
                <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                  />
                </svg>
                <span>{busy ? 'Connecting with Google...' : 'Continue with Google'}</span>
                <ArrowRight className="h-4 w-4 text-[#C83709]" />
              </button>

              <div className="rounded-xl border border-black/[0.07] bg-[#F8F7F4] p-4 text-xs leading-relaxed text-[#4B5563]">
                New users can choose between a <strong className="text-[#111827]">Driver</strong>{' '}
                or <strong className="text-[#111827]">Parking Provider</strong> account
                immediately after Google verification. Returning users are signed in
                directly to their saved workspace.
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-2xl font-bold text-[#111827]">
                    Complete Your Account
                  </h2>
                  <p className="mt-1 text-xs text-[#4B5563]">
                    Signed in as{' '}
                    <strong className="text-[#111827]">
                      {pendingFirebaseUser.email}
                    </strong>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void signOutFirebase()}
                  className="flex items-center gap-1 whitespace-nowrap shrink-0 rounded-lg border border-black/[0.1] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#4B5563] hover:text-rose-600"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span>Switch Account</span>
                </button>
              </div>

              <div
                className={`grid grid-cols-1 gap-2.5 ${
                  visibleRoles.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'
                }`}
              >
                {visibleRoles.map((opt) => {
                  const Icon = opt.icon;
                  const active = selectedRole === opt.role;
                  return (
                    <button
                      key={opt.role}
                      type="button"
                      onClick={() => handleSelectRole(opt)}
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
                onSubmit={(e) => void handleCompleteRegistration(e)}
                className="space-y-3.5"
              >
                <div>
                  <label
                    htmlFor="reg-name"
                    className="mb-1 block text-xs font-semibold text-[#374151]"
                  >
                    Full Name
                  </label>
                  <input
                    id="reg-name"
                    type="text"
                    required
                    maxLength={100}
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder={pendingFirebaseUser.displayName || 'Your full name'}
                    className="w-full rounded-xl border border-black/[0.1] bg-[#F8F7F4] px-3.5 py-2.5 text-sm text-[#111827] focus:border-[#D93F0B] focus:bg-white focus:outline-none"
                  />
                </div>

                <div>
                  <label
                    htmlFor="reg-org"
                    className="mb-1 block text-xs font-semibold text-[#374151]"
                  >
                    {selectedRole === 'host'
                      ? 'Property / Organization Name'
                      : 'Commuter Label / Organization'}
                  </label>
                  <input
                    id="reg-org"
                    type="text"
                    required
                    maxLength={120}
                    value={organization}
                    onChange={(e) => setOrganization(e.target.value)}
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
                  <span>
                    {busy ? 'Creating Account...' : 'Create Account & Enter Workspace'}
                  </span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
