export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://campus-mafia.pxxl.click/';
export const WS_URL = API_URL.replace(/^http/, 'ws');

// Store and retrieve the JWT token
export function setToken(token: string) {
  localStorage.setItem('jwt', token);
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('jwt');
}

export function clearToken() {
  localStorage.removeItem('jwt');
}

// Authenticated fetch wrapper — automatically adds Authorization header
export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return fetch(`${API_URL}${path}`, { ...options, headers });
}
