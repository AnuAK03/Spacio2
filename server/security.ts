import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { getApp, getApps, initializeApp } from 'firebase-admin/app';
import { DecodedIdToken, getAuth } from 'firebase-admin/auth';

const EPHEMERAL_DOC_SECRET = crypto.randomBytes(32).toString('hex');
const EPHEMERAL_WEBHOOK_SECRET = crypto.randomBytes(32).toString('hex');

function loadFirebaseProjectId(): string | null {
  try {
    const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (!fs.existsSync(configPath)) return null;
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf8')) as { projectId?: string };
    const projectId = raw.projectId?.trim();
    if (!projectId || projectId === 'remixed-project-id') return null;
    return projectId;
  } catch {
    return null;
  }
}

function getFirebaseAdminAuth() {
  const projectId = loadFirebaseProjectId();
  if (!projectId) return null;
  const adminApp = getApps().length ? getApp() : initializeApp({ projectId });
  return getAuth(adminApp);
}

export async function verifyFirebaseIdToken(
  idToken: string | undefined
): Promise<DecodedIdToken | null> {
  if (!idToken || idToken.length < 20) return null;
  const adminAuth = getFirebaseAdminAuth();
  if (!adminAuth) return null;
  try {
    return await adminAuth.verifyIdToken(idToken);
  } catch {
    return null;
  }
}

function getDocSecret(): string {
  return process.env.DOCUMENT_SIGNING_SECRET?.trim() || EPHEMERAL_DOC_SECRET;
}

function getWebhookSecret(): string {
  return process.env.PAYMENT_WEBHOOK_SECRET?.trim() || EPHEMERAL_WEBHOOK_SECRET;
}

function safeEqualHex(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
  } catch {
    return false;
  }
}

export function signDocumentAccessToken(
  docId: string,
  viewerId: string,
  ttlSeconds = 300
): { token: string; expiresAt: string } {
  const expMs = Date.now() + ttlSeconds * 1000;
  const payload = Buffer.from(
    JSON.stringify({
      docId,
      viewerId,
      exp: expMs,
    }),
    'utf8'
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', getDocSecret()).update(payload).digest('hex');
  return {
    token: `${payload}.${sig}`,
    expiresAt: new Date(expMs).toISOString(),
  };
}

export function verifyDocumentAccessToken(
  expectedDocId: string,
  token: string | undefined
): { valid: boolean; viewerId?: string; error?: string } {
  if (!token || !token.includes('.')) {
    return { valid: false, error: 'Missing or malformed access token' };
  }
  const [payload, sig] = token.split('.');
  if (!payload || !sig) {
    return { valid: false, error: 'Malformed access token' };
  }
  const expectedSig = crypto.createHmac('sha256', getDocSecret()).update(payload).digest('hex');
  if (!safeEqualHex(sig, expectedSig)) {
    return { valid: false, error: 'Invalid access token signature' };
  }
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      docId?: string;
      viewerId?: string;
      exp?: number;
    };
    if (parsed.docId !== expectedDocId) {
      return { valid: false, error: 'Token does not match document ID' };
    }
    if (!parsed.exp || Date.now() > parsed.exp) {
      return { valid: false, error: 'Short-lived document access link expired' };
    }
    return { valid: true, viewerId: parsed.viewerId };
  } catch {
    return { valid: false, error: 'Invalid token payload' };
  }
}

export function signWebhookPayload(rawPayload: string): string {
  return crypto.createHmac('sha256', getWebhookSecret()).update(rawPayload).digest('hex');
}

export function verifyWebhookSignature(rawPayload: string, providedSignature: string | undefined): boolean {
  if (!providedSignature) return false;
  const expected = signWebhookPayload(rawPayload);
  return safeEqualHex(providedSignature.trim(), expected);
}

const EPHEMERAL_QR_SECRET = crypto.randomBytes(32).toString('hex');

function getQrSecret(): string {
  return process.env.QR_SIGNING_SECRET?.trim() || EPHEMERAL_QR_SECRET;
}

export function signBookingQrToken(bookingId: string, facilityId: string, accessCode: string): string {
  const payload = `PKP-RIDER:${bookingId}:${facilityId}:${accessCode}`;
  const sig = crypto.createHmac('sha256', getQrSecret()).update(payload).digest('hex').slice(0, 16);
  return `${payload}:${sig}`;
}

export function verifyBookingQrToken(
  token: string
): { valid: boolean; bookingId?: string; facilityId?: string; accessCode?: string } {
  const parts = token.trim().split(':');
  if (parts.length !== 5 || parts[0] !== 'PKP-RIDER') return { valid: false };
  const [, bookingId, facilityId, accessCode, sig] = parts;
  const payload = `PKP-RIDER:${bookingId}:${facilityId}:${accessCode}`;
  const expected = crypto.createHmac('sha256', getQrSecret()).update(payload).digest('hex').slice(0, 16);
  if (!safeEqualHex(sig, expected)) return { valid: false };
  return { valid: true, bookingId, facilityId, accessCode };
}

export function signFacilityGateQrToken(facilityId: string, entranceLabel: string): string {
  const cleanGate = entranceLabel.replace(/:/g, ' ').trim();
  const payload = `PKP-GATE:${facilityId}:${cleanGate}`;
  const sig = crypto.createHmac('sha256', getQrSecret()).update(payload).digest('hex').slice(0, 16);
  return `${payload}:${sig}`;
}

export function verifyFacilityGateQrToken(
  token: string
): { valid: boolean; facilityId?: string; entranceLabel?: string } {
  const parts = token.trim().split(':');
  if (parts.length !== 4 || parts[0] !== 'PKP-GATE') return { valid: false };
  const [, facilityId, entranceLabel, sig] = parts;
  const payload = `PKP-GATE:${facilityId}:${entranceLabel}`;
  const expected = crypto.createHmac('sha256', getQrSecret()).update(payload).digest('hex').slice(0, 16);
  if (!safeEqualHex(sig, expected)) return { valid: false };
  return { valid: true, facilityId, entranceLabel };
}

