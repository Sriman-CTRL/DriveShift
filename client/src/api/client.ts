// ─── Centralised API client ───────────────────────────────────────────────

const API_BASE = '';          // Vite proxy rewrites /auth, /migrations, /drive

export function getToken(): string | null {
  return localStorage.getItem('ds_token');
}

export function setToken(token: string) {
  localStorage.setItem('ds_token', token);
}

export function clearToken() {
  localStorage.removeItem('ds_token');
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (!res.ok) {
    if (res.status === 401) {
      clearToken();
      // Let components decide how to handle 401
    }
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      message = body.message ?? message;
    } catch { /* ignore */ }
    throw new ApiError(res.status, message);
  }

  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
