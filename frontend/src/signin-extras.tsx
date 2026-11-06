import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { API_URL } from './config';
import { ENDPOINTS } from './endpoints';

/** GET /auth/options: ce metode sunt active pe server (Google, Turnstile). Cerut o singură dată pe sesiune. */
export interface AuthOptions { google: boolean; turnstileSiteKey: string | null }
let optionsCache: Promise<AuthOptions> | null = null;
export function useAuthOptions(): AuthOptions | null {
  const [o, setO] = useState<AuthOptions | null>(null);
  useEffect(() => {
    optionsCache ??= api<AuthOptions>(ENDPOINTS.auth.options).catch(() => { optionsCache = null; return { google: false, turnstileSiteKey: null }; });
    optionsCache.then(setO);
  }, []);
  return o;
}

// ---------- Cloudflare Turnstile ----------

interface TurnstileApi {
  render: (el: HTMLElement, o: Record<string, unknown>) => string;
  remove: (id: string) => void;
}
declare global { interface Window { turnstile?: TurnstileApi } }

let scriptLoading: Promise<TurnstileApi> | null = null;
function loadTurnstile(): Promise<TurnstileApi> {
  scriptLoading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true;
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile')));
    s.onerror = () => { scriptLoading = null; reject(new Error('turnstile')); };
    document.head.appendChild(s);
  });
  return scriptLoading;
}

function TurnstileWidget({ siteKey, action, onToken }: { siteKey: string; action: string; onToken: (t: string | null) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let id: string | null = null;
    let alive = true;
    loadTurnstile()
      .then((t) => {
        if (!alive || !box.current) return;
        id = t.render(box.current, {
          sitekey: siteKey, action, theme: 'dark', language: 'ro',
          callback: (token: string) => onToken(token),
          'expired-callback': () => onToken(null),
          'error-callback': () => onToken(null),
        });
      })
      .catch(() => alive && setFailed(true));
    return () => { alive = false; if (id) window.turnstile?.remove(id); };
  }, [siteKey, action, onToken]);
  if (failed) return <p className="field-err">Verificarea anti-robot nu s-a încărcat (un blocant de reclame?). Reîncarcă pagina.</p>;
  return <div ref={box} className="captcha" />;
}

/**
 * Verificarea anti-robot pentru un formular, doar dacă serverul o cere (TURNSTILE_SITE_KEY setat).
 * Token-urile sunt de unică folosință: după fiecare trimitere, `reset()` pune un widget nou.
 */
export function useHumanCheck(action: 'login' | 'register' | 'forgot') {
  const options = useAuthOptions();
  const [token, setToken] = useState<string | null>(null);
  const [round, setRound] = useState(0);
  const siteKey = options?.turnstileSiteKey ?? null;
  return {
    element: siteKey ? <TurnstileWidget key={round} siteKey={siteKey} action={action} onToken={setToken} /> : null,
    /** true = butonul de trimitere așteaptă bifa. */
    waiting: options === null || (!!siteKey && !token),
    headers: token ? { 'X-Turnstile-Token': token } : undefined,
    reset: () => { setToken(null); setRound((r) => r + 1); },
  };
}

// ---------- Google ----------

export function GoogleButton({ next }: { next?: string | null }) {
  const options = useAuthOptions();
  if (!options?.google) return null;
  const href = `${API_URL}${ENDPOINTS.auth.google}${next ? `?next=${encodeURIComponent(next)}` : ''}`;
  return (
    <>
      <a className="btn google" href={href}>
        <svg viewBox="0 0 48 48" aria-hidden="true" width="18" height="18">
          <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
          <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
          <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
          <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
        </svg>
        Continuă cu Google
      </a>
      <p className="or"><span>sau</span></p>
    </>
  );
}

/** Mesajul după o întoarcere eșuată de la Google (/login?google=…). */
export function googleError(reason: string | null): string | null {
  switch (reason) {
    case null: return null;
    case 'cancelled': return 'Ai anulat conectarea cu Google.';
    case 'expired': return 'Conectarea cu Google a expirat sau a fost deschisă în alt browser. Încearcă din nou.';
    case 'unverified': return 'Adresa contului Google nu este confirmată de Google.';
    default: return 'Conectarea cu Google nu a reușit. Încearcă din nou sau folosește emailul și parola.';
  }
}
