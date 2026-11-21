import { initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  User as FirebaseUser,
  getAuth,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  getFirestore,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import {
  BookingRecord,
  DetailedProviderType,
  DriverProfile,
  ProviderRecord,
  UserRole,
  UserSession,
} from './types/parkpool';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export const BOOTSTRAPPED_ADMIN_EMAIL = 'anuak2628@gmail.com';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
void testConnection();

export interface UserAccountDoc {
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string;
  role: UserRole;
  organization: string;
  emailVerified: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  lastLoginAt?: Timestamp;
}

export function roleAccentHex(role: UserRole): string {
  if (role === 'host') return '#047857';
  if (role === 'admin') return '#4338CA';
  return '#C83709';
}

export function toUserSession(account: UserAccountDoc): UserSession {
  return {
    id: account.uid,
    name: account.displayName,
    email: account.email,
    role: account.role,
    organization: account.organization,
    accentHex: roleAccentHex(account.role),
  };
}

export async function signInWithGooglePopup(): Promise<FirebaseUser> {
  const credential = await signInWithPopup(auth, googleProvider);
  return credential.user;
}

export async function signOutFirebase(): Promise<void> {
  await signOut(auth);
}

export async function checkIsAdminAccount(fbUser: FirebaseUser): Promise<boolean> {
  if (
    fbUser.email?.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL &&
    fbUser.emailVerified
  ) {
    return true;
  }
  try {
    const adminDoc = await getDoc(doc(db, 'admins', fbUser.uid));
    return adminDoc.exists();
  } catch {
    return false;
  }
}

export async function fetchUserAccount(uid: string): Promise<UserAccountDoc | null> {
  const path = `users/${uid}`;
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) return null;
    return snap.data() as UserAccountDoc;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function recordUserLoginTimestamp(
  fbUser: FirebaseUser,
  existing: UserAccountDoc
): Promise<UserAccountDoc> {
  const path = `users/${fbUser.uid}`;
  const cleanName = (fbUser.displayName || existing.displayName || 'ParkPool User')
    .trim()
    .slice(0, 100);
  const updatePayload: Record<string, unknown> = {
    displayName: cleanName,
    organization: existing.organization.slice(0, 120),
    updatedAt: serverTimestamp(),
    lastLoginAt: serverTimestamp(),
  };
  if (fbUser.photoURL) {
    updatePayload.photoURL = fbUser.photoURL.slice(0, 500);
  }
  try {
    await updateDoc(doc(db, 'users', fbUser.uid), updatePayload);
    return {
      ...existing,
      displayName: cleanName,
      photoURL: fbUser.photoURL ? fbUser.photoURL.slice(0, 500) : existing.photoURL,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function registerUserAccountInFirestore(params: {
  fbUser: FirebaseUser;
  role: UserRole;
  organization: string;
  displayName?: string;
}): Promise<UserAccountDoc> {
  const { fbUser, role, organization, displayName } = params;
  const path = `users/${fbUser.uid}`;
  const cleanName = (displayName || fbUser.displayName || fbUser.email?.split('@')[0] || 'User')
    .trim()
    .slice(0, 100);
  const cleanEmail = (fbUser.email || '').trim().slice(0, 160);
  const defaultOrg =
    role === 'host'
      ? 'Bengaluru Parking Partner'
      : role === 'admin'
      ? 'Compliance & Operations Command'
      : 'Bengaluru Commuter';
  const cleanOrg = (organization.trim() || defaultOrg).slice(0, 120);

  const payload: Record<string, unknown> = {
    uid: fbUser.uid,
    displayName: cleanName,
    email: cleanEmail,
    role,
    organization: cleanOrg,
    emailVerified: Boolean(fbUser.emailVerified),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastLoginAt: serverTimestamp(),
  };
  if (fbUser.photoURL) {
    payload.photoURL = fbUser.photoURL.slice(0, 500);
  }

  try {
    await setDoc(doc(db, 'users', fbUser.uid), payload);
    return {
      uid: fbUser.uid,
      displayName: cleanName,
      email: cleanEmail,
      photoURL: fbUser.photoURL ? fbUser.photoURL.slice(0, 500) : undefined,
      role,
      organization: cleanOrg,
      emailVerified: Boolean(fbUser.emailVerified),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function saveDriverProfileToFirestore(
  uid: string,
  profile: DriverProfile
): Promise<void> {
  const path = `driverProfiles/${uid}`;
  try {
    const existingSnap = await getDoc(doc(db, 'driverProfiles', uid));
    const baseData = {
      uid,
      fullName: profile.fullName.trim().slice(0, 100),
      email: profile.email.trim().slice(0, 160),
      phone: profile.phone.trim().slice(0, 30),
      licenseNumber: profile.licenseNumber.trim().slice(0, 40),
      licenseValidTill: profile.licenseValidTill.trim().slice(0, 20),
      wheelerCategory: profile.wheelerCategory,
      vehicleType: profile.vehicleType,
      vehicleModel: profile.vehicleModel.trim().slice(0, 80),
      plateNumber: profile.plateNumber.trim().slice(0, 30),
      isEv: Boolean(profile.isEv),
      registeredVehicleId: profile.registeredVehicleId.slice(0, 64),
      updatedAt: serverTimestamp(),
    };

    if (existingSnap.exists()) {
      await updateDoc(doc(db, 'driverProfiles', uid), baseData);
    } else {
      await setDoc(doc(db, 'driverProfiles', uid), {
        ...baseData,
        verified: false,
        createdAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function fetchDriverProfileFromFirestore(
  uid: string
): Promise<DriverProfile | null> {
  const path = `driverProfiles/${uid}`;
  try {
    const snap = await getDoc(doc(db, 'driverProfiles', uid));
    if (!snap.exists()) return null;
    const data = snap.data() as Record<string, unknown>;
    if (!data.licenseNumber || !data.plateNumber) return null;
    return {
      id: `DRV-${uid.slice(0, 8)}`,
      fullName: String(data.fullName || ''),
      email: String(data.email || ''),
      phone: String(data.phone || ''),
      licenseNumber: String(data.licenseNumber || ''),
      licenseValidTill: String(data.licenseValidTill || '2032-12-31'),
      wheelerCategory: data.wheelerCategory === 'two_wheeler' ? 'two_wheeler' : 'four_wheeler',
      vehicleType:
        data.vehicleType === 'two_wheeler' ||
        data.vehicleType === 'hatchback' ||
        data.vehicleType === 'sedan' ||
        data.vehicleType === 'suv'
          ? data.vehicleType
          : data.wheelerCategory === 'two_wheeler'
          ? 'two_wheeler'
          : 'hatchback',
      vehicleModel: String(data.vehicleModel || ''),
      plateNumber: String(data.plateNumber || ''),
      isEv: Boolean(data.isEv),
      registeredVehicleId: String(data.registeredVehicleId || ''),
      verified: Boolean(data.verified ?? true),
      updatedAt: new Date().toISOString(),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function saveProviderToFirestore(
  uid: string,
  provider: ProviderRecord
): Promise<void> {
  const cleanId = provider.id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
  const path = `providers/${cleanId}`;
  const allowedClientStatus =
    provider.verificationStatus === 'SUBMITTED' ? 'SUBMITTED' : 'NOT_SUBMITTED';
  try {
    const existingSnap = await getDoc(doc(db, 'providers', cleanId));
    const baseData = {
      id: cleanId,
      ownerUid: uid,
      name: provider.name.trim().slice(0, 100),
      contactName: provider.contactName.trim().slice(0, 100),
      contactEmail: provider.contactEmail.trim().slice(0, 160),
      contactPhone: provider.contactPhone.trim().slice(0, 30),
      organizationName: provider.organizationName.trim().slice(0, 140),
      ...(provider.registrationNumber
        ? { registrationNumber: provider.registrationNumber.trim().slice(0, 80) }
        : {}),
      providerType: provider.providerType as DetailedProviderType,
      verificationStatus: allowedClientStatus,
      updatedAt: serverTimestamp(),
    };

    if (existingSnap.exists()) {
      await updateDoc(doc(db, 'providers', cleanId), baseData);
    } else {
      await setDoc(doc(db, 'providers', cleanId), {
        ...baseData,
        createdAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function syncHeldBookingToFirestore(
  uid: string,
  booking: BookingRecord
): Promise<void> {
  const cleanId = booking.id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
  const path = `bookings/${cleanId}`;
  try {
    const existingSnap = await getDoc(doc(db, 'bookings', cleanId));
    if (!existingSnap.exists()) {
      await setDoc(doc(db, 'bookings', cleanId), {
        id: cleanId,
        driverUid: uid,
        driverEmail: (booking.driverEmail || auth.currentUser?.email || '').slice(0, 160),
        spaceId: booking.spaceId.slice(0, 128),
        facilityId: booking.facilityId.slice(0, 128),
        facilityName: booking.facilityName.slice(0, 160),
        spaceCode: booking.spaceCode.slice(0, 64),
        status: 'held',
        paymentStatus:
          booking.paymentStatus === 'pending' ? 'pending_order' : 'unpaid',
        totalAmountInr: Number(booking.totalAmountInr || 0),
        startMin: Number(booking.startMin || 0),
        endMin: Number(booking.endMin || 60),
        qrVerified: Boolean(booking.qrVerifiedAt),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else if (
      booking.status === 'checked-in' ||
      booking.status === 'completed' ||
      booking.status === 'cancelled'
    ) {
      await updateDoc(doc(db, 'bookings', cleanId), {
        status: booking.status,
        qrVerified: Boolean(booking.qrVerifiedAt),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export interface FirestoreBookingDoc {
  id: string;
  driverUid: string;
  driverEmail: string;
  spaceId: string;
  facilityId: string;
  facilityName: string;
  spaceCode: string;
  status: BookingRecord['status'];
  paymentStatus: 'unpaid' | 'pending_order' | 'paid' | 'failed' | 'refunded';
  totalAmountInr: number;
  startMin: number;
  endMin: number;
  qrVerified: boolean;
}

export function subscribeUserBookings(
  uid: string,
  onBookings: (items: FirestoreBookingDoc[]) => void
): () => void {
  const path = 'bookings';
  const q = query(collection(db, 'bookings'), where('driverUid', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      onBookings(snap.docs.map((d) => d.data() as FirestoreBookingDoc));
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeUserAccount(
  uid: string,
  onData: (doc: UserAccountDoc | null) => void
): () => void {
  const path = `users/${uid}`;
  return onSnapshot(
    doc(db, 'users', uid),
    (snap) => {
      onData(snap.exists() ? (snap.data() as UserAccountDoc) : null);
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    }
  );
}

export async function fetchUserBookingsCount(uid: string): Promise<number> {
  const path = 'bookings';
  try {
    const q = query(collection(db, 'bookings'), where('driverUid', '==', uid));
    const snaps = await getDocs(q);
    return snaps.size;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}
