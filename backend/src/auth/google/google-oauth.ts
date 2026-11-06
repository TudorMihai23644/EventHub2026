import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { secret } from '../../common/secrets';
import { appUrl, publicApiUrl } from '../../common/urls';

export const GOOGLE_CONFIG = Symbol('GOOGLE_CONFIG');

export interface GoogleConfig {
  /** Ambele setate (GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET) → butonul „Continuă cu Google” apare. */
  enabled: boolean;
  clientId: string;
  clientSecret: string;
  /** Trebuie înregistrată exact așa în Google Cloud Console („Authorized redirect URIs”). */
  redirectUri: string;
  /** Unde se întoarce browserul după autentificare. */
  appUrl: string;
  authUrl: string;
  tokenUrl: string;
}

export function googleConfig(env: NodeJS.ProcessEnv = process.env): GoogleConfig {
  const clientId = env.GOOGLE_CLIENT_ID?.trim() ?? '';
  const clientSecret = secret('GOOGLE_CLIENT_SECRET', false, env) ?? '';
  return {
    enabled: !!clientId && !!clientSecret,
    clientId,
    clientSecret,
    redirectUri: `${publicApiUrl(env)}/auth/google/callback`,
    appUrl: appUrl(env),
    // configurabile doar pentru testele cu un server Google fals
    authUrl: env.GOOGLE_AUTH_URL?.trim() || 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: env.GOOGLE_TOKEN_URL?.trim() || 'https://oauth2.googleapis.com/token',
  };
}

const b64url = (buf: Buffer) => buf.toString('base64url');

/** Ce ține browserul între plecarea spre Google și întoarcere (cookie httpOnly, 10 minute). */
export interface OAuthState { state: string; verifier: string; nonce: string; next: string | null }

export function newOAuthState(next: string | null): OAuthState {
  return { state: b64url(randomBytes(24)), verifier: b64url(randomBytes(32)), nonce: b64url(randomBytes(16)), next };
}

export const encodeState = (s: OAuthState) => b64url(Buffer.from(JSON.stringify(s)));
export function decodeState(raw: string | undefined): OAuthState | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    return typeof s.state === 'string' && typeof s.verifier === 'string' && typeof s.nonce === 'string' ? { ...s, next: safeNext(s.next) } : null;
  } catch {
    return null;
  }
}

/** Doar căi din aplicație („/…”); altfel după autentificare utilizatorul ar putea fi trimis pe alt site. */
export function safeNext(next: unknown): string | null {
  return typeof next === 'string' && /^\/(?![/\\])/.test(next) && next.length <= 300 ? next : null;
}

export function sameValue(a: string, b: string) {
  const [x, y] = [Buffer.from(a), Buffer.from(b)];
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Adresa de autentificare Google: cod de autorizare + PKCE (S256) + nonce. */
export function authorizationUrl(cfg: GoogleConfig, s: OAuthState) {
  const url = new URL(cfg.authUrl);
  url.search = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state: s.state,
    nonce: s.nonce,
    code_challenge: b64url(createHash('sha256').update(s.verifier).digest()),
    code_challenge_method: 'S256',
    prompt: 'select_account',
  }).toString();
  return url.toString();
}

export interface GoogleIdentity { sub: string; email: string; name: string }

export class GoogleAuthError extends Error {
  constructor(public readonly reason: string) {
    super(reason);
  }
}

/**
 * Schimbă codul pe token-uri și verifică ID token-ul. Semnătura nu se mai verifică separat: token-ul vine direct
 * de la Google, pe HTTPS, ca răspuns la cererea autentificată cu secretul aplicației (OpenID Connect Core 3.1.3.7).
 * Restul afirmațiilor se verifică: emitent, destinatar, expirare, nonce și email confirmat de Google.
 */
export async function exchangeCode(cfg: GoogleConfig, code: string, s: OAuthState, now = Date.now()): Promise<GoogleIdentity> {
  let res: Response;
  try {
    res = await fetch(cfg.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({
        code, client_id: cfg.clientId, client_secret: cfg.clientSecret, redirect_uri: cfg.redirectUri,
        grant_type: 'authorization_code', code_verifier: s.verifier,
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new GoogleAuthError('unreachable');
  }
  const body = (await res.json().catch(() => null)) as { id_token?: string } | null;
  if (!res.ok || !body?.id_token) throw new GoogleAuthError('exchange');
  return verifyIdToken(cfg, body.id_token, s.nonce, now);
}

export function verifyIdToken(cfg: GoogleConfig, idToken: string, nonce: string, now = Date.now()): GoogleIdentity {
  let c: Record<string, unknown>;
  try {
    c = JSON.parse(Buffer.from(idToken.split('.')[1] ?? '', 'base64url').toString('utf8'));
  } catch {
    throw new GoogleAuthError('token');
  }
  const issOk = c.iss === 'https://accounts.google.com' || c.iss === 'accounts.google.com';
  const audOk = c.aud === cfg.clientId || (Array.isArray(c.aud) && c.aud.includes(cfg.clientId));
  const expOk = typeof c.exp === 'number' && c.exp * 1000 > now - 60_000; // 1 minut toleranță de ceas
  const nonceOk = typeof c.nonce === 'string' && sameValue(c.nonce, nonce);
  if (!issOk || !audOk || !expOk || !nonceOk || typeof c.sub !== 'string' || !c.sub) throw new GoogleAuthError('token');
  if (typeof c.email !== 'string' || c.email_verified !== true) throw new GoogleAuthError('email');
  const name = (typeof c.name === 'string' && c.name.trim()) || c.email.split('@')[0];
  return { sub: c.sub, email: c.email.trim().toLowerCase(), name: name.slice(0, 100) };
}
