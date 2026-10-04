import type { SessionUser } from "./roles";
import { normalizeBangladeshPhone } from "../phone/bangladesh-phone";

interface LocalSessionRecord {
  user: SessionUser;
  expiresAt: number;
  phone: string | null;
}

interface LocalAuthStore {
  sessions: Map<string, LocalSessionRecord>;
  intakes: Map<string, LocalSessionRecord & { token: string }>;
  pinRecords: Map<string, LocalSessionRecord>;
}

const globalAuth = globalThis as typeof globalThis & {
  __legalVoiceAuthStore?: LocalAuthStore;
};

function getStore(): LocalAuthStore {
  if (!globalAuth.__legalVoiceAuthStore) {
    globalAuth.__legalVoiceAuthStore = { sessions: new Map(), intakes: new Map(), pinRecords: new Map() };
  }
  return globalAuth.__legalVoiceAuthStore;
}

export function createLocalCitizenSession(
  displayName: string,
  phone: string | null,
  intakeId?: string,
  pinHash?: string,
): {
  user: SessionUser;
  token: string;
  expiresAt: Date;
} {
  if (intakeId) {
    const existing = getStore().intakes.get(intakeId);
    if (existing) {
      if (pinHash) getStore().pinRecords.set(pinHash, existing);
      return { user: existing.user, token: existing.token, expiresAt: new Date(existing.expiresAt) };
    }
  }

  const id = `CIT-${crypto.randomUUID()}`;
  const token = `local_citizen_${crypto.randomUUID()}`;
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const user: SessionUser = {
    id,
    displayName: displayName.trim() || "নাগরিক",
    role: "citizen",
    status: "active",
    verificationStatus: phone ? "pending" : "unverified",
    isMock: false,
  };
  const record = { user, expiresAt: expiresAt.getTime(), phone: phone ? normalizeBangladeshPhone(phone) : null };
  getStore().sessions.set(token, record);
  if (pinHash) getStore().pinRecords.set(pinHash, record);
  if (intakeId) getStore().intakes.set(intakeId, { ...record, token });
  return { user, token, expiresAt };
}

export function createLocalSessionForUser(user: SessionUser): {
  user: SessionUser;
  token: string;
  expiresAt: Date;
} {
  const token = `local_citizen_${crypto.randomUUID()}`;
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  getStore().sessions.set(token, { user, expiresAt: expiresAt.getTime(), phone: null });
  return { user, token, expiresAt };
}

export function getLocalUserByPin(pinHash: string): SessionUser | null {
  const record = getStore().pinRecords.get(pinHash);
  if (!record || record.expiresAt <= Date.now()) {
    if (record) getStore().pinRecords.delete(pinHash);
    return null;
  }
  return record.user;
}

export function getLocalUserByPhoneAndPin(phone: string, pinHash: string): SessionUser | null {
  const record = getStore().pinRecords.get(pinHash);
  if (!record || record.expiresAt <= Date.now()) {
    if (record) getStore().pinRecords.delete(pinHash);
    return null;
  }
  return record.phone === normalizeBangladeshPhone(phone) ? record.user : null;
}

export function createLocalStaffSession(
  user: Omit<SessionUser, "isMock">,
): {
  user: SessionUser;
  token: string;
  expiresAt: Date;
} {
  const token = `local_${user.role}_${crypto.randomUUID()}`;
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const sessionUser: SessionUser = {
    ...user,
    isMock: true,
  };
  getStore().sessions.set(token, { user: sessionUser, expiresAt: expiresAt.getTime(), phone: null });
  return { user: sessionUser, token, expiresAt };
}

export function getLocalSessionUser(token: string | undefined): SessionUser | null {
  if (!token) return null;
  const record = getStore().sessions.get(token);
  if (!record || record.expiresAt <= Date.now()) {
    if (record) getStore().sessions.delete(token);
    return null;
  }
  return record.user;
}

export function clearLocalSession(token: string | undefined): void {
  if (token) getStore().sessions.delete(token);
}
