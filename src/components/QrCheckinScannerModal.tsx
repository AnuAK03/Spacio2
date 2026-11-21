import React, { useEffect, useRef, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  Download,
  QrCode,
  ScanLine,
  ShieldAlert,
  Upload,
  X,
} from 'lucide-react';
import { BookingRecord, Facility } from '../types/parkpool';
import { QrCodeDisplay } from './QrCodeDisplay';

interface QrCheckinScannerModalProps {
  booking: BookingRecord;
  facility?: Facility;
  initialMode?: 'scanner' | 'pass';
  onClose: () => void;
  onVerifyQrCheckin: (
    bookingId: string,
    payload: {
      scannedToken: string;
      scanMethod: 'camera' | 'upload' | 'gate_placard' | 'manual_token';
      arrivalMinutesLate: number;
    }
  ) => Promise<{ ok: boolean; error?: string }>;
}

interface BarcodeDetectorLike {
  detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>;
}

declare global {
  interface Window {
    BarcodeDetector?: new (opts?: { formats?: string[] }) => BarcodeDetectorLike;
  }
}

export const QrCheckinScannerModal: React.FC<QrCheckinScannerModalProps> = ({
  booking,
  facility,
  initialMode = 'scanner',
  onClose,
  onVerifyQrCheckin,
}) => {
  const [mode, setMode] = useState<'scanner' | 'pass'>(initialMode);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraStatus, setCameraStatus] = useState<string>(
    'Point your camera at the facility entrance QR placard to verify arrival.'
  );
  const [manualToken, setManualToken] = useState('');
  const [arrivalMinutesLate, setArrivalMinutesLate] = useState<number>(0);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [verifiedSuccess, setVerifiedSuccess] = useState(
    booking.status === 'checked-in' || booking.status === 'occupied'
  );

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);

  const stopCamera = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const submitScannedToken = async (
    token: string,
    method: 'camera' | 'upload' | 'gate_placard' | 'manual_token'
  ) => {
    if (!token.trim()) {
      setErrorMsg('No QR payload found.');
      return;
    }
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await onVerifyQrCheckin(booking.id, {
        scannedToken: token.trim(),
        scanMethod: method,
        arrivalMinutesLate,
      });
      if (res.ok) {
        stopCamera();
        setVerifiedSuccess(true);
      } else {
        setErrorMsg(res.error || 'QR verification failed.');
      }
    } finally {
      setBusy(false);
    }
  };

  const startCameraScan = async () => {
    setErrorMsg(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraStatus(
        'Camera capture is unavailable in this browser context. Use the Facility Entrance QR Placard or token input below.'
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;
      setCameraActive(true);
      setCameraStatus('Live scanner active — align the facility entrance QR code in view.');
      window.setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
      }, 60);

      if (window.BarcodeDetector) {
        const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
        timerRef.current = window.setInterval(async () => {
          if (!videoRef.current || videoRef.current.readyState < 2) return;
          try {
            const codes = await detector.detect(videoRef.current);
            const found = codes.find((c) => c.rawValue)?.rawValue;
            if (found) {
              stopCamera();
              await submitScannedToken(found, 'camera');
            }
          } catch {
            // continue scanning next frame
          }
        }, 450);
      } else {
        setCameraStatus(
          'Camera stream active. Live BarcodeDetector API is not available in this browser — use the Entrance QR Placard or Upload QR Image.'
        );
      }
    } catch {
      setCameraActive(false);
      setCameraStatus(
        'Camera permission declined or blocked in preview. Verify arrival using the Entrance Gate QR Placard or Upload QR Image below.'
      );
    }
  };

  const handleUploadQrImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg(null);
    if (window.BarcodeDetector) {
      try {
        const bitmap = await createImageBitmap(file);
        const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
        const codes = await detector.detect(bitmap);
        const found = codes.find((c) => c.rawValue)?.rawValue;
        if (found) {
          await submitScannedToken(found, 'upload');
          return;
        }
      } catch {
        // fall through to clear message
      }
    }
    setErrorMsg(
      'Could not decode a ParkPool QR from that image in this browser. Paste the gate token or scan the facility placard directly.'
    );
  };

  const riderQrValue =
    booking.qrPassToken || `PKP-RIDER:${booking.id}:${booking.facilityId}:${booking.accessCode}`;
  const facilityGateQrValue =
    facility?.facilityGateQrToken || `PKP-GATE:${booking.facilityId}:${booking.entranceLabel}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="QR Check-In & Rider Pass"
    >
      <div className="w-full max-w-2xl rounded-2xl border border-black/[0.1] bg-white p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-black/[0.06] pb-4">
          <div>
            <h2 className="font-display text-lg font-bold text-[#111827]">
              Gate Presence &amp; QR Verification · {booking.spaceCode}
            </h2>
            <p className="mt-0.5 text-xs text-[#4B5563]">
              {booking.facilityName} · {booking.entranceLabel} · PIN{' '}
              <span className="font-mono font-bold text-[#4338CA]">{booking.accessCode}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="rounded-lg border border-black/[0.08] p-1.5 text-[#4B5563] hover:text-[#111827]"
            aria-label="Close QR modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Mode Switcher */}
        <div className="mt-4 flex gap-1.5 rounded-xl bg-[#F3F2EE] p-1">
          <button
            type="button"
            onClick={() => setMode('scanner')}
            className={`flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-bold transition-colors ${
              mode === 'scanner'
                ? 'bg-white text-[#111827] shadow-sm'
                : 'text-[#4B5563] hover:text-[#111827]'
            }`}
          >
            <ScanLine className="h-3.5 w-3.5 text-[#4338CA]" />
            <span>Scan Facility QR to Check In</span>
          </button>
          <button
            type="button"
            onClick={() => {
              stopCamera();
              setMode('pass');
            }}
            className={`flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-bold transition-colors ${
              mode === 'pass'
                ? 'bg-white text-[#111827] shadow-sm'
                : 'text-[#4B5563] hover:text-[#111827]'
            }`}
          >
            <QrCode className="h-3.5 w-3.5 text-[#047857]" />
            <span>My Rider Booking QR Pass</span>
          </button>
        </div>

        {errorMsg && (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-900">
            <ShieldAlert className="h-4 w-4 shrink-0 text-rose-600" />
            <span>{errorMsg}</span>
          </div>
        )}

        {verifiedSuccess && mode === 'scanner' ? (
          <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-center">
            <CheckCircle2 className="mx-auto h-9 w-9 text-[#047857]" />
            <div className="mt-2 font-display text-base font-bold text-[#065F46]">
              Presence Verified — Status: checked-in
            </div>
            <p className="mt-1 text-xs text-emerald-900">
              Your arrival at {booking.entranceLabel} is confirmed on the backend. Enjoy your stay at{' '}
              {booking.spaceCode}.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-4 rounded-xl bg-[#047857] px-5 py-2 text-xs font-bold text-white hover:bg-[#065F46]"
            >
              Done
            </button>
          </div>
        ) : mode === 'scanner' ? (
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-12">
            {/* Left: Camera & Upload Scanner */}
            <div className="space-y-3 md:col-span-7">
              <div className="overflow-hidden rounded-xl border border-black/[0.08] bg-[#111827] p-3 text-white">
                {cameraActive ? (
                  <div className="relative">
                    <video
                      ref={videoRef}
                      playsInline
                      muted
                      className="h-48 w-full rounded-lg object-cover"
                    />
                    <div className="pointer-events-none absolute inset-6 rounded-xl border-2 border-emerald-400/80" />
                  </div>
                ) : (
                  <div className="flex h-40 flex-col items-center justify-center rounded-lg border border-white/15 bg-black/30 p-4 text-center">
                    <Camera className="h-7 w-7 text-emerald-400" />
                    <p className="mt-2 text-xs text-white/80">{cameraStatus}</p>
                  </div>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {cameraActive ? (
                    <button
                      type="button"
                      onClick={stopCamera}
                      className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white"
                    >
                      Stop Camera
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void startCameraScan()}
                      className="flex items-center gap-1.5 rounded-lg bg-[#047857] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#065F46]"
                    >
                      <Camera className="h-3.5 w-3.5" />
                      <span>Start Camera QR Scan</span>
                    </button>
                  )}

                  <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20">
                    <Upload className="h-3.5 w-3.5" />
                    <span>Upload QR Photo</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleUploadQrImage}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              {/* Arrival Timing & Token Verification */}
              <div className="space-y-2.5 rounded-xl border border-black/[0.07] bg-[#F8F7F4] p-3.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <label className="font-semibold text-[#374151]">Arrival Timing Check</label>
                  <select
                    value={arrivalMinutesLate}
                    onChange={(e) => setArrivalMinutesLate(Number(e.target.value))}
                    className="rounded-lg border border-black/[0.1] bg-white px-2.5 py-1 text-xs font-medium text-[#111827]"
                  >
                    <option value={0}>On Time</option>
                    <option value={10}>+10m (Within Grace)</option>
                    <option value={30}>+30m (Late Flag)</option>
                    <option value={60}>+60m (Past Cutoff)</option>
                  </select>
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void submitScannedToken(manualToken, 'manual_token');
                  }}
                  className="flex gap-2"
                >
                  <input
                    type="text"
                    value={manualToken}
                    onChange={(e) => setManualToken(e.target.value)}
                    placeholder="Or enter Gate QR code / Access PIN"
                    className="min-w-0 flex-1 rounded-lg border border-black/[0.1] bg-white px-3 py-1.5 font-mono text-xs text-[#111827]"
                  />
                  <button
                    type="submit"
                    disabled={busy}
                    className="whitespace-nowrap shrink-0 rounded-lg bg-[#111827] px-3 py-1.5 text-xs font-bold text-white hover:bg-black disabled:opacity-50"
                  >
                    {busy ? 'Checking...' : 'Verify'}
                  </button>
                </form>
              </div>
            </div>

            {/* Right: Physical Entrance Placard Simulator / Direct Scan */}
            <div className="flex flex-col items-center justify-between rounded-xl border border-black/[0.08] bg-[#F8F7F4] p-4 text-center md:col-span-5">
              <div>
                <div className="text-xs font-bold text-[#111827]">
                  Entrance Gate QR Placard
                </div>
                <div className="mt-0.5 text-[11px] text-[#4B5563]">
                  {booking.entranceLabel}
                </div>
              </div>
              <div className="my-3">
                <QrCodeDisplay
                  value={facilityGateQrValue}
                  size={148}
                  label={`Facility gate QR for ${booking.facilityName}`}
                />
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => void submitScannedToken(facilityGateQrValue, 'gate_placard')}
                className="w-full rounded-xl bg-gradient-to-r from-[#4338CA] to-[#3730A3] px-3 py-2.5 text-xs font-bold text-white shadow-sm hover:brightness-110 disabled:opacity-50"
              >
                {busy ? 'Verifying Presence...' : 'Scan Entrance QR & Check In'}
              </button>
            </div>
          </div>
        ) : (
          /* Tab 2: Rider Booking QR Pass */
          <div className="mt-5 flex flex-col items-center rounded-xl border border-black/[0.08] bg-[#F8F7F4] p-6 text-center">
            <QrCodeDisplay
              value={riderQrValue}
              size={196}
              label={`Rider booking QR pass for ${booking.id}`}
            />
            <div className="mt-3 font-mono text-sm font-bold text-[#111827]">
              {booking.id} · PIN {booking.accessCode}
            </div>
            <div className="mt-1 text-xs text-[#4B5563]">
              Show this signed QR pass to the security guard or kiosk scanner at{' '}
              <strong>{booking.entranceLabel}</strong>.
            </div>
            <div className="mt-2 max-w-md truncate font-mono text-[10px] text-[#6B7280]">
              {riderQrValue}
            </div>
            <button
              type="button"
              onClick={() => {
                const img = document.querySelector<HTMLImageElement>(
                  `img[alt="Rider booking QR pass for ${booking.id}"]`
                );
                if (img?.src) {
                  const link = document.createElement('a');
                  link.href = img.src;
                  link.download = `${booking.id}-qr-pass.png`;
                  link.click();
                }
              }}
              className="mt-4 flex items-center gap-1.5 rounded-xl border border-black/[0.1] bg-white px-4 py-2 text-xs font-bold text-[#111827] hover:border-[#047857]"
            >
              <Download className="h-3.5 w-3.5 text-[#047857]" />
              <span>Save Rider QR Pass</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
