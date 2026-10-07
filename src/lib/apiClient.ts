export function getApiBaseUrl(): string {
  const configured = ((import.meta as any).env.VITE_API_BASE_URL || '').replace(/\/$/, '');
  // When running in the browser on a non-localhost host (e.g. Railway app),
  // ignore hardcoded localhost URLs so requests hit relative /api endpoints on the host itself.
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    if (!configured || configured.includes('localhost') || configured.includes('127.0.0.1')) {
      return '';
    }
  }
  return configured;
}

const API_BASE_URL = getApiBaseUrl();

/** Custom DOM event broadcast when the server returns 401 (expired / invalid token). */
export const PSA_UNAUTHORIZED_EVENT = 'psa:unauthorized';

export function hasApiBackend(): boolean {
  if ((import.meta as any).env.PROD) {
    return true;
  }
  return true;
}


function getStoredValue(key: string): string | null {
  return localStorage.getItem(key) || sessionStorage.getItem(key);
}

function getActorHeaders(): Record<string, string> {
  try {
    const raw = getStoredValue('psa_session');
    if (!raw) return {};
    const session = JSON.parse(raw);
    return {
      'X-Actor-Id': session.userId || 'anonymous',
      'X-Actor-Name': session.fullName || 'Unknown User',
      'X-Actor-Role': session.role || 'client',
    };
  } catch {
    return {};
  }
}

function getAuthHeaders(): Record<string, string> {
  const token = getStoredValue('psa_auth_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function readErrorMessage(response: Response): Promise<string> {
  const detail = await response.text();
  if (!detail) return `API request failed with status ${response.status}`;

  try {
    const parsed = JSON.parse(detail) as { error?: string; message?: string };
    return parsed.error || parsed.message || detail;
  } catch {
    return detail;
  }
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!hasApiBackend()) {
    throw new Error('No API backend configured.');
  }

  const baseUrl = getApiBaseUrl();
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...getActorHeaders(),
      ...getAuthHeaders(),
      ...(init.headers || {}),
    },
  });

  // Session expired or token revoked — broadcast for AuthContext to handle
  if (response.status === 401 && !path.includes('/login') && !path.includes('/register')) {
    window.dispatchEvent(new CustomEvent(PSA_UNAUTHORIZED_EVENT));
    throw new Error('Your session has expired. Please sign in again.');
  }

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function tryApiRequest<T>(path: string, init: RequestInit = {}): Promise<T | null> {
  if (!hasApiBackend()) return null;
  try {
    return await apiRequest<T>(path, init);
  } catch (err) {
    console.warn(`[Pinnacle API] ${path} sync skipped:`, err);
    return null;
  }
}