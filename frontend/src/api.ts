import { API_URL } from './config';

export class ApiError extends Error {
  constructor(message: string, public status: number, public fields: Record<string, string> = {}) {
    super(message);
  }
}

export const tokenStore = {
  get: () => localStorage.getItem('eventhub_token'),
  set: (t: string) => localStorage.setItem('eventhub_token', t),
  clear: () => localStorage.removeItem('eventhub_token'),
};

// Singurul loc din aplicație care face cereri HTTP.
export async function api<T>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = tokenStore.get();
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: opts.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError('Serverul nu răspunde. Verifică dacă backend-ul rulează.', 0);
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const m = data?.message;
    throw new ApiError(Array.isArray(m) ? m.join(' ') : m ?? 'A apărut o eroare.', res.status, data?.fields ?? {});
  }
  return data as T;
}
