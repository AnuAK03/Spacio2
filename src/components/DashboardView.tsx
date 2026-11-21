import React, { useState } from 'react';
import {
  AlertTriangle,
  Bell,
  CalendarClock,
  CheckCircle2,
  Clock,
  CreditCard,
  FileText,
  IndianRupee,
  MapPin,
  Navigation,
  QrCode,
  RefreshCw,
  ScanLine,
  ShieldCheck,
  Star,
  X,
} from 'lucide-react';
import { QrCheckinScannerModal } from './QrCheckinScannerModal';
import {
  BookingRecord,
  DisputeRecord,
  DriverNotification,
  DriverProfile,
  ExtensionAlternative,
  Facility,
  IncidentRecord,
  PaymentOrder,
  RefundRecord,
  TransactionHistoryItem,
  UserSession,
} from '../types/parkpool';

interface DashboardViewProps {
  user: UserSession;
  bookings: BookingRecord[];
  facilities: Facility[];
  paymentOrders: PaymentOrder[];
  refunds: RefundRecord[];
  transactions: TransactionHistoryItem[];
  disputes: DisputeRecord[];
  incidents: IncidentRecord[];
  notifications: DriverNotification[];
  driverProfile?: DriverProfile;
  onCreatePaymentOrder: (bookingId: string) => Promise<PaymentOrder | null>;
  onDispatchGatewayWebhook: (
    orderId: string,
    outcome: 'payment.succeeded' | 'payment.failed',
    customEventId?: string
  ) => Promise<void>;
  onBookingAction: (
    bookingId: string,
    action: 'checkin' | 'checkout' | 'cancel',
    arrivalMinutesLate?: number
  ) => Promise<void>;
  onVerifyQrCheckin: (
    bookingId: string,
    payload: {
      scannedToken: string;
      scanMethod: 'camera' | 'upload' | 'gate_placard' | 'manual_token';
      arrivalMinutesLate: number;
    }
  ) => Promise<{ ok: boolean; error?: string }>;
  onResolveOverstayImpact: (
    bookingId: string,
    choice: 'reschedule' | 'refund_with_credit'
  ) => Promise<void>;
  onRequestExtension: (
    bookingId: string,
    additionalMinutes: number
  ) => Promise<{ ok: boolean; alternatives?: ExtensionAlternative[] }>;
  onResolveWithdrawal: (bookingId: string, choice: 'rebook' | 'refund') => Promise<void>;
  onSubmitReview: (bookingId: string, rating: number, comment: string) => Promise<void>;
  onSubmitIncident: (payload: {
    facilityId?: string;
    bookingId?: string;
    category: IncidentRecord['category'];
    severity: IncidentRecord['severity'];
    description: string;
  }) => Promise<void>;
  onRaiseDispute: (payload: {
    bookingId: string;
    reason: string;
    requestedRefundInr: number;
  }) => Promise<void>;
  onSubmitUserReport: (payload: { reportedEntity: string; reason: string }) => Promise<void>;
  onMarkNotificationRead: (id: string) => Promise<void>;
  onFindParking: () => void;
  onOpenProfile: () => void;
}

function fmt(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  user,
  bookings,
  facilities,
  paymentOrders,
  refunds,
  transactions,
  disputes,
  incidents,
  notifications,
  driverProfile,
  onCreatePaymentOrder,
  onDispatchGatewayWebhook,
  onBookingAction,
  onVerifyQrCheckin,
  onResolveOverstayImpact,
  onRequestExtension,
  onResolveWithdrawal,
  onSubmitReview,
  onSubmitIncident,
  onRaiseDispute,
  onSubmitUserReport,
  onMarkNotificationRead,
  onFindParking,
  onOpenProfile,
}) => {
  const [navBookingId, setNavBookingId] = useState<string | null>(null);
  const [invoiceBookingId, setInvoiceBookingId] = useState<string | null>(null);
  const [qrModalState, setQrModalState] = useState<{
    bookingId: string;
    mode: 'scanner' | 'pass';
  } | null>(null);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [extAlternatives, setExtAlternatives] = useState<
    Record<string, ExtensionAlternative[]>
  >({});
  const [disputeBookingId, setDisputeBookingId] = useState<string | null>(null);
  const [disputeReason, setDisputeReason] = useState('');
  const [disputeAmount, setDisputeAmount] = useState(0);

  // Incident & User Report form state
  const [incCategory, setIncCategory] = useState<IncidentRecord['category']>('access_blocked');
  const [incSeverity, setIncSeverity] = useState<IncidentRecord['severity']>('medium');
  const [incBookingId, setIncBookingId] = useState('');
  const [incDesc, setIncDesc] = useState('');
  const [repTarget, setRepTarget] = useState('');
  const [repReason, setRepReason] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const upcomingCount = bookings.filter(
    (b) =>
      b.status === 'held' ||
      b.status === 'confirmed' ||
      b.status === 'checked-in' ||
      b.status === 'occupied'
  ).length;
  const completedCount = bookings.filter((b) => b.status === 'completed').length;
  const unreadNotifications = notifications.filter((n) => !n.read);

  const firstName = user.name.split(' ')[0];

  const handleCheckoutPay = async (
    bk: BookingRecord,
    outcome: 'payment.succeeded' | 'payment.failed'
  ) => {
    setBusyId(bk.id);
    try {
      let orderId = bk.paymentOrderId;
      if (!orderId) {
        const order = await onCreatePaymentOrder(bk.id);
        orderId = order?.id;
      }
      if (orderId) {
        await onDispatchGatewayWebhook(orderId, outcome);
      }
    } finally {
      setBusyId(null);
    }
  };

  const handleDuplicateWebhookReplay = async (bk: BookingRecord) => {
    if (!bk.paymentOrderId) return;
    setBusyId(bk.id);
    try {
      const firstEventId = `EVT-${bk.paymentOrderId}-OK`;
      await onDispatchGatewayWebhook(bk.paymentOrderId, 'payment.succeeded', firstEventId);
    } finally {
      setBusyId(null);
    }
  };

  const handleExtensionClick = async (bkId: string, mins: number) => {
    setBusyId(bkId);
    try {
      const res = await onRequestExtension(bkId, mins);
      if (!res.ok && res.alternatives && res.alternatives.length > 0) {
        setExtAlternatives((prev) => ({ ...prev, [bkId]: res.alternatives! }));
      } else {
        setExtAlternatives((prev) => {
          const next = { ...prev };
          delete next[bkId];
          return next;
        });
      }
    } finally {
      setBusyId(null);
    }
  };

  const navBooking = bookings.find((b) => b.id === navBookingId);
  const navFacility = navBooking
    ? facilities.find((f) => f.id === navBooking.facilityId)
    : undefined;
  const invoiceBooking = bookings.find((b) => b.id === invoiceBookingId);
  const invoiceOrder = invoiceBooking?.paymentOrderId
    ? paymentOrders.find((o) => o.id === invoiceBooking.paymentOrderId)
    : undefined;
  const qrModalBooking = qrModalState
    ? bookings.find((b) => b.id === qrModalState.bookingId)
    : undefined;
  const qrModalFacility = qrModalBooking
    ? facilities.find((f) => f.id === qrModalBooking.facilityId)
    : undefined;

  return (
    <div className="space-y-6">
      {/* Driver Header & Key Counters */}
      <section className="rounded-2xl border border-black/[0.08] bg-white/92 p-6 shadow-sm backdrop-blur-md">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-[#111827]">
              Hello, {firstName} — Trips & Checkout
            </h1>
            <p className="mt-0.5 text-sm text-[#4B5563]">
              Manage holds, server-verified payments, gate navigation, check-in, extensions, and refunds.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={onOpenProfile}
              className="flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-xl border border-black/[0.08] bg-[#F8F7F4] px-3.5 py-2 text-xs font-semibold text-[#111827] transition-colors hover:border-[#D93F0B]"
            >
              <ShieldCheck className="h-4 w-4 text-[#047857]" />
              <span>
                {driverProfile
                  ? `${driverProfile.plateNumber} · DL ${driverProfile.licenseNumber}`
                  : 'Register License & Vehicle'}
              </span>
            </button>
            <button
              type="button"
              onClick={onFindParking}
              className="whitespace-nowrap shrink-0 rounded-xl bg-gradient-to-r from-[#E0430D] to-[#C83709] px-4 py-2 text-xs font-bold text-white shadow-sm transition-all hover:brightness-110"
            >
              Book Another Spot
            </button>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-[#FED7AA] bg-[#FFF5F0] p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#9A3412]">
              <CalendarClock className="h-4 w-4 text-[#C83709]" />
              <span>Active Holds & Bookings</span>
            </div>
            <div className="mt-1.5 font-mono text-2xl font-bold tabular-nums text-[#C83709]">
              {upcomingCount}
            </div>
          </div>

          <div className="rounded-xl border border-indigo-200/80 bg-indigo-50/75 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#3730A3]">
              <Clock className="h-4 w-4 text-[#4338CA]" />
              <span>Completed Sessions</span>
            </div>
            <div className="mt-1.5 font-mono text-2xl font-bold tabular-nums text-[#4338CA]">
              {completedCount}
            </div>
          </div>

          <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/80 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#065F46]">
              <IndianRupee className="h-4 w-4 text-[#047857]" />
              <span>Refunds & Disputes Tracked</span>
            </div>
            <div className="mt-1.5 font-mono text-2xl font-bold tabular-nums text-[#047857]">
              {refunds.length + disputes.length}
            </div>
          </div>
        </div>
      </section>

      {/* Driver Notifications (Host Withdrawals, Protected Blocks, Extension Decisions) */}
      {unreadNotifications.length > 0 && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50/90 p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2 font-display text-sm font-bold text-amber-950">
            <Bell className="h-4 w-4 text-amber-700" />
            <span>Action & Schedule Updates ({unreadNotifications.length})</span>
          </div>
          <div className="space-y-2.5">
            {unreadNotifications.map((ntf) => (
              <div
                key={ntf.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200/80 bg-white p-3.5 text-xs"
              >
                <div className="space-y-0.5">
                  <div className="font-bold text-[#111827]">{ntf.title}</div>
                  <div className="text-[#4B5563]">{ntf.message}</div>
                </div>
                <button
                  type="button"
                  onClick={() => void onMarkNotificationRead(ntf.id)}
                  className="whitespace-nowrap shrink-0 rounded-lg border border-black/[0.08] px-3 py-1.5 text-xs font-semibold text-[#111827] hover:bg-black/[0.04]"
                >
                  Acknowledge
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Gate Navigation Modal Panel */}
      {navBooking && navFacility && (
        <section className="rounded-2xl border-2 border-[#4338CA] bg-white/95 p-5 shadow-lg backdrop-blur-md">
          <div className="flex items-start justify-between gap-3 border-b border-black/[0.06] pb-3">
            <div>
              <div className="flex items-center gap-2 font-display text-base font-bold text-[#111827]">
                <Navigation className="h-4 w-4 text-[#4338CA]" />
                <span>Gate Navigation · {navBooking.facilityName}</span>
              </div>
              <p className="mt-0.5 text-xs text-[#4B5563]">
                Booking {navBooking.id} · Gate Code{' '}
                <span className="font-mono font-bold text-[#111827]">{navBooking.accessCode}</span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => setNavBookingId(null)}
              className="rounded-lg border border-black/[0.08] p-1.5 text-[#4B5563] hover:text-[#111827]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3 text-xs">
            <div className="rounded-xl bg-[#F8F7F4] p-3.5">
              <div className="font-semibold text-[#4B5563]">Actual Entrance & Coordinates</div>
              <div className="mt-1 font-bold text-[#111827]">{navFacility.entranceLabel}</div>
              <div className="mt-1 font-mono text-[#4338CA]">
                {navFacility.entranceLat.toFixed(4)}, {navFacility.entranceLng.toFixed(4)}
              </div>
            </div>
            <div className="rounded-xl bg-[#F8F7F4] p-3.5">
              <div className="font-semibold text-[#4B5563]">Access Instructions</div>
              <div className="mt-1 text-[#111827]">{navFacility.accessInstructions}</div>
              <div className="mt-1 text-[#047857] font-semibold">{navFacility.accessControl}</div>
            </div>
            <div className="rounded-xl bg-[#F8F7F4] p-3.5">
              <div className="font-semibold text-[#4B5563]">Walk Route & Safety</div>
              <div className="mt-1 font-bold text-[#C83709]">
                {navFacility.walkingDistanceM}m ({navFacility.walkingMinutes} min walk)
              </div>
              <div className="mt-1 text-[#374151]">{navFacility.walkPathSafety}</div>
            </div>
          </div>
        </section>
      )}

      {/* GST Invoice & Payment Receipt Drawer */}
      {invoiceBooking && (
        <section className="rounded-2xl border-2 border-[#047857] bg-white/95 p-5 shadow-lg backdrop-blur-md">
          <div className="flex items-start justify-between gap-3 border-b border-black/[0.06] pb-3">
            <div>
              <div className="flex items-center gap-2 font-display text-base font-bold text-[#111827]">
                <FileText className="h-4 w-4 text-[#047857]" />
                <span>
                  Tax Invoice {invoiceBooking.invoiceNumber || 'PROFORMA'} · {invoiceBooking.id}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-[#4B5563]">
                Server Order {invoiceBooking.paymentOrderId || 'Pending'} · Status:{' '}
                {invoiceBooking.paymentStatus}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setInvoiceBookingId(null)}
              className="rounded-lg border border-black/[0.08] p-1.5 text-[#4B5563] hover:text-[#111827]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 text-xs">
            <div className="space-y-1.5 rounded-xl bg-[#F8F7F4] p-4">
              <div className="flex justify-between">
                <span className="text-[#4B5563]">Parking Base ({fmt(invoiceBooking.startMin)}–{fmt(invoiceBooking.endMin)})</span>
                <span className="font-mono font-semibold text-[#111827]">₹{invoiceBooking.baseAmountInr}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#4B5563]">Platform Convenience Fee</span>
                <span className="font-mono font-semibold text-[#111827]">₹{invoiceBooking.platformFeeInr}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#4B5563]">GST (18%)</span>
                <span className="font-mono font-semibold text-[#111827]">₹{invoiceBooking.gstInr}</span>
              </div>
              <div className="flex justify-between border-t border-black/[0.08] pt-2 text-sm font-bold text-[#111827]">
                <span>Total Billed (Server Verified)</span>
                <span className="font-mono tabular-nums">₹{invoiceBooking.totalAmountInr}</span>
              </div>
              {invoiceOrder && (
                <div className="pt-1 text-[11px] text-[#047857]">
                  Gateway Ref: {invoiceOrder.gatewayOrderRef} · Reconciliation:{' '}
                  {invoiceOrder.reconciliationStatus}
                </div>
              )}
            </div>
            <div className="space-y-1 rounded-xl bg-[#F8F7F4] p-4">
              <div className="font-semibold text-[#111827]">Financial & Booking Audit Trail</div>
              <ul className="mt-1 space-y-1 text-[11px] text-[#374151]">
                {invoiceBooking.auditTrail.map((entry, idx) => (
                  <li key={idx} className="font-mono">
                    {entry}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      )}

      {/* Active & Historical Bookings */}
      <section className="rounded-2xl border border-black/[0.08] bg-white/92 p-6 shadow-sm backdrop-blur-md">
        <h2 className="mb-4 font-display text-lg font-bold text-[#111827]">
          Your Reservations & Checkout Queue
        </h2>

        <div className="space-y-4">
          {bookings.map((bk) => {
            const alts = extAlternatives[bk.id] || [];
            const isBusy = busyId === bk.id;
            return (
              <div
                key={bk.id}
                className="rounded-xl border border-black/[0.08] bg-[#F8F7F4]/90 p-4"
              >
                <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-mono font-bold text-[#111827]">{bk.id}</span>
                      <span aria-hidden="true" className="text-black/20">·</span>
                      <span
                        className={`font-semibold capitalize ${
                          bk.status === 'confirmed' || bk.status === 'completed'
                            ? 'text-[#047857]'
                            : bk.status === 'checked-in' || bk.status === 'occupied'
                            ? 'text-[#4338CA]'
                            : bk.status === 'held'
                            ? 'text-[#C83709]'
                            : 'text-rose-700'
                        }`}
                      >
                        {bk.status}
                      </span>
                      <span aria-hidden="true" className="text-black/20">·</span>
                      <span className="font-mono tabular-nums text-[#374151]">
                        {fmt(bk.startMin)} – {fmt(bk.endMin)}
                      </span>
                      <span aria-hidden="true" className="text-black/20">·</span>
                      <span className="font-mono font-semibold text-[#4338CA]">
                        Gate PIN: {bk.accessCode}
                      </span>
                      <span aria-hidden="true" className="text-black/20">·</span>
                      <span className="text-[#4B5563]">
                        Payment: <strong className="text-[#111827]">{bk.paymentStatus}</strong>
                      </span>
                      {bk.refundStatus && bk.refundStatus !== 'none' && (
                        <>
                          <span aria-hidden="true" className="text-black/20">·</span>
                          <span className="font-semibold text-[#047857]">
                            Refund: {bk.refundStatus}
                            {bk.refundAmountInr ? ` (₹${bk.refundAmountInr})` : ''}
                          </span>
                        </>
                      )}
                    </div>

                    <div className="font-display text-base font-bold text-[#111827]">
                      {bk.facilityName} · {bk.spaceCode}
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-[#374151]">
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5 text-[#C83709]" />
                        {bk.entranceLabel}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {bk.vehicleLabel}
                        {bk.vehiclePlate ? ` · ${bk.vehiclePlate}` : ''}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono font-bold text-[#111827]">
                        ₹{bk.totalAmountInr}
                      </span>
                      {bk.arrivalStatus && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-semibold text-[#4338CA]">
                            Arrival: {bk.arrivalStatus.replace('_', ' ')}
                          </span>
                        </>
                      )}
                    </div>

                    <div className="text-[11px] text-[#4B5563]">
                      Late-arrival policy: {bk.lateArrivalPolicy.summary}
                    </div>

                    {bk.qrVerifiedAt && (
                      <div className="text-[11px] font-semibold text-[#047857]">
                        QR Presence Verified at {new Date(bk.qrVerifiedAt).toLocaleTimeString()} ({bk.qrScanMethod || 'gate_placard'})
                      </div>
                    )}

                    {bk.overstayStatus === 'flagged_overstay' && (
                      <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900">
                        <strong>Overstay Surcharge Active (+{bk.overstayMinutes}m):</strong> ₹{bk.overstayPenaltyInr} billed to protect the downstream booking. Please check out immediately.
                      </div>
                    )}

                    {bk.overstayResolution && (
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-xs text-emerald-950">
                        <span>
                          <strong>Zero-Loss Overstay Protection:</strong> {bk.overstayResolution.detail}
                        </span>
                        {bk.overstayResolution.status === 'choice_required' && (
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => void onResolveOverstayImpact(bk.id, 'reschedule')}
                              className="rounded-lg bg-[#047857] px-2.5 py-1 font-bold text-white"
                            >
                              Reschedule (₹0 Fee)
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                void onResolveOverstayImpact(bk.id, 'refund_with_credit')
                              }
                              className="rounded-lg border border-emerald-400 bg-white px-2.5 py-1 font-bold text-[#047857]"
                            >
                              100% Refund + ₹50 Credit
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {bk.hostExceptionFlagged && (
                      <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs text-indigo-900">
                        Host added an owner block near this slot — your confirmed reservation remains protected under ops review.
                      </div>
                    )}

                    {bk.withdrawalResolution && (
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-950">
                        <span>
                          <strong>Host Withdrew Future Slot:</strong>{' '}
                          {bk.withdrawalResolution.status === 'affected'
                            ? 'Select resolution:'
                            : bk.withdrawalResolution.resolvedOption}
                        </span>
                        {bk.withdrawalResolution.status === 'affected' && (
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => void onResolveWithdrawal(bk.id, 'rebook')}
                              className="rounded-lg bg-[#047857] px-2.5 py-1 font-bold text-white"
                            >
                              Rebook Nearby
                            </button>
                            <button
                              type="button"
                              onClick={() => void onResolveWithdrawal(bk.id, 'refund')}
                              className="rounded-lg border border-rose-300 bg-white px-2.5 py-1 font-bold text-rose-700"
                            >
                              100% Refund
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Extension Request Status List */}
                    {bk.extensionRequests.length > 0 && (
                      <div className="space-y-1 pt-1">
                        {bk.extensionRequests.map((ext) => (
                          <div
                            key={ext.id}
                            className="rounded-lg border border-black/[0.06] bg-white px-3 py-1.5 text-[11px] text-[#374151]"
                          >
                            Extension to <strong className="font-mono">{fmt(ext.requestedEndMin)}</strong> (+₹
                            {ext.additionalTotalInr}):{' '}
                            <strong
                              className={
                                ext.status === 'approved'
                                  ? 'text-[#047857]'
                                  : ext.status === 'rejected'
                                  ? 'text-rose-700'
                                  : 'text-[#C83709]'
                              }
                            >
                              {ext.status.replace(/_/g, ' ')}
                            </strong>{' '}
                            · {ext.reason}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Alternative spaces returned if extension conflicted */}
                    {alts.length > 0 && (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[11px] text-amber-950">
                        <div className="font-bold">Alternative Bays Available Nearby:</div>
                        <div className="mt-1 flex flex-wrap gap-2">
                          {alts.map((a) => (
                            <span key={a.spaceId} className="font-mono">
                              {a.facilityName} ({a.spaceCode}) · ₹{a.hourlyPriceInr}/hr · {a.walkingDistanceM}m
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Right Action Controls */}
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {bk.status === 'held' && (
                      <>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleCheckoutPay(bk, 'payment.succeeded')}
                          className="flex items-center gap-1 whitespace-nowrap shrink-0 rounded-lg bg-gradient-to-r from-[#E0430D] to-[#C83709] px-3.5 py-2 text-xs font-bold text-white transition-all hover:brightness-110 disabled:opacity-50"
                        >
                          <CreditCard className="h-3.5 w-3.5" />
                          <span>Pay ₹{bk.totalAmountInr} (Server Order)</span>
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleCheckoutPay(bk, 'payment.failed')}
                          className="whitespace-nowrap shrink-0 rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-50"
                        >
                          Test Fail Release
                        </button>
                      </>
                    )}

                    {bk.status === 'confirmed' && (
                      <button
                        type="button"
                        onClick={() => setQrModalState({ bookingId: bk.id, mode: 'scanner' })}
                        className="flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg bg-[#111827] px-3.5 py-2 text-xs font-bold text-white hover:bg-black"
                      >
                        <ScanLine className="h-3.5 w-3.5 text-emerald-400" />
                        <span>Scan QR to Check In</span>
                      </button>
                    )}

                    {(bk.status === 'confirmed' ||
                      bk.status === 'checked-in' ||
                      bk.status === 'occupied') && (
                      <>
                        <button
                          type="button"
                          onClick={() => setQrModalState({ bookingId: bk.id, mode: 'pass' })}
                          className="flex items-center gap-1 whitespace-nowrap shrink-0 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs font-semibold text-[#047857] hover:bg-emerald-50"
                        >
                          <QrCode className="h-3.5 w-3.5" />
                          <span>Rider QR Pass</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setNavBookingId(bk.id)}
                          className="flex items-center gap-1 whitespace-nowrap shrink-0 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs font-semibold text-[#4338CA] hover:bg-indigo-50"
                        >
                          <Navigation className="h-3.5 w-3.5" />
                          <span>Navigate</span>
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleExtensionClick(bk.id, 30)}
                          className="whitespace-nowrap shrink-0 rounded-lg border border-black/[0.1] bg-white px-3 py-2 text-xs font-semibold text-[#111827] hover:bg-black/[0.03]"
                        >
                          Request +30m
                        </button>
                        <button
                          type="button"
                          onClick={() => void onBookingAction(bk.id, 'checkout')}
                          className="whitespace-nowrap shrink-0 rounded-lg bg-[#047857] px-3.5 py-2 text-xs font-bold text-white hover:bg-[#065F46]"
                        >
                          Check Out
                        </button>
                      </>
                    )}

                    {bk.paymentOrderId && bk.paymentStatus === 'paid' && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleDuplicateWebhookReplay(bk)}
                        title="Send same gateway webhook eventId again to verify idempotency"
                        className="flex items-center gap-1 whitespace-nowrap shrink-0 rounded-lg border border-black/[0.08] bg-white px-2.5 py-2 text-xs font-medium text-[#4B5563] hover:text-[#111827]"
                      >
                        <RefreshCw className="h-3 w-3" />
                        <span>Replay Webhook</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() =>
                        setInvoiceBookingId(invoiceBookingId === bk.id ? null : bk.id)
                      }
                      className="flex items-center gap-1 whitespace-nowrap shrink-0 rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-xs font-semibold text-[#111827] hover:bg-black/[0.03]"
                    >
                      <FileText className="h-3.5 w-3.5 text-[#047857]" />
                      <span>Invoice</span>
                    </button>

                    {bk.status === 'completed' && (
                      <button
                        type="button"
                        onClick={() => setReviewingId(reviewingId === bk.id ? null : bk.id)}
                        className="flex items-center gap-1 whitespace-nowrap shrink-0 rounded-lg border border-black/[0.1] bg-white px-3 py-2 text-xs font-semibold text-[#111827] hover:border-[#D93F0B]"
                      >
                        <Star className="h-3.5 w-3.5 text-amber-400" />
                        <span>Review</span>
                      </button>
                    )}

                    {bk.paymentStatus === 'paid' && bk.refundStatus !== 'refunded' && (
                      <button
                        type="button"
                        onClick={() => {
                          setDisputeBookingId(disputeBookingId === bk.id ? null : bk.id);
                          setDisputeAmount(bk.totalAmountInr);
                        }}
                        className="whitespace-nowrap shrink-0 rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-xs font-semibold text-[#4B5563] hover:text-[#111827]"
                      >
                        Dispute
                      </button>
                    )}

                    {bk.status !== 'completed' &&
                      bk.status !== 'cancelled' &&
                      bk.status !== 'expired' && (
                        <button
                          type="button"
                          onClick={() => void onBookingAction(bk.id, 'cancel')}
                          className="whitespace-nowrap shrink-0 rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                        >
                          Cancel
                        </button>
                      )}
                  </div>
                </div>

                {/* Inline Review Box */}
                {reviewingId === bk.id && (
                  <div className="mt-3 flex flex-col gap-2.5 border-t border-black/[0.06] pt-3 sm:flex-row sm:items-center sm:gap-3">
                    <select
                      value={rating}
                      onChange={(e) => setRating(Number(e.target.value))}
                      className="rounded-lg border border-black/[0.1] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#111827]"
                    >
                      {[5, 4, 3, 2, 1].map((n) => (
                        <option key={n} value={n}>
                          {n} Stars
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder="Share how gate entry and parking went..."
                      className="w-full flex-1 rounded-lg border border-black/[0.1] bg-white px-3 py-1.5 text-xs text-[#111827]"
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        await onSubmitReview(bk.id, rating, comment);
                        setReviewingId(null);
                        setComment('');
                      }}
                      className="flex items-center justify-center gap-1 rounded-lg bg-gradient-to-r from-[#E0430D] to-[#C83709] px-3 py-1.5 text-xs font-bold text-white hover:brightness-110"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      <span>Submit</span>
                    </button>
                  </div>
                )}

                {/* Inline Refund Dispute Box */}
                {disputeBookingId === bk.id && (
                  <div className="mt-3 flex flex-col gap-2.5 border-t border-black/[0.06] pt-3 sm:flex-row sm:items-center sm:gap-3">
                    <input
                      type="number"
                      min={10}
                      max={bk.totalAmountInr}
                      value={disputeAmount}
                      onChange={(e) => setDisputeAmount(Number(e.target.value))}
                      className="w-28 rounded-lg border border-black/[0.1] bg-white px-2.5 py-1.5 font-mono text-xs text-[#111827]"
                    />
                    <input
                      type="text"
                      value={disputeReason}
                      onChange={(e) => setDisputeReason(e.target.value)}
                      placeholder="Describe gate access or billing issue for refund review..."
                      className="w-full flex-1 rounded-lg border border-black/[0.1] bg-white px-3 py-1.5 text-xs text-[#111827]"
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        if (!disputeReason.trim()) return;
                        await onRaiseDispute({
                          bookingId: bk.id,
                          reason: disputeReason,
                          requestedRefundInr: disputeAmount,
                        });
                        setDisputeBookingId(null);
                        setDisputeReason('');
                      }}
                      className="whitespace-nowrap shrink-0 rounded-lg bg-[#4338CA] px-3.5 py-1.5 text-xs font-bold text-white"
                    >
                      Raise Dispute
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Driver Incident Reporting, User Moderation Reports & Transaction History */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <section className="rounded-2xl border border-black/[0.08] bg-white/92 p-6 shadow-sm backdrop-blur-md lg:col-span-6">
          <div className="flex items-center gap-2 font-display text-lg font-bold text-[#111827]">
            <AlertTriangle className="h-4 w-4 text-[#C83709]" />
            <span>Report Incident or Safety Issue</span>
          </div>
          <p className="mt-0.5 text-xs text-[#4B5563]">
            Blocked entrance, unauthorized clamping, or payment discrepancy. For emergencies in India, dial 112.
          </p>

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!incDesc.trim()) return;
              await onSubmitIncident({
                bookingId: incBookingId || undefined,
                category: incCategory,
                severity: incSeverity,
                description: incDesc,
              });
              setIncDesc('');
            }}
            className="mt-4 space-y-3"
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <select
                value={incCategory}
                onChange={(e) => setIncCategory(e.target.value as IncidentRecord['category'])}
                className="rounded-xl border border-black/[0.1] bg-[#F8F7F4] px-3 py-2 text-xs font-medium text-[#111827]"
              >
                <option value="access_blocked">Access Blocked</option>
                <option value="unauthorized_towing">Unauthorized Towing/Clamp</option>
                <option value="safety_hazard">Safety / Lighting Hazard</option>
                <option value="payment_issue">Payment / Billing Issue</option>
                <option value="other">Other</option>
              </select>
              <select
                value={incSeverity}
                onChange={(e) => setIncSeverity(e.target.value as IncidentRecord['severity'])}
                className="rounded-xl border border-black/[0.1] bg-[#F8F7F4] px-3 py-2 text-xs font-medium text-[#111827]"
              >
                <option value="low">Low Severity</option>
                <option value="medium">Medium Severity</option>
                <option value="high">High Severity</option>
              </select>
              <select
                value={incBookingId}
                onChange={(e) => setIncBookingId(e.target.value)}
                className="rounded-xl border border-black/[0.1] bg-[#F8F7F4] px-3 py-2 text-xs font-medium text-[#111827]"
              >
                <option value="">General / No Booking</option>
                {bookings.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.id} ({b.spaceCode})
                  </option>
                ))}
              </select>
            </div>
            <textarea
              rows={2}
              required
              value={incDesc}
              onChange={(e) => setIncDesc(e.target.value)}
              placeholder="Describe what happened at the facility or gate..."
              className="w-full rounded-xl border border-black/[0.1] bg-[#F8F7F4] px-3.5 py-2 text-xs text-[#111827]"
            />
            <button
              type="submit"
              className="rounded-xl bg-[#111827] px-4 py-2 text-xs font-bold text-white hover:bg-black"
            >
              Submit Incident Report
            </button>
          </form>

          {incidents.length > 0 && (
            <div className="mt-4 space-y-2 border-t border-black/[0.06] pt-3">
              {incidents.slice(0, 3).map((inc) => (
                <div key={inc.id} className="flex items-center justify-between text-xs text-[#374151]">
                  <span className="truncate">
                    <strong className="font-mono text-[#111827]">{inc.id}</strong> · {inc.category.replace('_', ' ')} — {inc.description}
                  </span>
                  <span className="ml-2 shrink-0 font-semibold capitalize text-[#047857]">
                    {inc.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-black/[0.08] bg-white/92 p-6 shadow-sm backdrop-blur-md lg:col-span-6">
          <h2 className="font-display text-lg font-bold text-[#111827]">
            Transaction History & User Moderation Report
          </h2>

          <div className="mt-3 max-h-40 space-y-2 overflow-y-auto pr-1">
            {transactions.slice(0, 6).map((tx) => (
              <div
                key={tx.id}
                className="flex items-center justify-between rounded-lg border border-black/[0.06] bg-[#F8F7F4] px-3 py-2 text-xs"
              >
                <div>
                  <span className="font-mono font-bold text-[#111827]">{tx.id}</span>
                  <span aria-hidden="true" className="mx-1.5 text-black/20">·</span>
                  <span className="capitalize text-[#374151]">{tx.type.replace('_', ' ')}</span>
                  <span aria-hidden="true" className="mx-1.5 text-black/20">·</span>
                  <span className="text-[#4B5563]">{tx.bookingId}</span>
                </div>
                <span
                  className={`font-mono font-bold tabular-nums ${
                    tx.type === 'refund' ? 'text-[#047857]' : 'text-[#111827]'
                  }`}
                >
                  {tx.type === 'refund' ? '+' : ''}₹{tx.amountInr}
                </span>
              </div>
            ))}
          </div>

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!repTarget.trim() || !repReason.trim()) return;
              await onSubmitUserReport({ reportedEntity: repTarget, reason: repReason });
              setRepTarget('');
              setRepReason('');
            }}
            className="mt-4 space-y-2.5 border-t border-black/[0.06] pt-4"
          >
            <div className="text-xs font-semibold text-[#374151]">
              Flag Misleading Listing or Policy Violation
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                required
                value={repTarget}
                onChange={(e) => setRepTarget(e.target.value)}
                placeholder="Facility or user name"
                className="rounded-xl border border-black/[0.1] bg-[#F8F7F4] px-3 py-2 text-xs text-[#111827] sm:w-44"
              />
              <input
                type="text"
                required
                value={repReason}
                onChange={(e) => setRepReason(e.target.value)}
                placeholder="Reason for admin moderation review..."
                className="flex-1 rounded-xl border border-black/[0.1] bg-[#F8F7F4] px-3 py-2 text-xs text-[#111827]"
              />
              <button
                type="submit"
                className="whitespace-nowrap shrink-0 rounded-xl border border-black/[0.1] bg-white px-3.5 py-2 text-xs font-bold text-[#111827] hover:border-[#D93F0B]"
              >
                Flag Listing
              </button>
            </div>
          </form>
        </section>
      </div>

      {/* Overstay & Next-Booking Zero-Loss Policy Guarantee */}
      <section className="rounded-2xl border border-black/[0.08] bg-white/92 p-5 shadow-sm backdrop-blur-md">
        <h2 className="font-display text-base font-bold text-[#111827]">
          Overstay Protection &amp; Next-Rider Guarantee
        </h2>
        <div className="mt-2 grid grid-cols-1 gap-4 text-xs text-[#374151] md:grid-cols-3">
          <div>
            <strong className="text-[#111827]">1. 15-Minute Buffer &amp; Overstay Surcharge:</strong>{' '}
            Every slot keeps a 15m turnaround buffer. If a rider fails to return past their booked hour + buffer, the bay locks from new bookings and bills a 1.5x overstay surcharge + ₹50 bay-protection fee to the overstaying rider.
          </div>
          <div>
            <strong className="text-[#111827]">2. Instant Auto-Reassignment (₹0 Extra Cost):</strong>{' '}
            The next booked rider is automatically moved to an open compatible bay at the same or nearest verified facility at ₹0 extra charge, with an updated QR pass.
          </div>
          <div>
            <strong className="text-[#111827]">3. Zero Financial Loss Fallback:</strong>{' '}
            If no backup bay exists at that hour, the next rider never loses money — they choose a free reschedule or a 100% instant refund + ₹50 compensation credit.
          </div>
        </div>
      </section>

      {qrModalBooking && (
        <QrCheckinScannerModal
          booking={qrModalBooking}
          facility={qrModalFacility}
          initialMode={qrModalState?.mode || 'scanner'}
          onClose={() => setQrModalState(null)}
          onVerifyQrCheckin={onVerifyQrCheckin}
        />
      )}
    </div>
  );
};
