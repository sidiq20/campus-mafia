// Normalize API_URL — strip trailing slash to prevent double-slash bugs like //api/...
export const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'https://campus-mafia.pxxl.click').replace(/\/+$/, '');
export const WS_URL = API_URL.replace(/^http/, 'ws');

const TOKEN_DB_NAME = 'deptos-token';
const TOKEN_DB_VERSION = 1;
const TOKEN_STORE = 'jwt_store';

// ─── IndexedDB token persistence (backup when localStorage is cleared on mobile PWA) ───

function openTokenDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(TOKEN_DB_NAME, TOKEN_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(TOKEN_STORE)) {
        db.createObjectStore(TOKEN_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveTokenToDB(token: string): Promise<void> {
  try {
    const db = await openTokenDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(TOKEN_STORE, 'readwrite');
      tx.objectStore(TOKEN_STORE).put({ id: 'jwt', token });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // IndexedDB not available — silently skip
  }
}

async function getTokenFromDB(): Promise<string | null> {
  try {
    const db = await openTokenDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(TOKEN_STORE, 'readonly');
      const req = tx.objectStore(TOKEN_STORE).get('jwt');
      req.onsuccess = () => resolve(req.result?.token || null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

async function removeTokenFromDB(): Promise<void> {
  try {
    const db = await openTokenDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(TOKEN_STORE, 'readwrite');
      tx.objectStore(TOKEN_STORE).delete('jwt');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // silently skip
  }
}

// Store and retrieve the JWT token
export function setToken(token: string) {
  localStorage.setItem('jwt', token);
  // Also persist in IndexedDB as backup (mobile PWA may clear localStorage)
  saveTokenToDB(token);
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  const ls = localStorage.getItem('jwt');
  if (ls) return ls;
  // If localStorage was cleared but IndexedDB still has it, restore it
  // This is async, but we trigger the restore and return null for now
  getTokenFromDB().then((token) => {
    if (token) {
      localStorage.setItem('jwt', token);
    }
  });
  return null;
}

export function clearToken() {
  localStorage.removeItem('jwt');
  removeTokenFromDB();
}

// Authenticated fetch wrapper — automatically adds Authorization header
// Also sends httpOnly JWT cookie for PWA session persistence across app restarts.
export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  };
  // If we have a token, send it as Bearer
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return fetch(`${API_URL}${path}`, {
    ...options,
    headers,
    credentials: 'include', // Send httpOnly jwt cookie so server can fall back to it
  });
}

/**
 * Try to restore the JWT token from IndexedDB backup.
 * Call this on app startup to recover tokens that were in localStorage
 * before the mobile PWA cleared it.
 */
export async function restoreTokenFromDB(): Promise<string | null> {
  const token = await getTokenFromDB();
  if (token) {
    localStorage.setItem('jwt', token);
    return token;
  }
  return null;
}
