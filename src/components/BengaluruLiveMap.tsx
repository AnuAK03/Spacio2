import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Footprints, Navigation, ShieldCheck } from 'lucide-react';
import { CandidateEvaluation, Facility } from '../types/parkpool';

interface BengaluruLiveMapProps {
  destinationName: string;
  destinationCoords: { lat: number; lng: number };
  facilities: Facility[];
  selectedFacilityId: string;
  onSelectFacility: (id: string) => void;
  evaluations?: CandidateEvaluation[];
}

function formatDistanceLabel(meters: number, minutes: number): string {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)} km away`;
  }
  return `${meters}m (${minutes} min walk)`;
}

export const BengaluruLiveMap: React.FC<BengaluruLiveMapProps> = ({
  destinationName,
  destinationCoords,
  facilities,
  selectedFacilityId,
  onSelectFacility,
  evaluations = [],
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const prevDestRef = useRef<string>('');

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [destinationCoords.lat, destinationCoords.lng],
      zoom: 15,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map);

    const layerGroup = L.layerGroup().addTo(map);
    mapRef.current = map;
    layerGroupRef.current = layerGroup;
    prevDestRef.current = `${destinationCoords.lat},${destinationCoords.lng}`;

    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
      layerGroupRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const key = `${destinationCoords.lat},${destinationCoords.lng}`;
    if (prevDestRef.current && prevDestRef.current !== key) {
      map.flyTo([destinationCoords.lat, destinationCoords.lng], 15, { duration: 0.7 });
      prevDestRef.current = key;
    }
  }, [destinationCoords.lat, destinationCoords.lng]);

  useEffect(() => {
    const map = mapRef.current;
    const group = layerGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();

    // 500m comfortable walk circle around chosen Bengaluru location
    L.circle([destinationCoords.lat, destinationCoords.lng], {
      radius: 500,
      color: '#D93F0B',
      weight: 1.5,
      dashArray: '5 5',
      fillColor: '#FF5A1F',
      fillOpacity: 0.06,
    }).addTo(group);

    const shortDest =
      destinationName.length > 24 ? `${destinationName.slice(0, 22)}…` : destinationName;

    const hubIcon = L.divIcon({
      className: 'parkpool-dest-pin',
      html: `<div style="background:#111827;color:#FFFFFF;padding:5px 11px;border-radius:999px;font-weight:700;font-size:11px;white-space:nowrap;border:2px solid #FF5A1F;box-shadow:0 6px 16px rgba(17,24,39,0.28);">${shortDest}</div>`,
      iconSize: [140, 26],
      iconAnchor: [70, 13],
    });
    L.marker([destinationCoords.lat, destinationCoords.lng], { icon: hubIcon }).addTo(group);

    // Vibrant Ride/Delivery App P Location Pins
    facilities.forEach((fac) => {
      const facEvals = evaluations.filter((e) => e.facilityId === fac.id);
      const bestEval = facEvals.find((e) => e.eligible) || facEvals[0];
      const isPending = fac.verificationStatus !== 'verified';
      const isSelected = fac.id === selectedFacilityId;

      const bg = isPending
        ? '#DC2626'
        : isSelected
        ? '#C83709'
        : bestEval?.evCharging
        ? '#047857'
        : '#4338CA';
      const priceText = isPending
        ? 'Pending'
        : bestEval
        ? `₹${bestEval.hourlyPriceInr}/hr`
        : `${fac.walkingDistanceM}m`;

      const pinIcon = L.divIcon({
        className: 'parkpool-p-pin',
        html: `<div style="display:flex;align-items:center;gap:5px;background:${bg};color:#FFFFFF;padding:4px 9px 4px 5px;border-radius:999px;font-weight:700;font-size:11px;white-space:nowrap;border:2px solid #FFFFFF;box-shadow:0 4px 14px rgba(17,24,39,0.26);cursor:pointer;">
          <span style="display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:999px;background:#FFFFFF;color:${bg};font-weight:800;font-size:11px;">P</span>
          <span>${priceText}</span>
        </div>`,
        iconSize: [88, 28],
        iconAnchor: [44, 14],
      });

      const distM = bestEval ? bestEval.walkingDistanceM : fac.walkingDistanceM;
      const distMin = bestEval ? bestEval.walkingMinutes : fac.walkingMinutes;

      const marker = L.marker([fac.lat, fac.lng], { icon: pinIcon }).addTo(group);
      marker.on('click', () => onSelectFacility(fac.id));
      marker.bindPopup(
        `<div style="font-size:12px;min-width:170px;">
          <div style="font-weight:700;color:#111827;">${fac.name}</div>
          <div style="color:#4B5563;margin-top:2px;">${formatDistanceLabel(distM, distMin)}</div>
          <div style="color:#C83709;font-weight:600;margin-top:2px;">Gate: ${fac.entranceLabel}</div>
        </div>`
      );

      if (isSelected) {
        const dynamicRoute: [number, number][] = [
          [fac.lat, fac.lng],
          [fac.entranceLat, fac.entranceLng],
          [destinationCoords.lat, destinationCoords.lng],
        ];
        L.polyline(dynamicRoute, {
          color: isPending ? '#DC2626' : '#D93F0B',
          weight: 4,
          dashArray: '8 6',
          className: 'walk-route-animated',
        }).addTo(group);
      }
    });
  }, [
    facilities,
    evaluations,
    selectedFacilityId,
    destinationCoords,
    destinationName,
    onSelectFacility,
  ]);

  const activeFac = facilities.find((f) => f.id === selectedFacilityId) || facilities[0];
  const activeEval =
    evaluations.find((e) => e.facilityId === activeFac?.id && e.eligible) ||
    evaluations.find((e) => e.facilityId === activeFac?.id);
  const displayDistM = activeEval ? activeEval.walkingDistanceM : activeFac.walkingDistanceM;
  const displayMinutes = activeEval ? activeEval.walkingMinutes : activeFac.walkingMinutes;

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-black/[0.08] bg-white/92 shadow-sm backdrop-blur-md">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/[0.06] px-4 py-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-[#111827]">
          <Navigation className="h-4 w-4 shrink-0 text-[#C83709]" />
          <span className="truncate">{activeFac.name}</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs font-semibold text-[#C83709]">
          <Footprints className="h-3.5 w-3.5 shrink-0" />
          <span className="font-mono tabular-nums">
            {formatDistanceLabel(displayDistM, displayMinutes)}
          </span>
        </div>
      </div>

      <div ref={containerRef} className="h-[280px] w-full flex-1 sm:h-[360px] lg:min-h-[400px] z-0" />

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-black/[0.06] bg-[#F8F7F4]/90 px-4 py-2.5 text-xs text-[#374151]">
        <span className="flex items-center gap-1.5">
          <ShieldCheck className="h-4 w-4 shrink-0 text-[#047857]" />
          <span>
            <strong className="text-[#111827]">Entrance:</strong> {activeFac.entranceLabel}
          </span>
        </span>
        <span className="text-[#4B5563]">{activeFac.walkPathSafety}</span>
      </div>
    </div>
  );
};
