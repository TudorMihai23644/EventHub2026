import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { CookieOptions, Response } from 'express';
import { API_PREFIX, ROUTES } from '../common/routes';

export const REFRESH_COOKIE = 'eh_refresh';
/** Cookie-ul pleacă doar spre rutele de autentificare, nu cu fiecare cerere. */
export const REFRESH_COOKIE_PATH = `/${API_PREFIX}/${ROUTES.auth.base}`;

export const CLIENT_HEADER = 'x-eventhub-client';
export const CLIENT_HEADER_VALUE = 'web';

export interface CookieSettings {
  secure: boolean;
  sameSite: 'lax' | 'strict' | 'none';
  domain?: string;
}

/**
 * COOKIE_SECURE: implicit activ în producție. Docker local rulează cu NODE_ENV=production pe http://localhost,
 * deci docker-compose.yml îl pune pe false.
 * COOKIE_SAMESITE: implicit `lax`. `none` (frontend și API pe site-uri diferite) cere Secure; îl forțăm.
 */
export function cookieSettings(env: NodeJS.ProcessEnv = process.env): CookieSettings {
  const raw = env.COOKIE_SAMESITE?.trim().toLowerCase();
  const sameSite = raw === 'strict' || raw === 'none' ? raw : 'lax';
  const flag = env.COOKIE_SECURE?.trim().toLowerCase();
  const secure = sameSite === 'none' || (flag === 'true' ? true : flag === 'false' ? false : env.NODE_ENV === 'production');
  return { secure, sameSite, domain: env.COOKIE_DOMAIN?.trim() || undefined };
}

function baseOptions(s: CookieSettings): CookieOptions {
  return { httpOnly: true, secure: s.secure, sameSite: s.sameSite, domain: s.domain, path: REFRESH_COOKIE_PATH };
}

export function setRefreshCookie(res: Response, raw: string, expiresAt: Date, s: CookieSettings = cookieSettings()) {
  res.cookie(REFRESH_COOKIE, raw, { ...baseOptions(s), expires: expiresAt });
}

export function clearRefreshCookie(res: Response, s: CookieSettings = cookieSettings()) {
  res.clearCookie(REFRESH_COOKIE, baseOptions(s));
}

/**
 * Protecție CSRF pentru rutele care folosesc cookie-ul (refresh, logout, logout-all).
 * Un formular HTML de pe alt site nu poate trimite antete proprii, iar `fetch` cu un antet propriu
 * cere un preflight CORS pe care doar originile noastre îl trec. Împreună cu SameSite=Lax.
 */
@Injectable()
export class ClientHeaderGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    if (req.headers[CLIENT_HEADER] === CLIENT_HEADER_VALUE) return true;
    throw new ForbiddenException({ statusCode: 403, error: 'Forbidden', code: 'CLIENT_HEADER_MISSING', message: 'Cerere respinsă.' });
  }
}
