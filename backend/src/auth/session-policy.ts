// Regulile sesiunilor, ca funcții pure (testate fără bază de date).

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60; // 15 minute
export const REFRESH_TTL_DAYS = 30; // reînnoit la fiecare folosire
export const SESSION_MAX_DAYS = 90; // după 90 de zile de la autentificare: autentificare nouă
/** Două tab-uri reînnoiesc în același timp: cel „rămas în urmă” mai primește un access token în această fereastră. */
export const ROTATION_GRACE_SECONDS = 30;

export type RefreshDecision =
  | 'rotate' // valid: se înlocuiește cu un token nou
  | 'grace' // tocmai a fost înlocuit (alt tab): doar un access token nou, fără cookie nou
  | 'theft' // înlocuit demult și folosit din nou: cineva are o copie → se revocă toată familia
  | 'invalid'; // inexistent, expirat sau revocat

interface TokenState {
  expiresAt: Date;
  familyExpiresAt: Date;
  replacedAt: Date | null;
  revokedAt: Date | null;
}

export function decideRefresh(token: TokenState | null, now: Date): RefreshDecision {
  if (!token || token.revokedAt) return 'invalid';
  if (token.familyExpiresAt <= now) return 'invalid';
  if (token.replacedAt) {
    const since = (now.getTime() - token.replacedAt.getTime()) / 1000;
    return since <= ROTATION_GRACE_SECONDS ? 'grace' : 'theft';
  }
  if (token.expiresAt <= now) return 'invalid';
  return 'rotate';
}

/** Expirarea unui refresh token nou: peste 30 de zile, dar niciodată după limita de 90 de zile a sesiunii. */
export function nextRefreshExpiry(now: Date, familyExpiresAt: Date): Date {
  const thirtyDays = new Date(now.getTime() + REFRESH_TTL_DAYS * 86_400_000);
  return thirtyDays < familyExpiresAt ? thirtyDays : familyExpiresAt;
}

/** Durata access token-ului; ACCESS_TOKEN_TTL_SECONDS din mediu doar pentru teste (ex. 2 secunde). */
export function accessTokenTtl(env: NodeJS.ProcessEnv = process.env): number {
  const v = Number(env.ACCESS_TOKEN_TTL_SECONDS);
  return Number.isInteger(v) && v > 0 ? v : ACCESS_TOKEN_TTL_SECONDS;
}
