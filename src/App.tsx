import React, { useCallback, useEffect, useState } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import {
  Activity,
  BookOpen,
  Bot,
  Building2,
  Calendar,
  CheckCircle2,
  CreditCard,
  FileCheck2,
  IndianRupee,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  MapPin,
  Menu,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  X,
} from 'lucide-react';
import {
  auth,
  checkIsAdminAccount,
  fetchDriverProfileFromFirestore,
  fetchUserAccount,
  recordUserLoginTimestamp,
  saveDriverProfileToFirestore,
  saveProviderToFirestore,
  signOutFirebase,
  subscribeUserAccount,
  subscribeUserBookings,
  syncHeldBookingToFirestore,
  toUserSession,
  FirestoreBookingDoc,
} from './firebase';
import { AdminPortalView, AdminSubTab } from './components/AdminPortalView';
import { AiAssistantDrawer } from './components/AiAssistantDrawer';
import { DashboardView } from './components/DashboardView';
import { DriverGuidelinesView } from './components/DriverGuidelinesView';
import { DriverProfilePayload, DriverProfileView } from './components/DriverProfileView';
import { DriverSupportView } from './components/DriverSupportView';
import { FindParkingView } from './components/FindParkingView';
import { LiveMobilityBackground } from './components/LiveMobilityBackground';
import { LoginPortal } from './components/LoginPortal';
import { NewFacilityPayload, ProviderPortalView } from './components/ProviderPortalView';
import {
  BengaluruLocation,
  BookingRecord,
  DetailedProviderType,
  DriverProfile,
  ExtensionAlternative,
  IncidentRecord,
  OperationalCheckRecord,
  PaymentOrder,
  PrepaidWallet,
  ProviderRecord,
  ProviderVerificationStatus,
  UserReportRecord,
  UserSession,
  WorkspaceSnapshot,
} from './types/parkpool';

type AppTab =
  | 'find'
  | 'dashboard'
  | 'support'
  | 'guidelines'
  | 'profile'
  | 'provider-onboarding'
  | 'provider-facilities'
  | 'provider-bookings'
  | 'provider-settlements'
  | 'admin-providers'
  | 'admin-spaces'
  | 'admin-payments'
  | 'admin-ops';

export default function App() {
  const [authReady, setAuthReady] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [isAdminEligible, setIsAdminEligible] = useState(false);
  const [user, setUser] = useState<UserSession | null>(null);
  const [activeTab, setActiveTab] = useState<AppTab>('find');
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot | null>(null);
  const [firestoreBookings, setFirestoreBookings] = useState<FirestoreBookingDoc[]>([]);
  const [firestoreDriverProfile, setFirestoreDriverProfile] = useState<DriverProfile | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('VEH-SUV-01');
  const [userWallet, setUserWallet] = useState<PrepaidWallet | null>(null);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    window.setTimeout(() => {
      setToast((prev) => (prev?.message === message ? null : prev));
    }, 5500);
  }, []);

  const syncServerSession = useCallback(
    async (fbUser: FirebaseUser, session: UserSession): Promise<UserSession> => {
      const idToken = await fbUser.getIdToken();
      const res = await fetch('/api/auth/session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          role: session.role,
          organization: session.organization,
          displayName: session.name,
        }),
      });
      if (!res.ok) return session;
      const data = await res.json();
      return data.user || session;
    },
    []
  );

  useEffect(() => {
    let active = true;
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (!active) return;
      setFirebaseUser(fbUser);
      if (!fbUser) {
        setUser(null);
        setFirestoreDriverProfile(null);
        setIsAdminEligible(false);
        setAuthReady(true);
        return;
      }

      try {
        const [adminEligible, existingAccount, savedDriverProfile] = await Promise.all([
          checkIsAdminAccount(fbUser),
          fetchUserAccount(fbUser.uid),
          fetchDriverProfileFromFirestore(fbUser.uid).catch(() => null),
        ]);
        if (!active) return;
        setIsAdminEligible(adminEligible);
        if (savedDriverProfile) {
          setFirestoreDriverProfile(savedDriverProfile);
        }

        if (existingAccount) {
          const updatedAccount = await recordUserLoginTimestamp(fbUser, existingAccount);
          const session = await syncServerSession(fbUser, toUserSession(updatedAccount));
          if (!active) return;
          setUser(session);
          if (savedDriverProfile && session.role === 'driver') {
            try {
              const idToken = await fbUser.getIdToken();
              const syncRes = await fetch('/api/driver/profile', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${idToken}`,
                  'x-parkpool-role': session.role,
                },
                body: JSON.stringify({
                  fullName: savedDriverProfile.fullName,
                  email: savedDriverProfile.email || session.email,
                  phone: savedDriverProfile.phone,
                  licenseNumber: savedDriverProfile.licenseNumber,
                  licenseValidTill: savedDriverProfile.licenseValidTill,
                  wheelerCategory: savedDriverProfile.wheelerCategory,
                  vehicleType: savedDriverProfile.vehicleType,
                  vehicleModel: savedDriverProfile.vehicleModel,
                  plateNumber: savedDriverProfile.plateNumber,
                  isEv: savedDriverProfile.isEv,
                }),
              });
              if (syncRes.ok) {
                const syncData = await syncRes.json();
                if (syncData.snapshot) setSnapshot(syncData.snapshot);
                if (syncData.vehicle?.id) setSelectedVehicleId(syncData.vehicle.id);
              }
            } catch {
              // Keep client profile ready even if backend sync is skipped
            }
          }
          if (session.role === 'host') {
            setActiveTab('provider-onboarding');
          } else if (session.role === 'admin') {
            setActiveTab('admin-providers');
          } else {
            setActiveTab('find');
          }
        } else {
          setUser(null);
        }
      } catch (err) {
        console.error('Firebase auth session sync failed:', err);
        setUser(null);
      } finally {
        if (active) setAuthReady(true);
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [syncServerSession]);

  useEffect(() => {
    if (!authReady || !firebaseUser || !user) return;
    const unsubDoc = subscribeUserAccount(firebaseUser.uid, (accountDoc) => {
      if (!accountDoc) return;
      const synced = toUserSession(accountDoc);
      setUser((prev) =>
        prev &&
        prev.role === synced.role &&
        prev.name === synced.name &&
        prev.organization === synced.organization
          ? prev
          : synced
      );
    });
    const unsubBookings = subscribeUserBookings(firebaseUser.uid, (items) => {
      setFirestoreBookings(items);
    });
    return () => {
      unsubDoc();
      unsubBookings();
    };
  }, [authReady, firebaseUser, user]);

  const apiFetch = useCallback(
    async (url: string, init: RequestInit = {}) => {
      const headers = new Headers(init.headers);
      if (!headers.has('Content-Type') && init.body) {
        headers.set('Content-Type', 'application/json');
      }
      const currentFbUser = auth.currentUser;
      if (currentFbUser) {
        const freshToken = await currentFbUser.getIdToken();
        headers.set('Authorization', `Bearer ${freshToken}`);
      }
      if (user?.role) {
        headers.set('x-parkpool-role', user.role);
      }
      return fetch(url, { ...init, headers });
    },
    [user?.role]
  );

  const fetchWorkspace = useCallback(async () => {
    const res = await fetch('/api/workspace');
    if (!res.ok) throw new Error('Failed to load ParkPool workspace');
    const data: WorkspaceSnapshot = await res.json();
    setSnapshot(data);
  }, []);

  useEffect(() => {
    void fetchWorkspace();
  }, [fetchWorkspace]);

  useEffect(() => {
    if (!authReady || !firebaseUser || !user) {
      setUserWallet(null);
      return;
    }
    let active = true;
    void (async () => {
      try {
        const res = await apiFetch('/api/wallet');
        if (!res.ok || !active) return;
        const data = await res.json();
        if (active && data.wallet) setUserWallet(data.wallet as PrepaidWallet);
      } catch {
        // Ignore transient fetch errors
      }
    })();
    return () => {
      active = false;
    };
  }, [authReady, firebaseUser, user, apiFetch]);

  const handleAuthComplete = (session: UserSession) => {
    setUser(session);
    if (session.role === 'host') {
      setActiveTab('provider-onboarding');
    } else if (session.role === 'admin') {
      setActiveTab('admin-providers');
    } else {
      setActiveTab('find');
    }
  };

  const handleLogout = async () => {
    await signOutFirebase();
    setUser(null);
    setAssistantOpen(false);
    setMobileMenuOpen(false);
  };

  const currentDriverProfile =
    snapshot?.driverProfiles.find(
      (p) => p.email.toLowerCase() === user?.email.toLowerCase()
    ) ||
    (firestoreDriverProfile &&
    firestoreDriverProfile.email.toLowerCase() === user?.email.toLowerCase()
      ? firestoreDriverProfile
      : undefined);

  const currentWallet =
    snapshot?.wallets.find((w) => w.driverEmail.toLowerCase() === user?.email.toLowerCase()) ||
    userWallet ||
    undefined;

  // =========================================================================
  // DRIVER HANDLERS
  // =========================================================================

  const handleSelectLocation = useCallback(async (location: BengaluruLocation) => {
    const res = await fetch('/api/locations/select', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ location }),
    });
    if (!res.ok) return;
    const data = await res.json();
    if (data.snapshot) setSnapshot(data.snapshot);
  }, []);

  const handleCreateHold = async (params: {
    spaceId: string;
    vehicleId: string;
    startMin: number;
    endMin: number;
  }): Promise<BookingRecord | null> => {
    const res = await apiFetch('/api/bookings/hold', {
      method: 'POST',
      body: JSON.stringify({
        ...params,
        driverName: currentDriverProfile?.fullName || user?.name || 'Driver',
        driverEmail: user?.email,
        driverLicense: currentDriverProfile?.licenseNumber,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast('error', data.error || 'Could not reserve spot');
      return null;
    }
    setSnapshot(data.snapshot);
    if (firebaseUser && data.booking) {
      void syncHeldBookingToFirestore(firebaseUser.uid, data.booking).catch(console.error);
    }
    showToast('success', `Spot ${data.booking.spaceCode} reserved.`);
    return data.booking as BookingRecord;
  };

  const handleCompleteInstantPayment = async (
    bookingId: string
  ): Promise<BookingRecord | null> => {
    const order = await handleCreatePaymentOrder(bookingId);
    if (!order) return null;
    const res = await apiFetch(`/api/payments/orders/${order.id}/gateway-dispatch`, {
      method: 'POST',
      body: JSON.stringify({ outcome: 'payment.succeeded' }),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast('error', data.error || 'Payment could not be completed');
      return null;
    }
    setSnapshot(data.snapshot);
    showToast('success', 'Payment confirmed! Your Entry QR Pass is ready.');
    return (data.booking as BookingRecord) || null;
  };

  const handleCreatePaymentOrder = async (bookingId: string): Promise<PaymentOrder | null> => {
    const res = await apiFetch('/api/payments/orders', {
      method: 'POST',
      body: JSON.stringify({ bookingId }),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast('error', data.error || 'Failed to generate payment order');
      return null;
    }
    setSnapshot(data.snapshot);
    showToast(
      'success',
      `Server payment order ${data.order.id} created (₹${data.order.amountInr}).`
    );
    return data.order;
  };

  const handleDispatchGatewayWebhook = async (
    orderId: string,
    outcome: 'payment.succeeded' | 'payment.failed',
    customEventId?: string
  ) => {
    const res = await apiFetch(`/api/payments/orders/${orderId}/gateway-dispatch`, {
      method: 'POST',
      body: JSON.stringify({ outcome, eventId: customEventId }),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast('error', data.error || 'Gateway webhook error');
      return;
    }
    setSnapshot(data.snapshot);
    if (data.duplicate) {
      showToast(
        'success',
        `Duplicate webhook ${data.webhookEvent.eventId} safely ignored (idempotent).`
      );
    } else if (outcome === 'payment.failed') {
      showToast('error', 'Payment failed at gateway — slot hold released safely.');
    } else {
      showToast(
        'success',
        `Signed webhook verified! Booking ${data.booking?.id} confirmed (${data.booking?.invoiceNumber}).`
      );
    }
  };

  const handleBookingAction = async (
    bookingId: string,
    action: 'checkin' | 'checkout' | 'cancel',
    arrivalMinutesLate?: number
  ) => {
    const res = await apiFetch(`/api/bookings/${bookingId}/action`, {
      method: 'POST',
      body: JSON.stringify({ action, arrivalMinutesLate }),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast('error', data.error || 'Booking update blocked');
      return;
    }
    setSnapshot(data.snapshot);
    if (firebaseUser && data.booking) {
      void syncHeldBookingToFirestore(firebaseUser.uid, data.booking).catch(console.error);
    }
    showToast('success', `Booking ${bookingId} updated (${data.booking.status}).`);
  };

  const handleVerifyQrCheckin = async (
    bookingId: string,
    payload: {
      scannedToken: string;
      scanMethod: 'camera' | 'upload' | 'gate_placard' | 'manual_token';
      arrivalMinutesLate: number;
    }
  ): Promise<{ ok: boolean; error?: string }> => {
    const res = await apiFetch(`/api/bookings/${bookingId}/qr-checkin`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast('error', data.error || 'QR check-in verification failed');
      return { ok: false, error: data.error || 'QR check-in verification failed' };
    }
    setSnapshot(data.snapshot);
    if (firebaseUser && data.booking) {
      void syncHeldBookingToFirestore(firebaseUser.uid, data.booking).catch(console.error);
    }
    showToast(
      'success',
      `Gate QR verified! Booking ${bookingId} status is now ${data.booking.status}.`
    );
    return { ok: true };
  };

  const handleResolveOverstayImpact = async (
    bookingId: string,
    choice: 'reschedule' | 'refund_with_credit'
  ) => {
    const res = await apiFetch(`/api/bookings/${bookingId}/overstay-resolve`, {
      method: 'POST',
      body: JSON.stringify({ choice }),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast('error', data.error || 'Could not apply overstay protection resolution');
      return;
    }
    setSnapshot(data.snapshot);
    showToast(
      'success',
      choice === 'reschedule'
        ? 'Slot rescheduled at ₹0 fee!'
        : '100% refund + ₹50 delay compensation credit processed!'
    );
  };

  const handleReportOverstay = async (bookingId: string, overstayMinutes: number) => {
    const res = await apiFetch(`/api/bookings/${bookingId}/overstay`, {
      method: 'POST',
      body: JSON.stringify({ overstayMinutes }),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast('error', data.error || 'Could not flag overstay');
      return;
    }
    setSnapshot(data.snapshot);
    showToast('success', data.summary || 'Overstay logged and downstream rider protected.');
  };

  const handleRequestExtension = async (
    bookingId: string,
    additionalMinutes: number
  ): Promise<{ ok: boolean; alternatives?: ExtensionAlternative[] }> => {
    const res = await apiFetch(`/api/bookings/${bookingId}/extend`, {
      method: 'POST',
      body: JSON.stringify({ additionalMinutes }),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast('error', data.error || 'Extension blocked due to slot conflict');
      return { ok: false, alternatives: data.alternatives || [] };
    }
    setSnapshot(data.snapshot);
    showToast(
      'success',
      `Extension request queued for host approval (+₹${data.extensionRequest.additionalTotalInr}).`
    );
    return { ok: true };
  };

  const handleResolveWithdrawal = async (bookingId: string, choice: 'rebook' | 'refund') => {
    const res = await apiFetch(`/api/bookings/${bookingId}/withdrawal-resolve`, {
      method: 'POST',
      body: JSON.stringify({ choice }),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast('error', data.error || 'Could not resolve withdrawn booking');
      return;
    }
    setSnapshot(data.snapshot);
    showToast(
      'success',
      choice === 'rebook'
        ? 'Rebooked onto alternative verified facility!'
        : 'Full refund initiated to original payment method.'
    );
  };

  const handleSubmitReview = async (bookingId: string, rating: number, comment: string) => {
    const res = await apiFetch(`/api/bookings/${bookingId}/review`, {
      method: 'POST',
      body: JSON.stringify({ rating, comment, authorName: user?.name || 'Driver' }),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast('error', data.error || 'Could not submit review');
      return;
    }
    setSnapshot(data.snapshot);
    showToast('success', 'Review submitted.');
  };

  const handleSaveDriverProfile = async (payload: DriverProfilePayload) => {
    const res = await apiFetch('/api/driver/profile', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast('error', data.error || 'Could not save driver profile');
      throw new Error(data.error || 'Could not save driver profile');
    }
    setSnapshot(data.snapshot);
    if (data.profile) {
      setFirestoreDriverProfile(data.profile);
      if (firebaseUser) {
        void saveDriverProfileToFirestore(firebaseUser.uid, data.profile).catch(console.error);
      }
    }
    if (data.vehicle?.id) setSelectedVehicleId(data.vehicle.id);
    showToast('success', `Saved! Active vehicle: ${data.vehicle.label}`);
  };

  const handleSubmitIncident = async (payload: {
    facilityId?: string;
    bookingId?: string;
    category: IncidentRecord['category'];
    severity: IncidentRecord['severity'];
    description: string;
  }) => {
    const res = await apiFetch('/api/incidents', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast('error', data.error || 'Could not file incident');
      return;
    }
    setSnapshot(data.snapshot);
    showToast('success', `Incident ${data.incident.id} logged for ops triage.`);
  };

  const handleRaiseDispute = async (payload: {
    bookingId: string;
    reason: string;
    requestedRefundInr: number;
  }) => {
    const res = await apiFetch('/api/disputes', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast('error', data.error || 'Could not raise dispute');
      return;
    }
    setSnapshot(data.snapshot);
    showToast('success', `Refund dispute ${data.dispute.id} submitted to admin queue.`);
  };

  const handleSubmitUserReport = async (payload: { reportedEntity: string; reason: string }) => {
    const res = await apiFetch('/api/reports', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast('error', data.error || 'Could not file user report');
      return;
    }
    setSnapshot(data.snapshot);
    showToast('success', `Report ${data.report.id} sent to trust & safety moderation.`);
  };

  const handleMarkNotificationRead = async (id: string) => {
    const res = await apiFetch(`/api/notifications/${id}/read`, { method: 'POST' });
    if (!res.ok) return;
    const data = await res.json();
    if (data.snapshot) setSnapshot(data.snapshot);
  };

  // =========================================================================
  // PREPAID WALLET, AUTONOMOUS LIFECYCLE & SMART DEPARTURE HANDLERS
  // =========================================================================

  const handleTopUpWallet = async (amountInr: number) => {
    const res = await apiFetch('/api/wallet/topup', {
      method: 'POST',
      body: JSON.stringify({ amountInr }),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast('error', data.error || 'Could not add funds to Prepaid Wallet');
      return;
    }
    if (data.wallet) setUserWallet(data.wallet);
    if (data.snapshot) setSnapshot(data.snapshot);
    showToast('success', `Added ₹${amountInr} to your Prepaid Parking Balance.`);
  };

  const handlePayWithWallet = async (bookingId: string): Promise<BookingRecord | null> => {
    const res = await apiFetch(`/api/bookings/${bookingId}/pay-wallet`, {
      method: 'POST',
    });
    const data = await res.json();
    if (!res.ok) {
      if (data.wallet) setUserWallet(data.wallet);
      showToast('error', data.error || 'Wallet payment could not be completed');
      return null;
    }
    if (data.wallet) setUserWallet(data.wallet);
    if (data.snapshot) setSnapshot(data.snapshot);
    showToast('success', 'Paid from Prepaid Wallet! Your Entry QR Pass is ready.');
    return (data.booking as BookingRecord) || null;
  };

  const handleRunLifecycleCheck = async (
    bookingId: string,
    requestedExtensionMinutes = 30
  ) => {
    const res = await apiFetch('/api/agents/lifecycle/evaluate', {
      method: 'POST',
      body: JSON.stringify({ bookingId, requestedExtensionMinutes }),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast('error', data.error || 'Lifecycle agent check failed');
      return;
    }
    if (data.wallet && user && data.wallet.driverEmail?.toLowerCase() === user.email.toLowerCase()) {
      setUserWallet(data.wallet);
    }
    if (data.snapshot) setSnapshot(data.snapshot);
    showToast(
      'success',
      data.lifecycleEvent?.outcomeSummary || 'Autonomous lifecycle check completed.'
    );
  };

  const handleRespondExtensionOffer = async (
    bookingId: string,
    offerId: string,
    decision: 'accept' | 'decline'
  ) => {
    const res = await apiFetch(`/api/bookings/${bookingId}/extension-offers/${offerId}/respond`, {
      method: 'POST',
      body: JSON.stringify({ decision }),
    });
    const data = await res.json();
    if (!res.ok) {
      if (data.wallet) setUserWallet(data.wallet);
      showToast('error', data.error || 'Could not process extension offer response');
      return;
    }
    if (data.wallet) setUserWallet(data.wallet);
    if (data.snapshot) setSnapshot(data.snapshot);
    showToast(
      'success',
      decision === 'accept'
        ? `Extension accepted and settled from Prepaid Wallet!`
        : 'Extension declined — please proceed to exit when ready.'
    );
  };

  const handleSendDepartureSignal = async (
    bookingId: string,
    signalType: 'im_leaving_button' | 'geofence_exit',
    distanceFromGateM?: number
  ) => {
    const res = await apiFetch(`/api/bookings/${bookingId}/departure-signal`, {
      method: 'POST',
      body: JSON.stringify({ signalType, distanceFromGateM }),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast('error', data.error || 'Could not record departure signal');
      return;
    }
    if (data.snapshot) setSnapshot(data.snapshot);
    showToast(
      'success',
      signalType === 'geofence_exit'
        ? 'GPS geofence exit detected — bay marked DEPARTURE_PENDING until checkout is confirmed.'
        : 'Marked DEPARTURE_PENDING — confirm checkout when you drive out.'
    );
  };

  const handleConfirmDeparture = async (bookingId: string) => {
    const res = await apiFetch(`/api/bookings/${bookingId}/confirm-departure`, {
      method: 'POST',
    });
    const data = await res.json();
    if (!res.ok) {
      showToast('error', data.error || 'Could not confirm departure');
      return;
    }
    if (data.wallet && user && data.wallet.driverEmail?.toLowerCase() === user.email.toLowerCase()) {
      setUserWallet(data.wallet);
    }
    if (data.snapshot) setSnapshot(data.snapshot);
    showToast(
      'success',
      'Departure confirmed! 15-minute clearance buffer started before space reopens.'
    );
  };

  const handleCompleteClearance = async (spaceId: string) => {
    const res = await apiFetch(`/api/spaces/${spaceId}/complete-clearance`, {
      method: 'POST',
    });
    const data = await res.json();
    if (!res.ok) {
      showToast('error', data.error || 'Clearance completion blocked');
      return;
    }
    if (data.snapshot) setSnapshot(data.snapshot);
    showToast(
      'success',
      `Buffer completed & physical vacancy confirmed! ${data.space?.spaceCode} is now ${data.space?.occupancyState}.`
    );
  };

  const handleHostScanDriverQr = async (payload: {
    scannedInput: string;
    expectedFacilityId?: string;
    arrivalMinutesLate?: number;
  }) => {
    const res = await apiFetch('/api/host/scanner/verify-entry', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast('error', data.error || 'Host gate scan verification failed');
      return { ok: false, error: data.error as string };
    }
    if (data.snapshot) setSnapshot(data.snapshot);
    showToast(
      'success',
      `Gate scan verified! ${data.booking?.id} (${data.booking?.vehiclePlate || data.booking?.vehicleLabel}) checked in -> bay OCCUPIED.`
    );
    return { ok: true };
  };

  // =========================================================================
  // PROVIDER HANDLERS
  // =========================================================================

  const handleRegisterProvider = async (payload: {
    name: string;
    contactName: string;
    contactEmail: string;
    contactPhone: string;
    organizationName: string;
    registrationNumber?: string;
    providerType: DetailedProviderType;
  }): Promise<ProviderRecord | null> => {
    const res = await apiFetch('/api/providers/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast('error', data.error || 'Registration failed');
      return null;
    }
    setSnapshot(data.snapshot);
    if (firebaseUser && data.provider) {
      void saveProviderToFirestore(firebaseUser.uid, data.provider).catch(console.error);
    }
    showToast(
      'success',
      `Provider ${data.provider.organizationName} registered (${data.provider.verificationStatus}).`
    );
    return data.provider;
  };

  const handleUploadEvidence = async (
    providerId: string,
    payload: { docType: string; fileName: string; contentText: string }
  ) => {
    const res = await apiFetch(`/api/providers/${providerId}/evidence`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast('error', data.error || 'Evidence upload failed');
      return;
    }
    setSnapshot(data.snapshot);
    showToast(
      'success',
      `Document stored privately. Status is now ${data.provider.verificationStatus}.`
    );
  };

  const handleAddFacility = async (payload: NewFacilityPayload) => {
    const res = await apiFetch('/api/facilities', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast('error', data.error || 'Could not submit space');
      return;
    }
    setSnapshot(data.snapshot);
    showToast(
      'success',
      `${data.facility.name} submitted as pending_approval for Admin operational check.`
    );
  };

  const handleUpdateSpacePricing = async (
    spaceId: string,
    payload: { hourlyPriceInr: number; hardDepartureMin: number; restrictions: string[] }
  ) => {
    const res = await apiFetch(`/api/spaces/${spaceId}/pricing`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast('error', data.error || 'Pricing update failed');
      return;
    }
    setSnapshot(data.snapshot);
    showToast('success', `Pricing & rules updated for ${data.space.spaceCode}.`);
  };

  const handleAddOwnerBlock = async (
    spaceId: string,
    payload: { startMin: number; endMin: number; label: string }
  ) => {
    const res = await apiFetch(`/api/spaces/${spaceId}/owner-blocks`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast('error', data.error || 'Owner block failed');
      return;
    }
    setSnapshot(data.snapshot);
    if (data.protectedBookings?.length > 0) {
      showToast(
        'error',
        `Owner block saved; ${data.protectedBookings.length} confirmed booking(s) protected & flagged for review.`
      );
    } else {
      showToast('success', 'Owner-use block added to availability calendar.');
    }
  };

  const handleWithdrawAvailability = async (
    spaceId: string,
    payload: { startMin: number; endMin: number; reason: string }
  ) => {
    const res = await apiFetch(`/api/spaces/${spaceId}/withdraw`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast('error', data.error || 'Withdrawal failed');
      return;
    }
    setSnapshot(data.snapshot);
    showToast(
      'success',
      `Window withdrawn. ${data.affectedBookings?.length || 0} affected driver(s) notified with rebook/refund options.`
    );
  };

  const handleDecideExtension = async (
    bookingId: string,
    requestId: string,
    decision: 'approve' | 'reject'
  ) => {
    const res = await apiFetch(`/api/bookings/${bookingId}/extensions/${requestId}/decide`, {
      method: 'POST',
      body: JSON.stringify({ decision }),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast('error', data.error || 'Extension decision blocked');
      return;
    }
    setSnapshot(data.snapshot);
    showToast(
      'success',
      `Extension request ${decision === 'approve' ? 'approved transactionally' : 'declined'}.`
    );
  };

  // =========================================================================
  // ADMIN HANDLERS
  // =========================================================================

  const handleAdminVerifyProvider = async (
    providerId: string,
    payload: {
      decision: ProviderVerificationStatus;
      evidenceRefs: string[];
      reviewerId: string;
      reason: string;
      expiresAt?: string;
    }
  ) => {
    const res = await apiFetch(`/admin/providers/${providerId}/verification`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast('error', data.error || 'Verification update failed');
      return;
    }
    setSnapshot(data.snapshot);
    showToast(
      'success',
      `Provider ${data.provider.organizationName} set to ${data.provider.verificationStatus}.`
    );
  };

  const handleAdminIssueDocLink = async (docId: string) => {
    const linkRes = await apiFetch(`/api/admin/documents/${docId}/access-link`, {
      method: 'POST',
    });
    const linkData = await linkRes.json();
    if (!linkRes.ok) {
      showToast('error', linkData.error || 'Could not issue document access link');
      return null;
    }
    const viewRes = await fetch(linkData.signedUrl);
    const viewData = await viewRes.json();
    if (!viewRes.ok) {
      showToast('error', viewData.error || 'Could not open signed document');
      return null;
    }
    return {
      docId: linkData.docId,
      expiresAt: linkData.expiresAt,
      signedUrl: linkData.signedUrl,
      content: {
        fileName: viewData.fileName,
        providerName: viewData.providerName,
        docType: viewData.docType,
        uploadedAt: viewData.uploadedAt,
        contentText: viewData.contentText,
        accessedBy: viewData.accessedBy,
      },
    };
  };

  const handleAdminOperationalCheck = async (
    facilityId: string,
    payload: {
      checks: Partial<OperationalCheckRecord>;
      notes?: string;
      propertyEligibleForUse: boolean;
    }
  ) => {
    const res = await apiFetch(`/api/admin/facilities/${facilityId}/operational-check`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast('error', data.error || 'Operational check save failed');
      return;
    }
    setSnapshot(data.snapshot);
    showToast(
      'success',
      `${data.facility.name} ops check: ${
        data.facility.operationalChecksPassed ? 'PASSED' : 'INCOMPLETE'
      }.`
    );
  };

  const handleAdminApproveSpace = async (spaceId: string) => {
    const res = await apiFetch(`/admin/spaces/${spaceId}/approve`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) {
      showToast('error', data.error || 'Space publication blocked by prerequisites');
      return { ok: false, error: data.error, checks: data.checks || [] };
    }
    setSnapshot(data.snapshot);
    showToast('success', `${data.space.spaceCode} approved & now publicly discoverable!`);
    return { ok: true, checks: data.checks || [] };
  };

  const handleAdminPeriodicReview = async () => {
    const res = await apiFetch('/api/admin/periodic-review', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) {
      showToast('error', data.error || 'Periodic sweep failed');
      return;
    }
    setSnapshot(data.snapshot);
    showToast(
      'success',
      `Periodic sweep completed: ${data.expiredCount} expired, ${data.flaggedCount} flagged.`
    );
  };

  const handleAdminResolveDispute = async (
    disputeId: string,
    decision: 'refunded' | 'dismissed',
    adminNote: string
  ) => {
    const res = await apiFetch(`/api/admin/disputes/${disputeId}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ decision, adminNote }),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast('error', data.error || 'Dispute resolution failed');
      return;
    }
    setSnapshot(data.snapshot);
    showToast('success', `Dispute ${disputeId} marked ${decision}.`);
  };

  const handleAdminSettlePayout = async (settlementId: string) => {
    const res = await apiFetch(`/api/admin/settlements/${settlementId}/settle`, {
      method: 'POST',
    });
    const data = await res.json();
    if (!res.ok) {
      showToast('error', data.error || 'Settlement failed');
      return;
    }
    setSnapshot(data.snapshot);
    showToast('success', `Settlement ${settlementId} completed (${data.settlement.utrRef}).`);
  };

  const handleAdminUpdateIncident = async (
    incidentId: string,
    status: IncidentRecord['status'],
    resolutionNote: string
  ) => {
    const res = await apiFetch(`/api/admin/incidents/${incidentId}`, {
      method: 'POST',
      body: JSON.stringify({ status, resolutionNote }),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast('error', data.error || 'Incident update failed');
      return;
    }
    setSnapshot(data.snapshot);
    showToast('success', `Incident ${incidentId} updated (${status}).`);
  };

  const handleAdminModerateReport = async (
    reportId: string,
    status: UserReportRecord['status'],
    moderatorNote: string
  ) => {
    const res = await apiFetch(`/api/admin/reports/${reportId}`, {
      method: 'POST',
      body: JSON.stringify({ status, moderatorNote }),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast('error', data.error || 'Report moderation failed');
      return;
    }
    setSnapshot(data.snapshot);
    showToast('success', `User report ${reportId} updated (${status}).`);
  };

  if (!authReady) {
    return (
      <div className="relative flex min-h-screen items-center justify-center bg-[#F8F7F4] text-[#111827]">
        <LiveMobilityBackground />
        <div className="relative z-10 rounded-2xl border border-black/[0.08] bg-white/90 px-6 py-4 text-sm font-semibold shadow-lg backdrop-blur-md">
          Verifying authentication state...
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <LoginPortal
        pendingFirebaseUser={firebaseUser}
        isAdminEligible={isAdminEligible}
        onAuthComplete={handleAuthComplete}
      />
    );
  }

  const navItems: Array<{
    id: AppTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }> =
    user.role === 'host'
      ? [
          { id: 'provider-onboarding', label: 'Onboarding', icon: ShieldCheck },
          { id: 'provider-facilities', label: 'Facilities & Calendar', icon: Calendar },
          { id: 'provider-bookings', label: 'Bookings & Extensions', icon: Building2 },
          { id: 'provider-settlements', label: 'Settlements & Incidents', icon: IndianRupee },
        ]
      : user.role === 'admin'
      ? [
          { id: 'admin-providers', label: 'Providers & Docs', icon: ShieldCheck },
          { id: 'admin-spaces', label: 'Space Approvals', icon: FileCheck2 },
          { id: 'admin-payments', label: 'Payments & Refunds', icon: CreditCard },
          { id: 'admin-ops', label: 'Ops & Analytics', icon: Activity },
        ]
      : [
          { id: 'find', label: 'Find Parking', icon: MapPin },
          { id: 'dashboard', label: 'Booking History', icon: LayoutDashboard },
          { id: 'support', label: 'Support', icon: LifeBuoy },
          { id: 'guidelines', label: 'Guidelines', icon: BookOpen },
          { id: 'profile', label: 'My Profile', icon: UserCheck },
        ];

  const activeAccentClass =
    user.role === 'host'
      ? 'bg-emerald-50 text-[#047857]'
      : user.role === 'admin'
      ? 'bg-indigo-50 text-[#4338CA]'
      : 'bg-[#FFF0EA] text-[#C83709]';

  const roleHomeTab: AppTab =
    user.role === 'host'
      ? 'provider-onboarding'
      : user.role === 'admin'
      ? 'admin-providers'
      : 'find';

  const providerSubTab: 'onboarding' | 'facilities' | 'bookings' | 'settlements' =
    activeTab === 'provider-facilities'
      ? 'facilities'
      : activeTab === 'provider-bookings'
      ? 'bookings'
      : activeTab === 'provider-settlements'
      ? 'settlements'
      : 'onboarding';

  const adminSubTab: AdminSubTab =
    activeTab === 'admin-spaces'
      ? 'spaces'
      : activeTab === 'admin-payments'
      ? 'payments'
      : activeTab === 'admin-ops'
      ? 'ops'
      : 'providers';

  return (
    <div className="relative min-h-screen text-[#111827]">
      <LiveMobilityBackground />

      <header className="sticky top-0 z-30 border-b border-black/[0.07] bg-white/85 backdrop-blur-xl">
        <div className="h-1 w-full bg-gradient-to-r from-[#FF5A1F] via-[#F59E0B] to-[#059669]" />
        <div className="mx-auto flex h-16 max-w-[1360px] items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-8">
            <button
              type="button"
              onClick={() => setActiveTab(roleHomeTab)}
              className="flex items-center gap-2.5 text-left shrink-0"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#F04E18] to-[#C83709] font-display text-lg font-extrabold text-white shadow-sm">
                P
              </div>
              <span className="font-display text-lg font-extrabold tracking-tight text-[#111827] whitespace-nowrap">
                ParkPool <span className="text-[#C83709]">AI</span>
              </span>
            </button>

            <nav className="hidden items-center gap-1 md:flex" aria-label="Role Navigation">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveTab(item.id)}
                    className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                      active
                        ? activeAccentClass
                        : 'text-[#4B5563] hover:bg-black/[0.04] hover:text-[#111827]'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {user.role === 'driver' && (
              <button
                type="button"
                onClick={() => setAssistantOpen(true)}
                className="flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-xl bg-gradient-to-r from-[#4338CA] to-[#3730A3] px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition-all hover:brightness-110"
              >
                <Bot className="h-4 w-4 text-white" />
                <span>AI Assistant</span>
              </button>
            )}

            <div className="hidden items-center gap-2.5 border-l border-black/[0.08] pl-3 sm:flex">
              <div className="text-right">
                <div className="text-xs font-bold text-[#111827]">{user.name}</div>
                <div className="text-[10px] font-semibold uppercase tracking-wide text-[#047857]">
                  {user.role === 'host' ? 'Provider' : user.role}
                </div>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                title="Sign Out"
                className="rounded-lg border border-black/[0.08] bg-white p-2 text-[#4B5563] transition-colors hover:border-rose-300 hover:text-rose-600"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => setMobileMenuOpen((p) => !p)}
              aria-label="Toggle menu"
              className="rounded-lg border border-black/[0.08] bg-white p-2 text-[#111827] md:hidden"
            >
              {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="border-t border-black/[0.06] bg-white/95 px-4 py-3 md:hidden">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-semibold ${
                      active ? 'bg-[#111827] text-white' : 'bg-[#F3F2EE] text-[#111827]'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
            <div className="mt-2 flex items-center justify-between border-t border-black/[0.06] pt-2 text-xs text-[#4B5563]">
              <span>
                {user.name} ({user.role === 'host' ? 'Provider' : user.role})
              </span>
              <button
                type="button"
                onClick={handleLogout}
                className="font-semibold text-[#C83709]"
              >
                Sign Out
              </button>
            </div>
          </div>
        )}
      </header>

      {toast && (
        <div className="mx-auto mt-4 max-w-[1360px] px-4 sm:px-6">
          <div
            role="status"
            className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-xs font-medium shadow-sm backdrop-blur-md ${
              toast.type === 'success'
                ? 'border-emerald-200 bg-emerald-50/95 text-emerald-900'
                : 'border-rose-200 bg-rose-50/95 text-rose-900'
            }`}
          >
            <div className="flex items-center gap-2">
              {toast.type === 'success' ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-[#047857]" />
              ) : (
                <ShieldAlert className="h-4 w-4 shrink-0 text-rose-600" />
              )}
              <span>{toast.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="font-semibold text-[#4B5563] hover:text-[#111827]"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-[1360px] p-4 sm:p-6">
        {!snapshot ? (
          <div className="space-y-4">
            <div className="h-28 animate-pulse rounded-2xl bg-white/80" />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="h-96 animate-pulse rounded-2xl bg-white/80" />
              <div className="h-96 animate-pulse rounded-2xl bg-white/80" />
            </div>
          </div>
        ) : (
          <>
            {/* DRIVER INTERFACE */}
            {user.role === 'driver' && activeTab === 'find' && (
              <FindParkingView
                user={user}
                locations={snapshot.locations}
                facilities={snapshot.facilities}
                spaces={snapshot.spaces}
                bookings={snapshot.bookings}
                vehicles={snapshot.vehicles}
                selectedVehicleId={selectedVehicleId}
                driverProfile={currentDriverProfile}
                wallet={currentWallet}
                onSelectVehicle={setSelectedVehicleId}
                onSelectLocation={handleSelectLocation}
                onSaveProfile={handleSaveDriverProfile}
                onCreateHold={handleCreateHold}
                onCompleteInstantPayment={handleCompleteInstantPayment}
                onPayWithWallet={handlePayWithWallet}
                onTopUpWallet={handleTopUpWallet}
                onNavigateDashboard={() => setActiveTab('dashboard')}
              />
            )}

            {user.role === 'driver' && activeTab === 'dashboard' && (
              <DashboardView
                user={user}
                bookings={(() => {
                  const existingIds = new Set(snapshot.bookings.map((b) => b.id));
                  const extra = firestoreBookings
                    .filter((fb) => !existingIds.has(fb.id))
                    .map((fb) => ({
                      id: fb.id,
                      spaceId: fb.spaceId,
                      facilityId: fb.facilityId,
                      facilityName: fb.facilityName,
                      spaceCode: fb.spaceCode,
                      driverName: user.name,
                      driverEmail: fb.driverEmail || user.email,
                      vehicleId: selectedVehicleId,
                      vehicleLabel: currentDriverProfile?.vehicleModel || 'Registered Vehicle',
                      vehiclePlate: currentDriverProfile?.plateNumber,
                      startMin: fb.startMin,
                      endMin: fb.endMin,
                      bufferMinutes: 15,
                      status: fb.status,
                      baseAmountInr: fb.totalAmountInr,
                      platformFeeInr: 0,
                      gstInr: 0,
                      totalAmountInr: fb.totalAmountInr,
                      accessCode: 'PKP-SYNC',
                      entranceLabel: 'Main Facility Gate',
                      createdAt: new Date().toISOString(),
                      lateArrivalPolicy: {
                        graceMinutes: 15,
                        forfeitAfterMinutes: 40,
                        summary: '15 min arrival grace policy.',
                      },
                      extensionRequests: [],
                      paymentStatus:
                        fb.paymentStatus === 'pending_order'
                          ? ('pending' as const)
                          : fb.paymentStatus,
                      refundStatus:
                        fb.paymentStatus === 'refunded' ? ('refunded' as const) : ('none' as const),
                      auditTrail: ['Synced from your Cloud Firestore bookings record'],
                    }));
                  return [...snapshot.bookings, ...extra];
                })()}
                facilities={snapshot.facilities}
                spaces={snapshot.spaces}
                locations={snapshot.locations}
                paymentOrders={snapshot.paymentOrders}
                refunds={snapshot.refunds}
                disputes={snapshot.disputes}
                notifications={snapshot.notifications}
                driverProfile={currentDriverProfile}
                wallet={currentWallet}
                lifecycleEvents={snapshot.lifecycleEvents}
                onCreatePaymentOrder={handleCreatePaymentOrder}
                onDispatchGatewayWebhook={handleDispatchGatewayWebhook}
                onBookingAction={handleBookingAction}
                onResolveOverstayImpact={handleResolveOverstayImpact}
                onRequestExtension={handleRequestExtension}
                onResolveWithdrawal={handleResolveWithdrawal}
                onSubmitReview={handleSubmitReview}
                onRaiseDispute={handleRaiseDispute}
                onMarkNotificationRead={handleMarkNotificationRead}
                onTopUpWallet={handleTopUpWallet}
                onPayWithWallet={handlePayWithWallet}
                onRunLifecycleCheck={handleRunLifecycleCheck}
                onRespondExtensionOffer={handleRespondExtensionOffer}
                onSendDepartureSignal={handleSendDepartureSignal}
                onConfirmDeparture={handleConfirmDeparture}
                onCompleteClearance={handleCompleteClearance}
                onFindParking={() => setActiveTab('find')}
                onOpenProfile={() => setActiveTab('profile')}
              />
            )}

            {user.role === 'driver' && activeTab === 'support' && (
              <DriverSupportView
                bookings={snapshot.bookings}
                incidents={snapshot.incidents}
                disputes={snapshot.disputes}
                transactions={snapshot.transactions}
                onSubmitIncident={handleSubmitIncident}
                onRaiseDispute={handleRaiseDispute}
                onSubmitUserReport={handleSubmitUserReport}
              />
            )}

            {user.role === 'driver' && activeTab === 'guidelines' && <DriverGuidelinesView />}

            {user.role === 'driver' && activeTab === 'profile' && (
              <DriverProfileView
                user={user}
                existingProfile={currentDriverProfile}
                onSaveProfile={handleSaveDriverProfile}
                onFindParking={() => setActiveTab('find')}
              />
            )}

            {/* PROVIDER INTERFACE */}
            {user.role === 'host' && (
              <ProviderPortalView
                user={user}
                subTab={providerSubTab}
                onChangeSubTab={(t) => setActiveTab(`provider-${t}` as AppTab)}
                locations={snapshot.locations}
                providers={snapshot.providers}
                evidenceChecklists={snapshot.evidenceChecklists}
                facilities={snapshot.facilities}
                spaces={snapshot.spaces}
                bookings={snapshot.bookings}
                settlements={snapshot.settlements}
                incidents={snapshot.incidents}
                lifecycleEvents={snapshot.lifecycleEvents}
                onRegisterProvider={handleRegisterProvider}
                onUploadEvidence={handleUploadEvidence}
                onAddFacility={handleAddFacility}
                onUpdateSpacePricing={handleUpdateSpacePricing}
                onAddOwnerBlock={handleAddOwnerBlock}
                onWithdrawAvailability={handleWithdrawAvailability}
                onDecideExtension={handleDecideExtension}
                onReportOverstay={handleReportOverstay}
                onHostScanDriverQr={handleHostScanDriverQr}
                onRunLifecycleCheck={handleRunLifecycleCheck}
                onConfirmDeparture={handleConfirmDeparture}
                onCompleteClearance={handleCompleteClearance}
                onSubmitIncident={handleSubmitIncident}
              />
            )}

            {/* ADMIN INTERFACE */}
            {user.role === 'admin' && (
              <AdminPortalView
                user={user}
                subTab={adminSubTab}
                onChangeSubTab={(t) => setActiveTab(`admin-${t}` as AppTab)}
                providers={snapshot.providers}
                facilities={snapshot.facilities}
                spaces={snapshot.spaces}
                bookings={snapshot.bookings}
                paymentOrders={snapshot.paymentOrders}
                webhookEvents={snapshot.webhookEvents}
                refunds={snapshot.refunds}
                settlements={snapshot.settlements}
                disputes={snapshot.disputes}
                incidents={snapshot.incidents}
                userReports={snapshot.userReports}
                wallets={snapshot.wallets}
                lifecycleEvents={snapshot.lifecycleEvents}
                analytics={snapshot.analytics}
                auditLogs={snapshot.auditLogs}
                onAdminVerifyProvider={handleAdminVerifyProvider}
                onAdminIssueDocLink={handleAdminIssueDocLink}
                onAdminOperationalCheck={handleAdminOperationalCheck}
                onAdminApproveSpace={handleAdminApproveSpace}
                onAdminPeriodicReview={handleAdminPeriodicReview}
                onAdminResolveDispute={handleAdminResolveDispute}
                onAdminSettlePayout={handleAdminSettlePayout}
                onAdminUpdateIncident={handleAdminUpdateIncident}
                onAdminModerateReport={handleAdminModerateReport}
              />
            )}
          </>
        )}
      </main>

      {snapshot && user.role === 'driver' && (
        <AiAssistantDrawer
          open={assistantOpen}
          onClose={() => setAssistantOpen(false)}
          vehicles={snapshot.vehicles}
          selectedVehicleId={selectedVehicleId}
          onCreateHold={async (params) => {
            await handleCreateHold(params);
          }}
          onNavigateDashboard={() => setActiveTab('dashboard')}
        />
      )}
    </div>
  );
}
