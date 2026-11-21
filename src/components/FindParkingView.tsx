import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bike,
  Bot,
  Car,
  CheckCircle2,
  ChevronDown,
  Clock,
  MapPin,
  Radio,
  Search,
  ShieldAlert,
  ShieldCheck,
  Star,
  UserCheck,
  X,
  Zap,
} from 'lucide-react';
import { motion } from 'motion/react';
import {
  AgentStageResult,
  AgentStreamEvent,
  BengaluruLocation,
  BookingRecord,
  CandidateEvaluation,
  DriverProfile,
  Facility,
  MultiAgentWorkflowRun,
  ParkingSpace,
  SupervisorVerdict,
  VehicleProfile,
  WheelerCategory,
} from '../types/parkpool';
import { BengaluruLiveMap } from './BengaluruLiveMap';

interface FindParkingViewProps {
  locations: BengaluruLocation[];
  facilities: Facility[];
  spaces: ParkingSpace[];
  bookings: BookingRecord[];
  vehicles: VehicleProfile[];
  selectedVehicleId: string;
  driverProfile?: DriverProfile;
  onSelectVehicle: (id: string) => void;
  onSelectLocation: (loc: BengaluruLocation) => Promise<void>;
  onCreateHold: (params: {
    spaceId: string;
    vehicleId: string;
    startMin: number;
    endMin: number;
  }) => Promise<void>;
  onNavigateDashboard: () => void;
  onOpenProfile: () => void;
}

function calcPedestrianMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.max(80, Math.round((R * c * 1.2) / 10) * 10);
}

function formatDist(meters: number, minutes: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km away`;
  return `${meters}m (${minutes} min)`;
}

const TIME_OPTIONS = Array.from({ length: 36 }, (_, i) => {
  const min = 6 * 60 + i * 30;
  const h24 = Math.floor(min / 60);
  const m = min % 60;
  const period = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return {
    min,
    hhmm: `${String(h24).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
    label: `${h12}:${String(m).padStart(2, '0')} ${period}`,
  };
});

const FILTER_MODES = [
  { id: 'all', label: 'All Verified' },
  { id: 'covered', label: 'Covered' },
  { id: 'ev', label: 'EV Charging' },
  { id: 'lowest', label: 'Lowest Price' },
] as const;

const AGENT_STEPS = [
  { order: 1, title: 'Intent' },
  { order: 2, title: 'Location' },
  { order: 3, title: 'Fit & Pool' },
  { order: 4, title: 'Pricing' },
  { order: 5, title: 'Booking' },
];

function fmt(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function fmt12(min: number): string {
  const h24 = Math.floor(min / 60);
  const m = min % 60;
  const period = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

export const FindParkingView: React.FC<FindParkingViewProps> = ({
  locations,
  facilities,
  spaces,
  bookings,
  vehicles,
  selectedVehicleId,
  driverProfile,
  onSelectVehicle,
  onSelectLocation,
  onCreateHold,
  onNavigateDashboard,
  onOpenProfile,
}) => {
  const defaultLoc = locations[0] || {
    id: 'LOC-PHX',
    name: 'Phoenix Mall of Asia',
    area: 'Hebbal / Byatarayanapura',
    lat: 13.0766,
    lng: 77.5944,
    source: 'hub',
  };

  const [activeLocation, setActiveLocation] = useState<BengaluruLocation>(defaultLoc);
  const [locationQuery, setLocationQuery] = useState(defaultLoc.name);
  const [locationResults, setLocationResults] = useState<BengaluruLocation[]>(locations);
  const [locationDropdownOpen, setLocationDropdownOpen] = useState(false);
  const [searchingLocations, setSearchingLocations] = useState(false);
  const locationBoxRef = useRef<HTMLDivElement | null>(null);

  const [startMin, setStartMin] = useState(14 * 60);
  const [endMin, setEndMin] = useState(17 * 60 + 30);
  const [filterMode, setFilterMode] = useState<'all' | 'covered' | 'ev' | 'lowest'>('all');
  const [selectedFacilityId, setSelectedFacilityId] = useState<string>('FAC-01');

  useEffect(() => {
    const onOutsideClick = (e: MouseEvent) => {
      if (locationBoxRef.current && !locationBoxRef.current.contains(e.target as Node)) {
        setLocationDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', onOutsideClick);
    return () => document.removeEventListener('mousedown', onOutsideClick);
  }, []);

  useEffect(() => {
    const q = locationQuery.trim();
    if (!locationDropdownOpen) return;
    if (!q || q === activeLocation.name) {
      setLocationResults(locations);
      return;
    }

    const timer = window.setTimeout(async () => {
      setSearchingLocations(true);
      try {
        const res = await fetch(`/api/locations/search?q=${encodeURIComponent(q)}`);
        if (res.ok) {
          const data = (await res.json()) as { results: BengaluruLocation[] };
          setLocationResults(data.results);
        }
      } finally {
        setSearchingLocations(false);
      }
    }, 260);

    return () => window.clearTimeout(timer);
  }, [locationQuery, locationDropdownOpen, locations, activeLocation.name]);

  const handleSelectLocation = async (loc: BengaluruLocation) => {
    setActiveLocation(loc);
    setLocationQuery(loc.name);
    setLocationDropdownOpen(false);
    await onSelectLocation(loc);
  };

  const currentVehicle = vehicles.find((v) => v.id === selectedVehicleId) || vehicles[0];
  const [wheelerCategory, setWheelerCategory] = useState<WheelerCategory>(
    currentVehicle?.wheelerCategory || driverProfile?.wheelerCategory || 'four_wheeler'
  );

  const filteredVehicles = useMemo(
    () => vehicles.filter((v) => v.wheelerCategory === wheelerCategory),
    [vehicles, wheelerCategory]
  );

  // Keep selected vehicle synced with chosen 2W / 4W category
  const vehicle =
    filteredVehicles.find((v) => v.id === selectedVehicleId) ||
    filteredVehicles[0] ||
    currentVehicle;

  const handleWheelerSwitch = (category: WheelerCategory) => {
    setWheelerCategory(category);
    const matching = vehicles.filter((v) => v.wheelerCategory === category);
    if (matching.length > 0) {
      const ownRegistered = driverProfile
        ? matching.find((m) => m.id === driverProfile.registeredVehicleId)
        : undefined;
      onSelectVehicle((ownRegistered || matching[0]).id);
    }
  };

  // Half-Page Verification Checkout Drawer (appears when user clicks Book Now)
  const [checkoutDrawerOpen, setCheckoutDrawerOpen] = useState(false);
  const [targetBay, setTargetBay] = useState<CandidateEvaluation | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [activeStage, setActiveStage] = useState<number | null>(null);
  const [completedStages, setCompletedStages] = useState<Record<number, AgentStageResult>>({});
  const [supervisorNote, setSupervisorNote] = useState<{
    verdict: SupervisorVerdict | 'CHECKING';
    text: string;
  }>({ verdict: 'CHECKING', text: 'Checking bay availability and rules...' });
  const [finalRun, setFinalRun] = useState<MultiAgentWorkflowRun | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const activeSlot = useMemo(
    () => ({
      startMin,
      endMin,
      start: fmt(startMin),
      end: fmt(endMin),
      label: `${fmt12(startMin)} – ${fmt12(endMin)}`,
    }),
    [startMin, endMin]
  );

  const handleStartChange = (newStart: number) => {
    setStartMin(newStart);
    if (endMin <= newStart) {
      setEndMin(Math.min(23 * 60 + 30, newStart + 180));
    }
  };

  const evaluatedList = useMemo<CandidateEvaluation[]>(() => {
    const wheelerMatchedSpaces = spaces.filter((space) =>
      space.publicationStatus === 'approved' &&
      (wheelerCategory === 'two_wheeler'
        ? space.allowedTypes.includes('two_wheeler')
        : space.allowedTypes.some((t) => t !== 'two_wheeler'))
    );

    const raw = wheelerMatchedSpaces.map((space) => {
      const fac = facilities.find((f) => f.id === space.facilityId);
      if (!fac) return null;
      const rejectionReasons: string[] = [];

      const authOk = fac.verificationStatus === 'verified' && fac.operationalChecksPassed;
      if (!authOk) rejectionReasons.push('Pending verification');

      const vehicleOk =
        space.allowedTypes.includes(vehicle.vehicleType) &&
        vehicle.lengthCm <= space.maxLengthCm &&
        vehicle.widthCm <= space.maxWidthCm &&
        vehicle.heightCm <= space.maxHeightCm;
      if (!vehicleOk) rejectionReasons.push('Too small for selected vehicle');

      const opsOk =
        activeSlot.startMin >= space.operatingStartMin &&
        activeSlot.endMin <= space.hardDepartureMin;
      if (!opsOk) rejectionReasons.push(`Closes ${fmt(space.hardDepartureMin)}`);

      const activeBks = bookings.filter(
        (b) =>
          b.spaceId === space.id &&
          (b.status === 'held' || b.status === 'confirmed' || b.status === 'occupied')
      );
      const bkConflict = activeBks.find(
        (b) =>
          activeSlot.startMin < b.endMin + space.bufferMinutes &&
          activeSlot.endMin > b.startMin - space.bufferMinutes
      );
      if (bkConflict) rejectionReasons.push(`Booked ${fmt(bkConflict.startMin)}–${fmt(bkConflict.endMin)}`);

      const ownerConflict = space.ownerBlocks.find(
        (ob) =>
          activeSlot.startMin < ob.endMin &&
          activeSlot.endMin > ob.startMin - space.bufferMinutes
      );
      if (ownerConflict) rejectionReasons.push(`Owner reserved from ${fmt(ownerConflict.startMin)}`);

      const eligible = authOk && vehicleOk && opsOk && !bkConflict && !ownerConflict;
      const hours = Math.max(0.5, (activeSlot.endMin - activeSlot.startMin) / 60);
      const base = Math.round(hours * space.hourlyPriceInr);
      const fee = Math.max(10, Math.round(base * 0.1));
      const gst = Math.round((base + fee) * 0.18);
      const totalQuoteInr = base + fee + gst;

      const avgRating =
        space.reviews.length > 0
          ? Number(
              (space.reviews.reduce((a, r) => a + r.rating, 0) / space.reviews.length).toFixed(1)
            )
          : 4.5;

      const dynamicDistM = calcPedestrianMeters(
        activeLocation.lat,
        activeLocation.lng,
        fac.entranceLat,
        fac.entranceLng
      );
      const dynamicWalkMin = Math.max(2, Math.round(dynamicDistM / 75));

      return {
        spaceId: space.id,
        facilityId: fac.id,
        facilityName: fac.name,
        spaceCode: space.spaceCode,
        providerType: fac.providerType,
        verificationStatus: fac.verificationStatus,
        eligible,
        rejectionReasons,
        constraintChecks: [],
        walkingDistanceM: dynamicDistM,
        walkingMinutes: dynamicWalkMin,
        entranceLabel: fac.entranceLabel,
        hourlyPriceInr: space.hourlyPriceInr,
        totalQuoteInr,
        score: eligible ? Math.max(10, Math.round(100 - dynamicDistM * 0.02)) : 0,
        scoreBreakdown: {
          distanceFit: 0,
          priceFit: 0,
          safetyAmenityFit: 0,
          reviewFit: 0,
          availabilityFit: eligible ? 100 : 0,
        },
        covered: space.covered,
        evCharging: space.evCharging,
        avgRating,
        reviewCount: space.reviews.length,
        evidenceSummary: fac.walkPathSafety,
        restrictions: space.restrictions.length > 0 ? space.restrictions : fac.restrictions,
        lateArrivalSummary: fac.lateArrivalPolicy?.summary,
      };
    }).filter((c): c is NonNullable<typeof c> => c !== null);

    const filtered = raw.filter((c) => {
      if (c.verificationStatus !== 'verified') return false;
      if (filterMode === 'covered' && !c.covered) return false;
      if (filterMode === 'ev' && !c.evCharging) return false;
      return true;
    });

    const sorted = filtered.sort((a, b) => {
      if (filterMode === 'lowest') {
        return Number(b.eligible) - Number(a.eligible) || a.hourlyPriceInr - b.hourlyPriceInr;
      }
      return Number(b.eligible) - Number(a.eligible) || a.walkingDistanceM - b.walkingDistanceM;
    });

    const withinCluster = sorted.filter((c) => c.walkingDistanceM <= 1800);
    return withinCluster.length >= 5 ? withinCluster : sorted.slice(0, Math.max(6, withinCluster.length));
  }, [spaces, facilities, bookings, vehicle, wheelerCategory, activeSlot, filterMode, activeLocation]);

  const nearbyFacilities = useMemo(() => {
    const evalFacIds = new Set(evaluatedList.map((e) => e.facilityId));
    const matched = facilities.filter(
      (f) => f.verificationStatus === 'verified' && evalFacIds.has(f.id)
    );
    if (matched.length >= 5) return matched;
    return [...facilities]
      .filter((f) => f.verificationStatus === 'verified')
      .sort(
        (a, b) =>
          calcPedestrianMeters(activeLocation.lat, activeLocation.lng, a.entranceLat, a.entranceLng) -
          calcPedestrianMeters(activeLocation.lat, activeLocation.lng, b.entranceLat, b.entranceLng)
      )
      .slice(0, 6);
  }, [facilities, evaluatedList, activeLocation]);

  const distinctFacilityCount = useMemo(
    () => new Set(evaluatedList.map((e) => e.facilityId)).size,
    [evaluatedList]
  );

  useEffect(() => {
    if (evaluatedList.length === 0) return;
    if (!evaluatedList.some((e) => e.facilityId === selectedFacilityId)) {
      const firstEligible = evaluatedList.find((e) => e.eligible) || evaluatedList[0];
      setSelectedFacilityId(firstEligible.facilityId);
    }
  }, [evaluatedList, selectedFacilityId]);

  const startBookingVerification = async (bay: CandidateEvaluation) => {
    setTargetBay(bay);
    setSelectedFacilityId(bay.facilityId);
    setCheckoutDrawerOpen(true);
    setVerifying(true);
    setVerifyError(null);
    setFinalRun(null);
    setCompletedStages({});
    setActiveStage(1);
    setSupervisorNote({
      verdict: 'CHECKING',
      text: `Verifying ${bay.facilityName} (${bay.spaceCode}) for ${vehicle.label}...`,
    });

    try {
      const response = await fetch('/api/agents/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `Book ${bay.spaceCode} at ${bay.facilityName} near ${activeLocation.name} from ${activeSlot.start} to ${activeSlot.end}.`,
          vehicleId: vehicle.id,
          defaultStartTime: activeSlot.start,
          defaultEndTime: activeSlot.end,
          faultInjectionEnabled: false,
          targetSpaceId: bay.spaceId,
          destinationCoords: { lat: activeLocation.lat, lng: activeLocation.lng },
        }),
      });

      if (!response.ok || !response.body) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody.error || 'Verification service failed');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split('\n\n');
        buffer = frames.pop() ?? '';

        for (const frame of frames) {
          const line = frame.trim();
          if (!line.startsWith('data:')) continue;
          const jsonStr = line.slice(5).trim();
          if (!jsonStr) continue;
          const ev: AgentStreamEvent = JSON.parse(jsonStr);

          if (ev.type === 'stage_start') {
            setActiveStage(ev.stageOrder);
            setSupervisorNote({ verdict: 'CHECKING', text: ev.message });
          } else if (ev.type === 'supervisor_check') {
            setSupervisorNote({ verdict: ev.verdict, text: ev.message });
          } else if (ev.type === 'stage_complete') {
            setCompletedStages((prev) => ({ ...prev, [ev.stage.stageOrder]: ev.stage }));
          } else if (ev.type === 'workflow_complete') {
            setFinalRun(ev.run);
            setActiveStage(null);
          } else if (ev.type === 'workflow_error') {
            throw new Error(ev.error);
          }
        }
      }
    } catch (err: unknown) {
      setVerifyError(err instanceof Error ? err.message : 'Unable to verify booking');
      setActiveStage(null);
    } finally {
      setVerifying(false);
    }
  };

  const handleConfirmBooking = async () => {
    if (!targetBay) return;
    setConfirming(true);
    try {
      await onCreateHold({
        spaceId: targetBay.spaceId,
        vehicleId: vehicle.id,
        startMin: activeSlot.startMin,
        endMin: activeSlot.endMin,
      });
      setCheckoutDrawerOpen(false);
      onNavigateDashboard();
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Vibrant Ride/Food App Search Bar */}
      <section className="rounded-2xl border border-black/[0.08] bg-white/92 p-3.5 shadow-sm backdrop-blur-md sm:p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-12">
          <div className="sm:col-span-2 lg:col-span-4" ref={locationBoxRef}>
            <label htmlFor="find-dest" className="mb-1 block text-xs font-semibold text-[#4B5563]">
              Location in Bengaluru
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[#C83709]" />
              <input
                id="find-dest"
                type="text"
                value={locationQuery}
                onFocus={() => {
                  setLocationResults(locations);
                  setLocationDropdownOpen(true);
                }}
                onChange={(e) => {
                  setLocationQuery(e.target.value);
                  setLocationDropdownOpen(true);
                }}
                placeholder="Search Indiranagar, MG Road, Cubbon Park..."
                className="w-full rounded-xl border border-black/[0.1] bg-[#F8F7F4] py-2 pl-9 pr-8 text-sm font-medium text-[#111827] focus:border-[#D93F0B] focus:bg-white focus:outline-none"
              />
              <button
                type="button"
                aria-label="Browse Bengaluru locations"
                onClick={() => {
                  setLocationResults(locations);
                  setLocationDropdownOpen((o) => !o);
                }}
                className="absolute right-2.5 top-2.5 text-[#4B5563] hover:text-[#111827]"
              >
                <ChevronDown className="h-4 w-4" />
              </button>

              {locationDropdownOpen && (
                <div className="absolute left-0 right-0 z-40 mt-1.5 max-h-64 overflow-y-auto rounded-xl border border-black/[0.08] bg-white p-1.5 shadow-xl">
                  <div className="px-2.5 py-1 text-[11px] font-semibold text-[#4B5563]">
                    {searchingLocations
                      ? 'Searching Bengaluru map...'
                      : 'Bengaluru Hubs & Map Places'}
                  </div>
                  {locationResults.length === 0 ? (
                    <div className="px-3 py-2.5 text-xs text-[#4B5563]">
                      No matching Bengaluru location found. Try another road or area.
                    </div>
                  ) : (
                    locationResults.map((loc) => (
                      <button
                        key={loc.id}
                        type="button"
                        onClick={() => void handleSelectLocation(loc)}
                        className={`flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors hover:bg-[#FFF0EA] ${
                          activeLocation.id === loc.id ? 'bg-[#FFF0EA]' : ''
                        }`}
                      >
                        <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#C83709]" />
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-[#111827]">{loc.name}</div>
                          <div className="truncate text-[11px] text-[#4B5563]">{loc.area}</div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-4">
            <span className="mb-1 block text-xs font-semibold text-[#4B5563]">
              Wheeler Type
            </span>
            <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-black/[0.08] bg-[#F3F2EE] p-1">
              <button
                type="button"
                onClick={() => handleWheelerSwitch('two_wheeler')}
                className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-bold transition-colors ${
                  wheelerCategory === 'two_wheeler'
                    ? 'bg-gradient-to-r from-[#E0430D] to-[#C83709] text-white shadow-sm'
                    : 'text-[#4B5563] hover:text-[#111827]'
                }`}
              >
                <Bike className="h-3.5 w-3.5" />
                <span>2-Wheeler</span>
              </button>
              <button
                type="button"
                onClick={() => handleWheelerSwitch('four_wheeler')}
                className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-bold transition-colors ${
                  wheelerCategory === 'four_wheeler'
                    ? 'bg-gradient-to-r from-[#E0430D] to-[#C83709] text-white shadow-sm'
                    : 'text-[#4B5563] hover:text-[#111827]'
                }`}
              >
                <Car className="h-3.5 w-3.5" />
                <span>4-Wheeler</span>
              </button>
            </div>
          </div>

          <div className="lg:col-span-4">
            <label htmlFor="find-vehicle" className="mb-1 block text-xs font-semibold text-[#4B5563]">
              Select Vehicle
            </label>
            <select
              id="find-vehicle"
              value={vehicle.id}
              onChange={(e) => onSelectVehicle(e.target.value)}
              className="w-full rounded-xl border border-black/[0.1] bg-[#F8F7F4] px-3 py-2 text-sm font-medium text-[#111827] focus:border-[#D93F0B] focus:bg-white focus:outline-none"
            >
              {filteredVehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>

          {/* Flexible Custom Time Range Row */}
          <div className="sm:col-span-2 lg:col-span-12">
            <div className="flex flex-col gap-2.5 rounded-xl border border-[#FED7AA]/70 bg-[#FFF8F4] p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[#111827]">
                <Clock className="h-4 w-4 text-[#C83709]" />
                <span>Parking Time Range</span>
              </div>

              <div className="grid flex-1 grid-cols-2 gap-2.5 sm:flex sm:flex-none sm:items-center sm:gap-3">
                <div className="flex items-center gap-1.5">
                  <label htmlFor="find-start" className="text-xs font-medium text-[#4B5563]">
                    From
                  </label>
                  <select
                    id="find-start"
                    value={startMin}
                    onChange={(e) => handleStartChange(Number(e.target.value))}
                    className="w-full rounded-lg border border-black/[0.1] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#111827] focus:border-[#D93F0B] focus:outline-none sm:w-auto"
                  >
                    {TIME_OPTIONS.slice(0, -1).map((opt) => (
                      <option key={opt.min} value={opt.min}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-1.5">
                  <label htmlFor="find-end" className="text-xs font-medium text-[#4B5563]">
                    To
                  </label>
                  <select
                    id="find-end"
                    value={endMin}
                    onChange={(e) => setEndMin(Number(e.target.value))}
                    className="w-full rounded-lg border border-black/[0.1] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#111827] focus:border-[#D93F0B] focus:outline-none sm:w-auto"
                  >
                    {TIME_OPTIONS.filter((opt) => opt.min > startMin).map((opt) => (
                      <option key={opt.min} value={opt.min}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-col gap-2.5 border-t border-black/[0.06] pt-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-1.5">
            {FILTER_MODES.map((m) => {
              const active = filterMode === m.id;
              const activeClass =
                m.id === 'ev'
                  ? 'bg-[#047857] text-white'
                  : m.id === 'covered'
                  ? 'bg-[#4338CA] text-white'
                  : m.id === 'lowest'
                  ? 'bg-[#C83709] text-white'
                  : 'bg-[#111827] text-white';
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setFilterMode(m.id)}
                  className={`whitespace-nowrap shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                    active ? activeClass : 'bg-[#F3F2EE] text-[#374151] hover:bg-black/[0.08]'
                  }`}
                >
                  {m.label}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs">
            {driverProfile ? (
              <button
                type="button"
                onClick={onOpenProfile}
                className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 font-semibold text-[#047857] hover:border-emerald-300"
              >
                <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-[#047857]" />
                <span className="truncate">
                  DL: {driverProfile.licenseNumber} · {driverProfile.plateNumber}
                </span>
                <span className="underline">Edit</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onOpenProfile}
                className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 font-semibold text-amber-900 hover:border-[#D93F0B]"
              >
                <UserCheck className="h-3.5 w-3.5 shrink-0 text-amber-700" />
                <span>Register License & Vehicle Number</span>
              </button>
            )}
            <span className="font-semibold text-[#047857]">
              {evaluatedList.filter((e) => e.eligible).length} spaces available
            </span>
          </div>
        </div>
      </section>

      {/* Main Split: Live Map + Vibrant Ride-App Parking Cards */}
      <div className="grid grid-cols-1 items-stretch gap-5 lg:grid-cols-12">
        <div className="min-h-[340px] sm:min-h-[400px] lg:col-span-7 lg:min-h-[450px]">
          <BengaluruLiveMap
            destinationName={activeLocation.name}
            destinationCoords={{ lat: activeLocation.lat, lng: activeLocation.lng }}
            facilities={nearbyFacilities}
            selectedFacilityId={selectedFacilityId}
            onSelectFacility={setSelectedFacilityId}
            evaluations={evaluatedList}
          />
        </div>

        <div className="flex flex-col rounded-2xl border border-black/[0.08] bg-white/92 p-4 shadow-sm backdrop-blur-md lg:col-span-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="truncate font-display text-base font-bold text-[#111827]">
              Near {activeLocation.name}
            </h2>
            <span className="shrink-0 text-xs font-bold text-[#C83709]">
              {distinctFacilityCount} locations
            </span>
          </div>

          <div className="flex-1 space-y-3 lg:max-h-[440px] lg:overflow-y-auto lg:pr-1">
            {evaluatedList.map((cand) => {
              const isSelected = cand.facilityId === selectedFacilityId;
              return (
                <div
                  key={cand.spaceId}
                  onClick={() => setSelectedFacilityId(cand.facilityId)}
                  className={`cursor-pointer rounded-xl border p-4 transition-all hover:-translate-y-0.5 ${
                    isSelected
                      ? 'border-[#D93F0B] bg-[#FFF8F5] ring-1 ring-[#D93F0B]'
                      : 'border-black/[0.08] bg-white hover:border-[#FDBA74]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate font-display text-sm font-bold text-[#111827]">
                        {cand.facilityName}
                      </h3>
                      <div className="mt-0.5 text-xs text-[#4B5563]">{cand.spaceCode}</div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-[#374151]">
                        <span className="flex items-center gap-1 font-semibold text-[#111827]">
                          <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                          {cand.avgRating}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5 text-[#C83709]" />
                          {formatDist(cand.walkingDistanceM, cand.walkingMinutes)}
                        </span>
                        {cand.covered && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-medium text-[#4338CA]">Covered</span>
                          </>
                        )}
                        {cand.evCharging && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="flex items-center gap-0.5 font-semibold text-[#047857]">
                              <Zap className="h-3 w-3" /> EV
                            </span>
                          </>
                        )}
                      </div>
                      <div className="mt-1 truncate text-[11px] text-[#4B5563]">
                        {cand.entranceLabel}
                        {cand.restrictions && cand.restrictions.length > 0
                          ? ` · ${cand.restrictions[0]}`
                          : ''}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="font-mono text-lg font-extrabold tabular-nums text-[#111827]">
                        ₹{cand.hourlyPriceInr}
                        <span className="text-xs font-normal text-[#4B5563]">/hr</span>
                      </div>
                      <div className="font-mono text-[11px] font-medium text-[#4B5563]">
                        Total ₹{cand.totalQuoteInr}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-2 border-t border-black/[0.06] pt-3">
                    {cand.eligible ? (
                      <span className="flex items-center gap-1 text-xs font-semibold text-[#047857]">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Instant Confirmation
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs font-medium text-rose-600">
                        <Clock className="h-3.5 w-3.5" />
                        {cand.rejectionReasons[0]}
                      </span>
                    )}

                    <button
                      type="button"
                      disabled={!cand.eligible}
                      onClick={(e) => {
                        e.stopPropagation();
                        void startBookingVerification(cand);
                      }}
                      className={`whitespace-nowrap shrink-0 rounded-lg px-4 py-1.5 text-xs font-bold transition-all ${
                        cand.eligible
                          ? 'bg-gradient-to-r from-[#E0430D] to-[#C83709] text-white shadow-sm hover:brightness-110'
                          : 'cursor-not-allowed bg-[#F3F2EE] text-[#9CA3AF]'
                      }`}
                    >
                      Book Now
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Half-Page Booking Verification Drawer (Triggered automatically on Book Now) */}
      {checkoutDrawerOpen && targetBay && (
        <motion.section
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22 }}
          className="rounded-2xl border-2 border-[#D93F0B] bg-white/95 p-5 shadow-xl backdrop-blur-xl"
        >
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-black/[0.06] pb-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#4338CA] to-[#C83709] text-white shadow-sm">
                <Bot className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-display text-base font-bold text-[#111827]">
                  Booking Check · {targetBay.facilityName}
                </h3>
                <p className="text-xs text-[#4B5563]">
                  {targetBay.spaceCode} · {activeSlot.label} · {vehicle.label}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setCheckoutDrawerOpen(false)}
              aria-label="Close booking verification"
              className="rounded-lg border border-black/[0.08] p-1.5 text-[#4B5563] hover:text-[#111827]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {verifyError && (
            <div className="mb-4 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
              <ShieldAlert className="h-4 w-4 shrink-0 text-rose-600" />
              <span>{verifyError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
            {/* Live Agent & Supervisor Progress */}
            <div className="space-y-3 lg:col-span-7">
              <div
                className={`rounded-xl border p-3.5 ${
                  supervisorNote.verdict === 'VERIFIED'
                    ? 'border-emerald-200 bg-emerald-50'
                    : supervisorNote.verdict === 'FLAGGED_AND_CORRECTED'
                    ? 'border-amber-200 bg-amber-50'
                    : 'border-indigo-200 bg-indigo-50/80'
                }`}
              >
                <div className="flex items-center gap-2 text-xs font-bold text-[#111827]">
                  {verifying ? (
                    <Radio className="h-4 w-4 animate-spin text-[#4338CA]" />
                  ) : (
                    <ShieldCheck className="h-4 w-4 text-[#047857]" />
                  )}
                  <span>Supervisor Verification</span>
                </div>
                <p className="mt-1 text-xs text-[#374151]">{supervisorNote.text}</p>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {AGENT_STEPS.map((st) => {
                  const isActive = activeStage === st.order;
                  const done = completedStages[st.order];
                  return (
                    <div
                      key={st.order}
                      className={`rounded-xl border p-2.5 text-center ${
                        isActive
                          ? 'border-[#D93F0B] bg-[#FFF0EA]'
                          : done
                          ? 'border-emerald-300 bg-emerald-50/80'
                          : 'border-black/[0.06] bg-[#F8F7F4]'
                      }`}
                    >
                      <div className="flex justify-center">
                        {done ? (
                          <CheckCircle2 className="h-4 w-4 text-[#047857]" />
                        ) : isActive ? (
                          <Radio className="h-4 w-4 animate-spin text-[#C83709]" />
                        ) : (
                          <Clock className="h-4 w-4 text-[#9CA3AF]" />
                        )}
                      </div>
                      <div className="mt-1 text-xs font-semibold text-[#111827]">{st.title}</div>
                    </div>
                  );
                })}
              </div>

              {finalRun && (
                <p className="text-xs leading-relaxed text-[#374151]">
                  {finalRun.supervisorFinalReport}
                </p>
              )}
            </div>

            {/* Book with Confidence Summary Box */}
            <div className="flex flex-col justify-between rounded-xl border border-black/[0.08] bg-[#F8F7F4] p-4 lg:col-span-5">
              <div className="space-y-2 text-xs">
                <div className="font-display text-sm font-bold text-[#111827]">
                  Price & Gate Summary
                </div>
                <div className="flex justify-between text-[#374151]">
                  <span>Vehicle & Plate</span>
                  <span className="font-mono font-semibold text-[#111827]">
                    {vehicle.plateNumber}
                  </span>
                </div>
                {driverProfile && (
                  <div className="flex justify-between text-[#374151]">
                    <span>Driver License</span>
                    <span className="font-mono font-semibold text-[#047857]">
                      {driverProfile.licenseNumber}
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-[#374151]">
                  <span>Gate Entrance</span>
                  <span className="font-semibold text-[#111827]">{targetBay.entranceLabel}</span>
                </div>
                <div className="flex justify-between text-[#374151]">
                  <span>Walk to Destination</span>
                  <span className="font-semibold text-[#C83709]">
                    {targetBay.walkingDistanceM}m ({targetBay.walkingMinutes} min)
                  </span>
                </div>
                {targetBay.lateArrivalSummary && (
                  <div className="rounded-lg border border-black/[0.06] bg-white px-2.5 py-2 text-[11px] text-[#4B5563]">
                    <span className="font-semibold text-[#111827]">Arrival & Restrictions: </span>
                    {targetBay.lateArrivalSummary}
                    {targetBay.restrictions && targetBay.restrictions.length > 0
                      ? ` · ${targetBay.restrictions.join(' · ')}`
                      : ''}
                  </div>
                )}
                <div className="flex justify-between border-t border-black/[0.08] pt-2 text-sm font-bold text-[#111827]">
                  <span>Total (incl. fees & GST)</span>
                  <span className="font-mono tabular-nums">₹{targetBay.totalQuoteInr}</span>
                </div>
              </div>

              <button
                type="button"
                disabled={verifying || confirming || Boolean(verifyError)}
                onClick={() => void handleConfirmBooking()}
                className="mt-4 w-full rounded-xl bg-gradient-to-r from-[#E0430D] to-[#C83709] px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {verifying
                  ? 'Verifying Availability...'
                  : confirming
                  ? 'Confirming...'
                  : `Confirm & Reserve ₹${targetBay.totalQuoteInr}`}
              </button>
            </div>
          </div>
        </motion.section>
      )}
    </div>
  );
};
