import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  FileCheck2,
  IndianRupee,
  Lock,
  Plus,
  QrCode,
  ShieldAlert,
  ShieldCheck,
  Upload,
  XCircle,
} from 'lucide-react';
import { QrCodeDisplay } from './QrCodeDisplay';
import {
  BengaluruLocation,
  BookingRecord,
  DetailedProviderType,
  EvidenceRequirement,
  Facility,
  HostSettlementRecord,
  IncidentRecord,
  ParkingSpace,
  ProviderRecord,
  ProviderType,
  UserSession,
  VehicleType,
} from '../types/parkpool';

export interface NewFacilityPayload {
  providerId?: string;
  name: string;
  providerName: string;
  providerType: ProviderType;
  address: string;
  zone?: string;
  lat?: number;
  lng?: number;
  entranceLabel: string;
  walkingDistanceM: number;
  hourlyPriceInr: number;
  covered: boolean;
  evCharging: boolean;
  allowedTypes: VehicleType[];
  hardDepartureMin: number;
  restrictions: string[];
  accessInstructions: string;
}

interface ProviderPortalViewProps {
  user: UserSession;
  subTab: 'onboarding' | 'facilities' | 'bookings' | 'settlements';
  onChangeSubTab: (tab: 'onboarding' | 'facilities' | 'bookings' | 'settlements') => void;
  locations: BengaluruLocation[];
  providers: ProviderRecord[];
  evidenceChecklists: Record<DetailedProviderType, EvidenceRequirement[]>;
  facilities: Facility[];
  spaces: ParkingSpace[];
  bookings: BookingRecord[];
  settlements: HostSettlementRecord[];
  incidents: IncidentRecord[];
  onRegisterProvider: (payload: {
    name: string;
    contactName: string;
    contactEmail: string;
    contactPhone: string;
    organizationName: string;
    registrationNumber?: string;
    providerType: DetailedProviderType;
  }) => Promise<ProviderRecord | null>;
  onUploadEvidence: (
    providerId: string,
    payload: { docType: string; fileName: string; contentText: string }
  ) => Promise<void>;
  onAddFacility: (payload: NewFacilityPayload) => Promise<void>;
  onUpdateSpacePricing: (
    spaceId: string,
    payload: { hourlyPriceInr: number; hardDepartureMin: number; restrictions: string[] }
  ) => Promise<void>;
  onAddOwnerBlock: (
    spaceId: string,
    payload: { startMin: number; endMin: number; label: string }
  ) => Promise<void>;
  onWithdrawAvailability: (
    spaceId: string,
    payload: { startMin: number; endMin: number; reason: string }
  ) => Promise<void>;
  onDecideExtension: (
    bookingId: string,
    requestId: string,
    decision: 'approve' | 'reject'
  ) => Promise<void>;
  onReportOverstay: (bookingId: string, overstayMinutes: number) => Promise<void>;
  onSubmitIncident: (payload: {
    facilityId?: string;
    bookingId?: string;
    category: IncidentRecord['category'];
    severity: IncidentRecord['severity'];
    description: string;
  }) => Promise<void>;
}

const PROVIDER_TYPES: Array<{ id: DetailedProviderType; label: string }> = [
  { id: 'commercial_operator', label: 'Commercial Parking Operator' },
  { id: 'mall_office', label: 'Mall or Office Facility' },
  { id: 'property_owner', label: 'Property Owner' },
  { id: 'property_manager', label: 'Property Manager' },
  { id: 'apartment_residential', label: 'Apartment / Residential Facility' },
];

const VERIFICATION_STEPS = [
  'NOT_SUBMITTED',
  'SUBMITTED',
  'UNDER_REVIEW',
  'NEEDS_MORE_INFORMATION',
  'APPROVED',
] as const;

const VEHICLE_CHOICES: Array<{ id: VehicleType; label: string }> = [
  { id: 'two_wheeler', label: '2-Wheeler' },
  { id: 'hatchback', label: 'Hatchback' },
  { id: 'sedan', label: 'Sedan' },
  { id: 'suv', label: 'SUV' },
];

const HOURS = Array.from({ length: 18 }, (_, i) => i + 6); // 06:00 to 23:00

function fmt(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export const ProviderPortalView: React.FC<ProviderPortalViewProps> = ({
  user,
  subTab,
  onChangeSubTab,
  locations,
  providers,
  evidenceChecklists,
  facilities,
  spaces,
  bookings,
  settlements,
  incidents,
  onRegisterProvider,
  onUploadEvidence,
  onAddFacility,
  onUpdateSpacePricing,
  onAddOwnerBlock,
  onWithdrawAvailability,
  onDecideExtension,
  onReportOverstay,
  onSubmitIncident,
}) => {
  const matchedProvider = useMemo(
    () =>
      providers.find((p) => p.contactEmail.toLowerCase() === user.email.toLowerCase()) ||
      providers.find((p) => p.id === 'PRV-05') ||
      providers[0],
    [providers, user.email]
  );

  // Registration state
  const [orgName, setOrgName] = useState(
    matchedProvider?.organizationName || user.organization || ''
  );
  const [contactPhone, setContactPhone] = useState(
    matchedProvider?.contactPhone || '+91 98452 71004'
  );
  const [regNo, setRegNo] = useState(matchedProvider?.registrationNumber || '');
  const [detailedType, setDetailedType] = useState<DetailedProviderType>(
    matchedProvider?.providerType || 'property_owner'
  );
  const [regBusy, setRegBusy] = useState(false);

  // Evidence upload state
  const checklist = evidenceChecklists[matchedProvider?.providerType || detailedType] || [];
  const [docType, setDocType] = useState<string>(checklist[0]?.docType || 'ownership_title');
  const [fileName, setFileName] = useState('property_authority_record.txt');
  const [docSummary, setDocSummary] = useState(
    'Verified Khata/Agreement Ref #BLR-2026-881 authorizing public visitor bay pooling 07:00-22:00.'
  );
  const [uploadBusy, setUploadBusy] = useState(false);

  // Facility creation state
  const [facName, setFacName] = useState('');
  const [selectedLocId, setSelectedLocId] = useState(locations[0]?.id || 'LOC-PHX');
  const [address, setAddress] = useState('Kodigehalli Main Rd, Bengaluru');
  const [entranceLabel, setEntranceLabel] = useState('Main Sliding Gate');
  const [accessInstructions, setAccessInstructions] = useState(
    'Scan booking QR or enter gate PIN at keypad; park in designated bay.'
  );
  const [restrictionsText, setRestrictionsText] = useState(
    'Max height 210cm, No overnight stay past closing time'
  );
  const [walkingDistanceM, setWalkingDistanceM] = useState(260);
  const [hourlyPriceInr, setHourlyPriceInr] = useState(50);
  const [hardDepartureMin, setHardDepartureMin] = useState(21 * 60);
  const [covered, setCovered] = useState(true);
  const [evCharging, setEvCharging] = useState(false);
  const [allowedTypes, setAllowedTypes] = useState<VehicleType[]>([
    'hatchback',
    'sedan',
    'suv',
  ]);
  const [facBusy, setFacBusy] = useState(false);

  // Calendar, Blocks & Withdrawals state
  const ownFacilities = useMemo(() => {
    if (!matchedProvider) return facilities;
    const owned = facilities.filter((f) => f.providerId === matchedProvider.id);
    return owned.length > 0 ? owned : facilities.slice(0, 3);
  }, [facilities, matchedProvider]);

  const ownSpaces = useMemo(() => {
    const ids = new Set(ownFacilities.map((f) => f.id));
    return spaces.filter((s) => ids.has(s.facilityId));
  }, [spaces, ownFacilities]);

  const [selectedSpaceId, setSelectedSpaceId] = useState<string>(
    () => ownSpaces[0]?.id || spaces[0]?.id || 'BAY-E1'
  );
  const activeSpace =
    ownSpaces.find((s) => s.id === selectedSpaceId) || ownSpaces[0] || spaces[0];

  const [blockStartHour, setBlockStartHour] = useState(16);
  const [blockEndHour, setBlockEndHour] = useState(18);
  const [blockLabel, setBlockLabel] = useState('Host Personal Vehicle Window');
  const [withdrawReason, setWithdrawReason] = useState('Scheduled gate maintenance');

  // Pricing edit state
  const [editPrice, setEditPrice] = useState<number>(activeSpace?.hourlyPriceInr || 45);
  const [editCutoffHour, setEditCutoffHour] = useState<number>(
    Math.floor((activeSpace?.hardDepartureMin || 21 * 60) / 60)
  );
  const [editRestrictions, setEditRestrictions] = useState(
    activeSpace?.restrictions.join(', ') || ''
  );

  // Incident state
  const [incCategory, setIncCategory] = useState<IncidentRecord['category']>('vehicle_overstay');
  const [incSeverity, setIncSeverity] = useState<IncidentRecord['severity']>('medium');
  const [incDesc, setIncDesc] = useState('');

  const ownFacIds = new Set(ownFacilities.map((f) => f.id));
  const ownBookings = bookings.filter((b) => ownFacIds.has(b.facilityId));
  const pendingExtensions = bookings.flatMap((bk) =>
    bk.extensionRequests
      .filter((r) => r.status === 'pending_host_approval')
      .map((req) => ({ bk, req }))
  );

  const ownSettlements = settlements.filter(
    (s) => !matchedProvider || s.providerId === matchedProvider.id
  );
  const totalNetEarnings = ownSettlements
    .filter((s) => s.status !== 'reversed')
    .reduce((sum, s) => sum + s.netPayoutInr, 0);

  const toggleVehicle = (type: VehicleType) => {
    setAllowedTypes((prev) =>
      prev.includes(type) ? (prev.length > 1 ? prev.filter((t) => t !== type) : prev) : [...prev, type]
    );
  };

  return (
    <div className="space-y-6">
      {/* Provider Workspace Header & Sub-Tabs */}
      <section className="rounded-2xl border border-black/[0.08] bg-white/92 p-6 shadow-sm backdrop-blur-md">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-[#111827]">
              Provider Operations Portal
            </h1>
            <p className="mt-0.5 text-sm text-[#4B5563]">
              Onboarding, private evidence submission, bay calendar blocks, extensions, and payouts.
            </p>
          </div>
          {matchedProvider && (
            <div className="text-right text-xs">
              <div className="text-[#4B5563]">Verification Status</div>
              <div
                className={`mt-0.5 font-mono text-sm font-bold ${
                  matchedProvider.verificationStatus === 'APPROVED'
                    ? 'text-[#047857]'
                    : matchedProvider.verificationStatus === 'REJECTED' ||
                      matchedProvider.verificationStatus === 'SUSPENDED' ||
                      matchedProvider.verificationStatus === 'EXPIRED'
                    ? 'text-rose-700'
                    : 'text-[#C83709]'
                }`}
              >
                {matchedProvider.verificationStatus}
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-1.5 border-t border-black/[0.06] pt-4">
          {(
            [
              { id: 'onboarding', label: 'Onboarding & Evidence' },
              { id: 'facilities', label: 'Facilities & Calendar' },
              {
                id: 'bookings',
                label: `Bookings & Extensions${
                  pendingExtensions.length > 0 ? ` (${pendingExtensions.length})` : ''
                }`,
              },
              { id: 'settlements', label: 'Settlements & Incidents' },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onChangeSubTab(t.id)}
              className={`whitespace-nowrap shrink-0 rounded-xl px-4 py-2 text-xs font-bold transition-colors ${
                subTab === t.id
                  ? 'bg-[#047857] text-white shadow-sm'
                  : 'bg-[#F3F2EE] text-[#374151] hover:bg-black/[0.06]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </section>

      {/* TAB 1: ONBOARDING & PRIVATE EVIDENCE */}
      {subTab === 'onboarding' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Provider Registration */}
          <section className="rounded-2xl border border-black/[0.08] bg-white/92 p-6 shadow-sm backdrop-blur-md lg:col-span-5">
            <h2 className="font-display text-lg font-bold text-[#111827]">
              1. Provider Registration
            </h2>
            <p className="mt-0.5 text-xs text-[#4B5563]">
              Initial registration starts as <span className="font-mono font-semibold">NOT_SUBMITTED</span>. Only Admin verification can grant <span className="font-mono font-semibold">APPROVED</span>.
            </p>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setRegBusy(true);
                try {
                  await onRegisterProvider({
                    name: user.name,
                    contactName: user.name,
                    contactEmail: user.email,
                    contactPhone,
                    organizationName: orgName,
                    registrationNumber: regNo || undefined,
                    providerType: detailedType,
                  });
                } finally {
                  setRegBusy(false);
                }
              }}
              className="mt-4 space-y-3.5"
            >
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#374151]">
                  Provider / Property Arrangement Type
                </label>
                <select
                  value={detailedType}
                  onChange={(e) => {
                    const nextType = e.target.value as DetailedProviderType;
                    setDetailedType(nextType);
                    const nextChecklist = evidenceChecklists[nextType];
                    if (nextChecklist?.[0]) setDocType(nextChecklist[0].docType);
                  }}
                  className="w-full rounded-xl border border-black/[0.1] bg-[#F8F7F4] px-3 py-2 text-sm text-[#111827]"
                >
                  {PROVIDER_TYPES.map((pt) => (
                    <option key={pt.id} value={pt.id}>
                      {pt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-[#374151]">
                  Organisation / Facility Entity Name
                </label>
                <input
                  type="text"
                  required
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  className="w-full rounded-xl border border-black/[0.1] bg-[#F8F7F4] px-3.5 py-2 text-sm text-[#111827]"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#374151]">
                    Contact Phone
                  </label>
                  <input
                    type="text"
                    required
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    className="w-full rounded-xl border border-black/[0.1] bg-[#F8F7F4] px-3.5 py-2 text-sm text-[#111827]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#374151]">
                    Reg / Khata / RWA Ref
                  </label>
                  <input
                    type="text"
                    value={regNo}
                    onChange={(e) => setRegNo(e.target.value)}
                    placeholder="KA-BLR-2026-..."
                    className="w-full rounded-xl border border-black/[0.1] bg-[#F8F7F4] px-3.5 py-2 font-mono text-sm text-[#111827]"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={regBusy}
                className="w-full rounded-xl bg-[#047857] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#065F46] disabled:opacity-60"
              >
                {regBusy ? 'Saving...' : 'Save Provider Registration'}
              </button>
            </form>
          </section>

          {/* Status Tracker & Type-Specific Evidence Upload */}
          <section className="rounded-2xl border border-black/[0.08] bg-white/92 p-6 shadow-sm backdrop-blur-md lg:col-span-7">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-lg font-bold text-[#111827]">
                2. Verification Status & Private Evidence Vault
              </h2>
              <span className="flex items-center gap-1 text-xs font-semibold text-[#4338CA]">
                <Lock className="h-3.5 w-3.5" />
                Private Storage (Signed Links Only)
              </span>
            </div>

            {matchedProvider && (
              <>
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {VERIFICATION_STEPS.map((st) => {
                    const active = matchedProvider.verificationStatus === st;
                    return (
                      <div
                        key={st}
                        className={`rounded-xl border px-2.5 py-2 text-center text-[11px] font-mono font-bold ${
                          active
                            ? st === 'APPROVED'
                              ? 'border-[#047857] bg-emerald-50 text-[#047857]'
                              : 'border-[#D93F0B] bg-[#FFF0EA] text-[#C83709]'
                            : 'border-black/[0.06] bg-[#F8F7F4] text-[#6B7280]'
                        }`}
                      >
                        {st.replace(/_/g, ' ')}
                      </div>
                    );
                  })}
                </div>

                {matchedProvider.decisionReason && (
                  <div className="mt-3 rounded-xl border border-black/[0.07] bg-[#F8F7F4] px-3.5 py-2.5 text-xs text-[#374151]">
                    <strong>Admin Note:</strong> {matchedProvider.decisionReason}
                    {matchedProvider.expiresAt ? ` · Expires ${matchedProvider.expiresAt}` : ''}
                  </div>
                )}

                {matchedProvider.aiPrecheckWarnings.length > 0 && (
                  <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
                    <div className="font-bold">AI Completeness Pre-Check (Advisory Only — Human Review Decides)</div>
                    <ul className="mt-1 list-disc pl-4">
                      {matchedProvider.aiPrecheckWarnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="mt-4">
                  <div className="text-xs font-bold text-[#111827]">
                    Required Evidence Checklist ({matchedProvider.providerType.replace('_', ' ')})
                  </div>
                  <div className="mt-2 space-y-2">
                    {checklist.map((req) => {
                      const uploaded = matchedProvider.documents.find(
                        (d) => d.docType === req.docType
                      );
                      return (
                        <div
                          key={req.docType}
                          className="flex items-center justify-between gap-3 rounded-xl border border-black/[0.06] bg-[#F8F7F4] px-3.5 py-2.5 text-xs"
                        >
                          <div>
                            <div className="font-semibold text-[#111827]">
                              {req.label} {req.required ? '(Required)' : '(Optional)'}
                            </div>
                            <div className="text-[11px] text-[#4B5563]">{req.description}</div>
                          </div>
                          {uploaded ? (
                            <span className="flex items-center gap-1 shrink-0 font-semibold text-[#047857]">
                              <FileCheck2 className="h-3.5 w-3.5" />
                              {uploaded.status}
                            </span>
                          ) : (
                            <span className="shrink-0 font-semibold text-[#C83709]">Pending</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setUploadBusy(true);
                    try {
                      await onUploadEvidence(matchedProvider.id, {
                        docType,
                        fileName,
                        contentText: docSummary,
                      });
                    } finally {
                      setUploadBusy(false);
                    }
                  }}
                  className="mt-4 space-y-3 border-t border-black/[0.06] pt-4"
                >
                  <div className="text-xs font-bold text-[#111827]">
                    Submit Verification Document to Private Object Vault
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <select
                      value={docType}
                      onChange={(e) => setDocType(e.target.value)}
                      className="rounded-xl border border-black/[0.1] bg-[#F8F7F4] px-3 py-2 text-xs text-[#111827]"
                    >
                      {checklist.map((c) => (
                        <option key={c.docType} value={c.docType}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      required
                      value={fileName}
                      onChange={(e) => setFileName(e.target.value)}
                      placeholder="document_filename.pdf"
                      className="rounded-xl border border-black/[0.1] bg-[#F8F7F4] px-3 py-2 font-mono text-xs text-[#111827]"
                    />
                  </div>
                  <textarea
                    rows={2}
                    required
                    value={docSummary}
                    onChange={(e) => setDocSummary(e.target.value)}
                    placeholder="Document details, folio/registration reference, signatory, and parking permissions..."
                    className="w-full rounded-xl border border-black/[0.1] bg-[#F8F7F4] px-3.5 py-2 text-xs text-[#111827]"
                  />
                  <button
                    type="submit"
                    disabled={uploadBusy}
                    className="flex items-center gap-1.5 rounded-xl bg-[#111827] px-4 py-2 text-xs font-bold text-white hover:bg-black disabled:opacity-60"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    <span>{uploadBusy ? 'Uploading...' : 'Submit Evidence for Human Review'}</span>
                  </button>
                </form>
              </>
            )}
          </section>
        </div>
      )}

      {/* TAB 2: FACILITIES, AVAILABILITY CALENDAR, OWNER BLOCKS & PRICING */}
      {subTab === 'facilities' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Facility & Slot Listing Form */}
            <section className="rounded-2xl border border-black/[0.08] bg-white/92 p-6 shadow-sm backdrop-blur-md lg:col-span-5">
              <h2 className="font-display text-lg font-bold text-[#111827]">
                List New Facility & Bay
              </h2>
              <p className="mt-0.5 text-xs text-[#4B5563]">
                New listings enter <span className="font-mono font-semibold">pending_approval</span> until Admin completes operational checks and approves publication.
              </p>

              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!facName.trim() || !address.trim()) return;
                  setFacBusy(true);
                  try {
                    const loc = locations.find((l) => l.id === selectedLocId);
                    await onAddFacility({
                      providerId: matchedProvider?.id,
                      name: facName.trim(),
                      providerName: matchedProvider?.name || user.name,
                      providerType: matchedProvider?.legacyType || 'individual',
                      address: address.trim(),
                      zone: loc?.area || loc?.name,
                      lat: loc?.lat,
                      lng: loc?.lng,
                      entranceLabel: entranceLabel.trim() || 'Main Gate',
                      walkingDistanceM: Number(walkingDistanceM) || 260,
                      hourlyPriceInr: Number(hourlyPriceInr) || 50,
                      covered,
                      evCharging,
                      allowedTypes,
                      hardDepartureMin,
                      restrictions: restrictionsText
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean),
                      accessInstructions,
                    });
                    setFacName('');
                  } finally {
                    setFacBusy(false);
                  }
                }}
                className="mt-4 space-y-3"
              >
                <input
                  type="text"
                  required
                  value={facName}
                  onChange={(e) => setFacName(e.target.value)}
                  placeholder="Facility Name (e.g., Kodigehalli Covered Bay 2)"
                  className="w-full rounded-xl border border-black/[0.1] bg-[#F8F7F4] px-3.5 py-2 text-sm text-[#111827]"
                />
                <select
                  value={selectedLocId}
                  onChange={(e) => setSelectedLocId(e.target.value)}
                  className="w-full rounded-xl border border-black/[0.1] bg-[#F8F7F4] px-3 py-2 text-sm text-[#111827]"
                >
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name} ({l.area})
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  required
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Street Address"
                  className="w-full rounded-xl border border-black/[0.1] bg-[#F8F7F4] px-3.5 py-2 text-sm text-[#111827]"
                />
                <div className="grid grid-cols-3 gap-2.5">
                  <input
                    type="text"
                    value={entranceLabel}
                    onChange={(e) => setEntranceLabel(e.target.value)}
                    placeholder="Entrance Gate"
                    className="rounded-xl border border-black/[0.1] bg-[#F8F7F4] px-3 py-2 text-xs text-[#111827]"
                  />
                  <input
                    type="number"
                    min={50}
                    value={walkingDistanceM}
                    onChange={(e) => setWalkingDistanceM(Number(e.target.value))}
                    placeholder="Walk (m)"
                    className="rounded-xl border border-black/[0.1] bg-[#F8F7F4] px-3 py-2 font-mono text-xs text-[#111827]"
                  />
                  <input
                    type="number"
                    min={20}
                    value={hourlyPriceInr}
                    onChange={(e) => setHourlyPriceInr(Number(e.target.value))}
                    placeholder="₹/hr"
                    className="rounded-xl border border-black/[0.1] bg-[#F8F7F4] px-3 py-2 font-mono text-xs text-[#111827]"
                  />
                </div>
                <input
                  type="text"
                  required
                  value={accessInstructions}
                  onChange={(e) => setAccessInstructions(e.target.value)}
                  placeholder="Gate access instructions"
                  className="w-full rounded-xl border border-black/[0.1] bg-[#F8F7F4] px-3.5 py-2 text-xs text-[#111827]"
                />
                <input
                  type="text"
                  required
                  value={restrictionsText}
                  onChange={(e) => setRestrictionsText(e.target.value)}
                  placeholder="Restrictions (comma-separated)"
                  className="w-full rounded-xl border border-black/[0.1] bg-[#F8F7F4] px-3.5 py-2 text-xs text-[#111827]"
                />
                <div className="flex flex-wrap gap-1.5">
                  {VEHICLE_CHOICES.map((vc) => (
                    <button
                      key={vc.id}
                      type="button"
                      onClick={() => toggleVehicle(vc.id)}
                      className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${
                        allowedTypes.includes(vc.id)
                          ? 'bg-[#111827] text-white'
                          : 'bg-[#F3F2EE] text-[#374151]'
                      }`}
                    >
                      {vc.label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <label className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={covered}
                      onChange={(e) => setCovered(e.target.checked)}
                      className="accent-[#047857]"
                    />
                    Covered
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={evCharging}
                      onChange={(e) => setEvCharging(e.target.checked)}
                      className="accent-[#047857]"
                    />
                    EV Charger
                  </label>
                  <select
                    value={hardDepartureMin}
                    onChange={(e) => setHardDepartureMin(Number(e.target.value))}
                    className="rounded-lg border border-black/[0.1] bg-[#F8F7F4] px-2 py-1 text-xs"
                  >
                    <option value={18 * 60}>Close 18:00</option>
                    <option value={20 * 60}>Close 20:00</option>
                    <option value={21 * 60}>Close 21:00</option>
                    <option value={22 * 60 + 30}>Close 22:30</option>
                  </select>
                </div>
                <button
                  type="submit"
                  disabled={facBusy}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#047857] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#065F46] disabled:opacity-60"
                >
                  <Plus className="h-4 w-4" />
                  <span>{facBusy ? 'Submitting...' : 'Submit Space for Admin Operational Approval'}</span>
                </button>
              </form>
            </section>

            {/* Availability Calendar, Owner Blocks & Pricing Editor */}
            <section className="rounded-2xl border border-black/[0.08] bg-white/92 p-6 shadow-sm backdrop-blur-md lg:col-span-7">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-[#047857]" />
                  <h2 className="font-display text-lg font-bold text-[#111827]">
                    Availability Calendar & Owner-Use Blocks
                  </h2>
                </div>
                <select
                  value={activeSpace?.id || ''}
                  onChange={(e) => {
                    const nextId = e.target.value;
                    setSelectedSpaceId(nextId);
                    const sp = spaces.find((s) => s.id === nextId);
                    if (sp) {
                      setEditPrice(sp.hourlyPriceInr);
                      setEditCutoffHour(Math.floor(sp.hardDepartureMin / 60));
                      setEditRestrictions(sp.restrictions.join(', '));
                    }
                  }}
                  className="rounded-xl border border-black/[0.1] bg-[#F8F7F4] px-3 py-1.5 text-xs font-bold text-[#111827]"
                >
                  {ownSpaces.map((sp) => (
                    <option key={sp.id} value={sp.id}>
                      {sp.spaceCode} ({sp.publicationStatus})
                    </option>
                  ))}
                </select>
              </div>

              {activeSpace && (
                <>
                  {/* Visual Hourly Availability Timeline (06:00 - 23:00) */}
                  <div className="mt-4">
                    <div className="mb-2 flex flex-wrap items-center gap-4 text-[11px] text-[#4B5563]">
                      <span className="font-semibold text-[#047857]">Green: Open</span>
                      <span className="font-semibold text-[#4338CA]">Indigo: Driver Booking</span>
                      <span className="font-semibold text-[#C83709]">Amber/Orange: Owner Block</span>
                      <span className="font-semibold text-rose-700">Red: Withdrawn / Closed</span>
                    </div>
                    <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-9">
                      {HOURS.map((hr) => {
                        const slotStart = hr * 60;
                        const slotEnd = (hr + 1) * 60;
                        const isBooked = bookings.some(
                          (b) =>
                            b.spaceId === activeSpace.id &&
                            (b.status === 'held' ||
                              b.status === 'confirmed' ||
                              b.status === 'checked-in' ||
                              b.status === 'occupied') &&
                            slotStart < b.endMin &&
                            slotEnd > b.startMin
                        );
                        const isOwner = activeSpace.ownerBlocks.some(
                          (ob) => slotStart < ob.endMin && slotEnd > ob.startMin
                        );
                        const isWithdrawn = activeSpace.withdrawals.some(
                          (w) => slotStart < w.endMin && slotEnd > w.startMin
                        );
                        const isClosed =
                          slotStart < activeSpace.operatingStartMin ||
                          slotEnd > activeSpace.hardDepartureMin;

                        const cellStyle = isWithdrawn || isClosed
                          ? 'border-rose-200 bg-rose-50 text-rose-800'
                          : isBooked
                          ? 'border-indigo-300 bg-indigo-50 text-[#4338CA]'
                          : isOwner
                          ? 'border-amber-300 bg-[#FFF0EA] text-[#C83709]'
                          : 'border-emerald-200 bg-emerald-50/70 text-[#047857]';

                        return (
                          <div
                            key={hr}
                            className={`rounded-lg border p-2 text-center font-mono text-[11px] font-bold tabular-nums ${cellStyle}`}
                          >
                            {String(hr).padStart(2, '0')}:00
                            <div className="mt-0.5 text-[10px] font-sans font-medium">
                              {isWithdrawn
                                ? 'Withdrawn'
                                : isClosed
                                ? 'Closed'
                                : isBooked
                                ? 'Booked'
                                : isOwner
                                ? 'Owner'
                                : 'Open'}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Owner Block Form (Existing confirmed bookings protected!) */}
                  <div className="mt-5 grid grid-cols-1 gap-4 border-t border-black/[0.06] pt-4 sm:grid-cols-2">
                    <div className="space-y-2.5">
                      <div className="text-xs font-bold text-[#111827]">
                        Add Owner-Use Block (Protects Confirmed Bookings)
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          min={6}
                          max={22}
                          value={blockStartHour}
                          onChange={(e) => setBlockStartHour(Number(e.target.value))}
                          className="w-20 rounded-lg border border-black/[0.1] bg-[#F8F7F4] px-2.5 py-1.5 font-mono text-xs"
                        />
                        <span className="self-center text-xs text-[#4B5563]">to</span>
                        <input
                          type="number"
                          min={7}
                          max={23}
                          value={blockEndHour}
                          onChange={(e) => setBlockEndHour(Number(e.target.value))}
                          className="w-20 rounded-lg border border-black/[0.1] bg-[#F8F7F4] px-2.5 py-1.5 font-mono text-xs"
                        />
                      </div>
                      <input
                        type="text"
                        value={blockLabel}
                        onChange={(e) => setBlockLabel(e.target.value)}
                        className="w-full rounded-lg border border-black/[0.1] bg-[#F8F7F4] px-3 py-1.5 text-xs"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          void onAddOwnerBlock(activeSpace.id, {
                            startMin: blockStartHour * 60,
                            endMin: blockEndHour * 60,
                            label: blockLabel,
                          })
                        }
                        className="rounded-lg bg-[#111827] px-3.5 py-2 text-xs font-bold text-white hover:bg-black"
                      >
                        Block Owner Time
                      </button>
                    </div>

                    {/* Pricing & Restrictions Quick Editor */}
                    <div className="space-y-2.5">
                      <div className="text-xs font-bold text-[#111827]">
                        Pricing & Restrictions ({activeSpace.spaceCode})
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          min={15}
                          value={editPrice}
                          onChange={(e) => setEditPrice(Number(e.target.value))}
                          className="w-24 rounded-lg border border-black/[0.1] bg-[#F8F7F4] px-2.5 py-1.5 font-mono text-xs"
                        />
                        <span className="self-center text-xs text-[#4B5563]">₹/hr · Cutoff</span>
                        <input
                          type="number"
                          min={10}
                          max={23}
                          value={editCutoffHour}
                          onChange={(e) => setEditCutoffHour(Number(e.target.value))}
                          className="w-20 rounded-lg border border-black/[0.1] bg-[#F8F7F4] px-2.5 py-1.5 font-mono text-xs"
                        />
                      </div>
                      <input
                        type="text"
                        value={editRestrictions}
                        onChange={(e) => setEditRestrictions(e.target.value)}
                        placeholder="Comma-separated restrictions"
                        className="w-full rounded-lg border border-black/[0.1] bg-[#F8F7F4] px-3 py-1.5 text-xs"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          void onUpdateSpacePricing(activeSpace.id, {
                            hourlyPriceInr: editPrice,
                            hardDepartureMin: editCutoffHour * 60,
                            restrictions: editRestrictions
                              .split(',')
                              .map((s) => s.trim())
                              .filter(Boolean),
                          })
                        }
                        className="rounded-lg bg-[#047857] px-3.5 py-2 text-xs font-bold text-white hover:bg-[#065F46]"
                      >
                        Save Pricing & Rules
                      </button>
                    </div>
                  </div>
                </>
              )}
            </section>
          </div>

          {/* Own Facilities Publication Status List */}
          <section className="rounded-2xl border border-black/[0.08] bg-white/92 p-6 shadow-sm backdrop-blur-md">
            <h3 className="font-display text-base font-bold text-[#111827]">
              Your Listed Facilities & Publication Status
            </h3>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              {ownFacilities.map((f) => {
                const sp = spaces.find((s) => s.facilityId === f.id);
                return (
                  <div
                    key={f.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-black/[0.07] bg-[#F8F7F4] p-3.5 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-display text-sm font-bold text-[#111827]">
                        {f.name}
                      </div>
                      <div className="text-[#4B5563]">
                        {f.entranceLabel} · Ops Check: {f.operationalChecksPassed ? 'Passed' : 'Pending'}
                      </div>
                      {f.facilityGateQrToken && (
                        <div className="mt-1 flex items-center gap-1 font-mono text-[10px] text-[#4338CA]">
                          <QrCode className="h-3 w-3 shrink-0" />
                          <span className="truncate">{f.facilityGateQrToken}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {f.facilityGateQrToken && (
                        <QrCodeDisplay
                          value={f.facilityGateQrToken}
                          size={56}
                          label={`Entrance QR for ${f.name}`}
                        />
                      )}
                      <span
                        className={`font-mono font-bold uppercase ${
                          sp?.publicationStatus === 'approved' ? 'text-[#047857]' : 'text-[#C83709]'
                        }`}
                      >
                        {sp?.publicationStatus || f.verificationStatus}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}

      {/* TAB 3: BOOKING MANAGEMENT, EXTENSION APPROVAL & SLOT WITHDRAWALS */}
      {subTab === 'bookings' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Extension Approval Queue + Future Slot Withdrawal */}
          <section className="space-y-6 lg:col-span-5">
            <div className="rounded-2xl border border-black/[0.08] bg-white/92 p-6 shadow-sm backdrop-blur-md">
              <div className="flex items-center gap-2 font-display text-lg font-bold text-[#111827]">
                <Clock className="h-4 w-4 text-[#C83709]" />
                <span>Extension Approval Queue ({pendingExtensions.length})</span>
              </div>
              <p className="mt-0.5 text-xs text-[#4B5563]">
                Approve or decline extension requests safely without displacing next bookings.
              </p>

              <div className="mt-4 space-y-3">
                {pendingExtensions.length === 0 ? (
                  <div className="rounded-xl border border-black/[0.06] bg-[#F8F7F4] p-4 text-xs text-[#4B5563]">
                    No pending extension requests right now.
                  </div>
                ) : (
                  pendingExtensions.map(({ bk, req }) => (
                    <div
                      key={req.id}
                      className="rounded-xl border border-amber-200 bg-[#FFF8F4] p-3.5 text-xs"
                    >
                      <div className="font-bold text-[#111827]">
                        {bk.id} · {bk.spaceCode} ({bk.driverName})
                      </div>
                      <div className="mt-1 text-[#374151]">
                        Extend <span className="font-mono">{fmt(bk.endMin)}</span> →{' '}
                        <span className="font-mono font-bold text-[#047857]">
                          {fmt(req.requestedEndMin)}
                        </span>{' '}
                        (+₹{req.additionalTotalInr})
                      </div>
                      <div className="mt-1 text-[11px] text-[#4B5563]">{req.reason}</div>
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={() => void onDecideExtension(bk.id, req.id, 'approve')}
                          className="flex items-center gap-1 rounded-lg bg-[#047857] px-3 py-1.5 font-bold text-white"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>Approve</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => void onDecideExtension(bk.id, req.id, 'reject')}
                          className="flex items-center gap-1 rounded-lg border border-rose-200 bg-white px-3 py-1.5 font-bold text-rose-700"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          <span>Decline</span>
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-black/[0.08] bg-white/92 p-6 shadow-sm backdrop-blur-md">
              <div className="flex items-center gap-2 font-display text-lg font-bold text-[#111827]">
                <ShieldAlert className="h-4 w-4 text-rose-600" />
                <span>Withdraw Future Availability</span>
              </div>
              <p className="mt-0.5 text-xs text-[#4B5563]">
                Blocks future bookings and notifies any affected drivers with free rebooking or 100% refund options.
              </p>

              {activeSpace && (
                <div className="mt-4 space-y-3">
                  <select
                    value={activeSpace.id}
                    onChange={(e) => setSelectedSpaceId(e.target.value)}
                    className="w-full rounded-xl border border-black/[0.1] bg-[#F8F7F4] px-3 py-2 text-xs font-bold text-[#111827]"
                  >
                    {ownSpaces.map((sp) => (
                      <option key={sp.id} value={sp.id}>
                        {sp.spaceCode}
                      </option>
                    ))}
                  </select>
                  <div className="flex items-center gap-2 text-xs">
                    <input
                      type="number"
                      min={6}
                      max={22}
                      value={blockStartHour}
                      onChange={(e) => setBlockStartHour(Number(e.target.value))}
                      className="w-20 rounded-lg border border-black/[0.1] bg-[#F8F7F4] px-2.5 py-1.5 font-mono"
                    />
                    <span>to</span>
                    <input
                      type="number"
                      min={7}
                      max={23}
                      value={blockEndHour}
                      onChange={(e) => setBlockEndHour(Number(e.target.value))}
                      className="w-20 rounded-lg border border-black/[0.1] bg-[#F8F7F4] px-2.5 py-1.5 font-mono"
                    />
                  </div>
                  <input
                    type="text"
                    value={withdrawReason}
                    onChange={(e) => setWithdrawReason(e.target.value)}
                    placeholder="Reason for withdrawal"
                    className="w-full rounded-xl border border-black/[0.1] bg-[#F8F7F4] px-3 py-2 text-xs"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      void onWithdrawAvailability(activeSpace.id, {
                        startMin: blockStartHour * 60,
                        endMin: blockEndHour * 60,
                        reason: withdrawReason,
                      })
                    }
                    className="w-full rounded-xl bg-rose-700 px-4 py-2 text-xs font-bold text-white hover:bg-rose-800"
                  >
                    Withdraw Slot & Notify Drivers
                  </button>
                </div>
              )}
            </div>
          </section>

          {/* Provider Bookings List */}
          <section className="rounded-2xl border border-black/[0.08] bg-white/92 p-6 shadow-sm backdrop-blur-md lg:col-span-7">
            <h2 className="font-display text-lg font-bold text-[#111827]">
              Facility Bookings ({ownBookings.length})
            </h2>
            <div className="mt-4 space-y-3">
              {ownBookings.map((bk) => (
                <div
                  key={bk.id}
                  className="rounded-xl border border-black/[0.07] bg-[#F8F7F4] p-4 text-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono font-bold text-[#111827]">
                      {bk.id} · {bk.spaceCode}
                    </span>
                    <span className="font-semibold capitalize text-[#047857]">
                      {bk.status} · {bk.paymentStatus}
                    </span>
                  </div>
                  <div className="mt-1 text-[#374151]">
                    Driver: <strong>{bk.driverName}</strong> · {bk.vehicleLabel} ·{' '}
                    <span className="font-mono">
                      {fmt(bk.startMin)}–{fmt(bk.endMin)}
                    </span>
                  </div>
                  {bk.hostExceptionFlagged && (
                    <div className="mt-1.5 font-semibold text-indigo-800">
                      Protected Exception: Overlaps new owner block (awaiting review).
                    </div>
                  )}
                  {bk.overstayStatus === 'flagged_overstay' && (
                    <div className="mt-1.5 font-semibold text-rose-700">
                      Overstay Flagged (+{bk.overstayMinutes}m · Surcharge ₹{bk.overstayPenaltyInr}) — downstream bookings protected.
                    </div>
                  )}
                  {(bk.status === 'checked-in' ||
                    bk.status === 'occupied' ||
                    bk.status === 'confirmed') &&
                    bk.overstayStatus !== 'flagged_overstay' && (
                      <div className="mt-2.5 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void onReportOverstay(bk.id, 45)}
                          className="rounded-lg border border-rose-300 bg-white px-3 py-1.5 font-bold text-rose-700 hover:bg-rose-50"
                        >
                          Flag Overstay (+45m) &amp; Protect Next Rider
                        </button>
                      </div>
                    )}
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* TAB 4: EARNINGS, SETTLEMENTS & INCIDENT REPORTING */}
      {subTab === 'settlements' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <section className="rounded-2xl border border-black/[0.08] bg-white/92 p-6 shadow-sm backdrop-blur-md lg:col-span-7">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-display text-lg font-bold text-[#111827]">
                <IndianRupee className="h-4 w-4 text-[#047857]" />
                <span>Earnings & Settlement History</span>
              </div>
              <div className="font-mono text-lg font-extrabold tabular-nums text-[#047857]">
                Net ₹{totalNetEarnings}
              </div>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-black/[0.08] text-[#4B5563]">
                  <tr>
                    <th className="py-2 pr-3">Settlement</th>
                    <th className="py-2 pr-3">Booking</th>
                    <th className="py-2 pr-3 text-right">Gross</th>
                    <th className="py-2 pr-3 text-right">Fee</th>
                    <th className="py-2 pr-3 text-right">Net Payout</th>
                    <th className="py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/[0.06]">
                  {ownSettlements.map((st) => (
                    <tr key={st.id}>
                      <td className="py-2.5 pr-3 font-mono font-bold text-[#111827]">{st.id}</td>
                      <td className="py-2.5 pr-3 font-mono text-[#374151]">{st.bookingId}</td>
                      <td className="py-2.5 pr-3 text-right font-mono tabular-nums">₹{st.grossInr}</td>
                      <td className="py-2.5 pr-3 text-right font-mono tabular-nums text-[#4B5563]">
                        -₹{st.platformCommissionInr}
                      </td>
                      <td className="py-2.5 pr-3 text-right font-mono font-bold tabular-nums text-[#047857]">
                        ₹{st.netPayoutInr}
                      </td>
                      <td className="py-2.5 capitalize">
                        {st.status.replace('_', ' ')}
                        {st.utrRef ? ` (${st.utrRef})` : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-2xl border border-black/[0.08] bg-white/92 p-6 shadow-sm backdrop-blur-md lg:col-span-5">
            <div className="flex items-center gap-2 font-display text-lg font-bold text-[#111827]">
              <AlertTriangle className="h-4 w-4 text-[#C83709]" />
              <span>Provider Incident Report</span>
            </div>
            <p className="mt-0.5 text-xs text-[#4B5563]">
              Never forcibly clamp or tow without lawful authority; report overstays or gate incidents here.
            </p>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!incDesc.trim()) return;
                await onSubmitIncident({
                  facilityId: ownFacilities[0]?.id,
                  category: incCategory,
                  severity: incSeverity,
                  description: incDesc,
                });
                setIncDesc('');
              }}
              className="mt-4 space-y-3"
            >
              <div className="grid grid-cols-2 gap-2.5">
                <select
                  value={incCategory}
                  onChange={(e) => setIncCategory(e.target.value as IncidentRecord['category'])}
                  className="rounded-xl border border-black/[0.1] bg-[#F8F7F4] px-3 py-2 text-xs"
                >
                  <option value="vehicle_overstay">Vehicle Overstay</option>
                  <option value="access_blocked">Gate Access Blocked</option>
                  <option value="safety_hazard">Safety / Hazard</option>
                  <option value="other">Other</option>
                </select>
                <select
                  value={incSeverity}
                  onChange={(e) => setIncSeverity(e.target.value as IncidentRecord['severity'])}
                  className="rounded-xl border border-black/[0.1] bg-[#F8F7F4] px-3 py-2 text-xs"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
              <textarea
                rows={3}
                required
                value={incDesc}
                onChange={(e) => setIncDesc(e.target.value)}
                placeholder="Describe vehicle plate, overstay minutes, or gate obstruction..."
                className="w-full rounded-xl border border-black/[0.1] bg-[#F8F7F4] px-3.5 py-2 text-xs"
              />
              <button
                type="submit"
                className="w-full rounded-xl bg-[#111827] px-4 py-2 text-xs font-bold text-white"
              >
                Submit Incident to Ops
              </button>
            </form>

            <div className="mt-4 space-y-2 border-t border-black/[0.06] pt-3">
              {incidents.slice(0, 3).map((inc) => (
                <div key={inc.id} className="text-xs text-[#374151]">
                  <strong className="font-mono text-[#111827]">{inc.id}</strong> ({inc.status}):{' '}
                  {inc.description}
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
};
