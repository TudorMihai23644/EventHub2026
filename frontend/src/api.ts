import { API_URL } from './config';
import { ENDPOINTS } from './endpoints';
import { User } from './types';

export class ApiError extends Error {
  /** `code`: cod stabil trimis de API pentru cazurile tratate special (ex. EMAIL_NOT_VERIFIED, TOKEN_INVALID). */
  constructor(message: string, public status: number, public fields: Record<string, string> = {}, public code?: string) {
    super(message);
  }
}

export interface Session { accessToken: string; user: User }

/** Adresele relative ale API-ului (ex. imaginile locale „/uploads/…”) devin absolute; cele https (Cloudinary) rămân. */
export const assetUrl = (url: string) => (url.startsWith('/') ? `${API_URL}${url}` : url);

// ---------- sesiunea ----------
// Access token-ul (15 minute) stă DOAR în memorie: niciun script nu îl găsește în localStorage, iar la reîncărcarea
// paginii se cere unul nou cu refresh token-ul din cookie-ul httpOnly (pe care JavaScript nu îl poate citi deloc).

let accessToken: string | null = null;
// versiunea veche (token valabil 7 zile în localStorage) nu mai este folosită: o ștergem
try { localStorage.removeItem('eventhub_token'); } catch { /* stocare indisponibilă */ }

export const hasSession = () => accessToken !== null;
export const setSession = (s: Session | null) => { accessToken = s?.accessToken ?? null; };

type SessionListener = (s: Session | null) => void;
let onChange: SessionListener = () => {};
/** AuthProvider află astfel când o reînnoire automată reușește sau eșuează. */
export const onSessionChange = (fn: SessionListener) => { onChange = fn; };

// Rutele care folosesc cookie-ul cer antetul acesta (protecție CSRF, vezi backend/src/auth/cookies.ts).
const CLIENT_HEADER = { 'X-EventHub-Client': 'web' };

let refreshing: Promise<Session | null> | null = null;

/**
 * Cere un access token nou cu cookie-ul de refresh. Mai multe cereri care eșuează odată împart o singură reînnoire,
 * iar tab-urile își așteaptă rândul (Web Locks), ca două tab-uri să nu trimită același cookie în același timp.
 * null = sesiune invalidă (utilizatorul trebuie să se autentifice). Eroare = serverul nu răspunde (sesiunea rămâne).
 */
export function refreshSession(): Promise<Session | null> {
  if (!refreshing) {
    refreshing = withRefreshLock(requestRefresh)
      .then((s) => {
        setSession(s);
        onChange(s);
        return s;
      })
      .finally(() => { refreshing = null; });
  }
  return refreshing;
}

async function requestRefresh(): Promise<Session | null> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${ENDPOINTS.auth.refresh}`, { method: 'POST', credentials: 'include', headers: CLIENT_HEADER });
  } catch {
    throw new ApiError('Serverul nu răspunde. Verifică dacă backend-ul rulează.', 0);
  }
  if (res.status === 401 || res.status === 403) return null;
  if (!res.ok) throw new ApiError('Sesiunea nu a putut fi reînnoită. Încearcă din nou.', res.status);
  return res.json();
}

async function withRefreshLock<T>(fn: () => Promise<T>): Promise<T> {
  // fără Web Locks (browsere vechi), perioada de grație de 30 s de pe server acoperă cazul
  if (!('locks' in navigator) || !navigator.locks) return fn();
  return (await navigator.locks.request('eventhub-refresh', fn)) as T;
}

// ---------- cereri ----------

interface ApiOptions {
  method?: string;
  body?: unknown;
  /** Ruta folosește cookie-ul de refresh (login, register, logout…): trimite credențialele și antetul CSRF. */
  cookies?: boolean;
  /** Nu încerca reînnoirea la 401 (ex. login cu parolă greșită răspunde tot 401). */
  noRefresh?: boolean;
  /** Antete în plus (ex. token-ul Turnstile). */
  headers?: Record<string, string>;
}

// Singurul loc din aplicație care face cereri HTTP.
export async function api<T>(path: string, opts: ApiOptions = {}): Promise<T> {
  const sentToken = accessToken;
  let res = await send(path, opts, sentToken);
  // access token expirat: o singură reînnoire, apoi aceeași cerere încă o dată
  if (res.status === 401 && sentToken && !opts.noRefresh) {
    const s = await refreshSession();
    if (s) res = await send(path, opts, s.accessToken);
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const m = data?.message;
    throw new ApiError(Array.isArray(m) ? m.join(' ') : m ?? 'A apărut o eroare.', res.status, data?.fields ?? {}, data?.code);
  }
  return data as T;
}

/** Descarcă un fișier de la o rută cu autentificare (ex. CSV-ul organizatorului) și îl salvează pe disc. */
export async function apiDownload(path: string, fallbackName: string): Promise<void> {
  const sentToken = accessToken;
  let res = await send(path, {}, sentToken);
  if (res.status === 401 && sentToken) {
    const s = await refreshSession();
    if (s) res = await send(path, {}, s.accessToken);
  }
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new ApiError(data?.message ?? 'Fișierul nu a putut fi descărcat.', res.status);
  }
  const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? fallbackName;
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function send(path: string, opts: ApiOptions, token: string | null): Promise<Response> {
  // FormData (încărcare de fișiere): browserul pune singur Content-Type cu `boundary`; nu îl suprascriem.
  const isForm = typeof FormData !== 'undefined' && opts.body instanceof FormData;
  try {
    return await fetch(`${API_URL}${path}`, {
      method: opts.method ?? 'GET',
      credentials: opts.cookies ? 'include' : 'same-origin',
      headers: {
        ...(isForm ? {} : { 'Content-Type': 'application/json' }),
        ...(opts.cookies ? CLIENT_HEADER : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...opts.headers,
      },
      body: opts.body === undefined ? undefined : isForm ? (opts.body as FormData) : JSON.stringify(opts.body),
    });
  } catch {
    throw new ApiError('Serverul nu răspunde. Verifică dacă backend-ul rulează.', 0);
  }
}
