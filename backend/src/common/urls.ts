// Porturile și adresele implicite ale aplicației, într-un singur loc. Restul (CORS, linkurile din emailuri, întoarcerile de la
// Google și Stripe, User-Agent-ul hărții) le derivă de aici, deci schimbarea unui port nu cere modificări prin tot codul.
// Aceleași valori sunt în docker-compose.yml, frontend/vite.config.ts și frontend/.env.development; urls.spec.ts verifică
// că nu s-au despărțit.
export const DEFAULT_FRONTEND_PORT = 5100;
export const DEFAULT_API_PORT = 5200;
export const DEFAULT_APP_URL = `http://localhost:${DEFAULT_FRONTEND_PORT}`;
export const DEFAULT_API_URL = `http://localhost:${DEFAULT_API_PORT}/api`;

const trimSlash = (url: string) => url.replace(/\/+$/, '');

/** Adresa frontend-ului (linkuri din emailuri, întoarceri de la Google / Stripe). */
export const appUrl = (env: NodeJS.ProcessEnv = process.env) => trimSlash(env.APP_URL?.trim() || DEFAULT_APP_URL);

/** Adresa publică a API-ului, cu /api (linkuri .ics, redirect URI Google). */
export const publicApiUrl = (env: NodeJS.ProcessEnv = process.env) => trimSlash(env.PUBLIC_API_URL?.trim() || DEFAULT_API_URL);

/** Portul pe care ascultă API-ul. */
export function listenPort(env: NodeJS.ProcessEnv = process.env): number {
  const p = Number(env.PORT);
  return Number.isInteger(p) && p > 0 && p < 65536 ? p : DEFAULT_API_PORT;
}

/**
 * Originile acceptate de CORS. CORS_ORIGIN (listă cu virgulă) are prioritate; altfel, originea lui APP_URL. Pentru o adresă
 * locală se acceptă și „geamăna” ei: http://localhost:5100 și http://127.0.0.1:5100 sunt aceeași pagină pentru utilizator,
 * dar origini diferite pentru browser (deschisă pe cealaltă, fiecare cerere ar fi respinsă: „Serverul nu răspunde”).
 */
export function corsOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  const explicit = env.CORS_ORIGIN?.split(',').map((o) => trimSlash(o.trim())).filter(Boolean);
  if (explicit?.length) return explicit;
  const origin = new URL(appUrl(env)).origin;
  const u = new URL(origin);
  const twin = u.hostname === 'localhost' ? '127.0.0.1' : u.hostname === '127.0.0.1' ? 'localhost' : null;
  return twin ? [origin, `${u.protocol}//${twin}${u.port ? `:${u.port}` : ''}`] : [origin];
}
