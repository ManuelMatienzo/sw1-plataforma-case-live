import { SessionUser } from '../types/admin';

export const AUTH_STORAGE_KEY = 'case.auth.v1';

export interface StoredSession {
  version: 1;
  token: string;
  user: SessionUser;
}

const isStoredSession = (value: unknown): value is StoredSession => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<StoredSession>;
  return (
    candidate.version === 1 &&
    typeof candidate.token === 'string' &&
    typeof candidate.user?.id === 'string' &&
    typeof candidate.user?.rol === 'string'
  );
};

export const getStoredSession = (): StoredSession | null => {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isStoredSession(parsed)) {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    return null;
  }
};

export const saveSession = (token: string, user: SessionUser): StoredSession => {
  const session: StoredSession = { version: 1, token, user };
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
  return session;
};

export const clearSession = () => localStorage.removeItem(AUTH_STORAGE_KEY);

