/**
 * Thin wrapper over fetch for the Pinnacle API. Every call goes to the server;
 * there is no local fallback data. Errors carry the server's field-level details
 * so forms can show them next to the right input.
 */

const TOKEN_KEY = 'pfs_session_token';

export function getApiBaseUrl(): string {
  return ((import.meta as any).env?.VITE_API_BASE_URL || '').replace(/\/$/, '');
}

export const tokenStore = {
  get(): string | null {
    try {
      return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token: string, remember: boolean): void {
    try {
      (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, token);
      (remember ? sessionStorage : localStorage).removeItem(TOKEN_KEY);
    } catch {
      /* storage unavailable: the session lasts for this page only */
    }
  },
  replace(token: string): void {
    try {
      if (localStorage.getItem(TOKEN_KEY)) localStorage.setItem(TOKEN_KEY, token);
      else sessionStorage.setItem(TOKEN_KEY, token);
    } catch {
      /* ignore */
    }
  },
  clear(): void {
    try {
      localStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
  },
};

export interface FieldError {
  field: string;
  message: string;
}

export class ApiError extends Error {
  constructor(public readonly status: number, message: string, public readonly details: FieldError[] = []) {
    super(message);
  }

  fieldErrors(): Record<string, string> {
    const map: Record<string, string> = {};
    for (const detail of this.details) if (!map[detail.field]) map[detail.field] = detail.message;
    return map;
  }
}

export const UNAUTHORIZED_EVENT = 'pfs:unauthorized';

function headers(extra: Record<string, string> = {}): Record<string, string> {
  const token = tokenStore.get();
  return { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra };
}

async function toError(response: Response): Promise<ApiError> {
  let message = `Request failed (${response.status}).`;
  let details: FieldError[] = [];
  try {
    const body = await response.json();
    message = body.error || message;
    if (Array.isArray(body.details)) details = body.details;
  } catch {
    if (response.status === 413) message = 'The file is too large.';
    else if (response.status >= 500) message = 'The server had a problem. Please try again.';
  }
  return new ApiError(response.status, message, details);
}

export async function api<T = unknown>(path: string, options: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${getApiBaseUrl()}${path}`, {
      method: options.method || (options.body !== undefined ? 'POST' : 'GET'),
      headers: headers(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });
  } catch (error: any) {
    if (error?.name === 'AbortError') throw error;
    throw new ApiError(0, 'Cannot reach the server. Check your connection and try again.');
  }
  if (response.status === 401 && !path.startsWith('/api/auth/login') && !path.startsWith('/api/auth/passkeys/login')) {
    window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
  }
  if (!response.ok) throw await toError(response);
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

/** Multipart upload with progress (fetch cannot report upload progress). */
export function uploadFile<T = unknown>(path: string, form: FormData, onProgress?: (fraction: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${getApiBaseUrl()}${path}`);
    for (const [key, value] of Object.entries(headers())) xhr.setRequestHeader(key, value);
    xhr.upload.onprogress = event => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    };
    xhr.onerror = () => reject(new ApiError(0, 'The upload failed. Check your connection and try again.'));
    xhr.onload = () => {
      let body: any = null;
      try { body = JSON.parse(xhr.responseText); } catch { /* not JSON */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body as T);
      else {
        if (xhr.status === 401) window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
        reject(new ApiError(xhr.status, body?.error || (xhr.status === 413 ? 'The file is too large.' : `Upload failed (${xhr.status}).`), body?.details || []));
      }
    };
    xhr.send(form);
  });
}

/** Fetches a protected file with the auth header and returns an object URL for preview or download. */
export async function fetchFileUrl(path: string): Promise<{ url: string; type: string }> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, { headers: headers() });
  if (!response.ok) throw await toError(response);
  const blob = await response.blob();
  return { url: URL.createObjectURL(blob), type: blob.type };
}

export async function downloadFile(path: string, fallbackName: string): Promise<void> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, { headers: headers() });
  if (!response.ok) throw await toError(response);
  const disposition = response.headers.get('Content-Disposition') || '';
  const name = /filename="([^"]+)"/.exec(disposition)?.[1] || fallbackName;
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
