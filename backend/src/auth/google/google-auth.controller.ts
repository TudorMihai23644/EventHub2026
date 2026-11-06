import { Controller, Get, Inject, NotFoundException, Query, Req, Res } from '@nestjs/common';
import type { CookieOptions, Request, Response } from 'express';
import { AuthService } from '../auth.service';
import { cookieSettings, setRefreshCookie } from '../cookies';
import { API_PREFIX, ROUTES } from '../../common/routes';
import { ThrottleScope } from '../../common/security';
import {
  GOOGLE_CONFIG, GoogleAuthError, GoogleConfig, authorizationUrl, decodeState, encodeState, exchangeCode, newOAuthState, safeNext, sameValue,
} from './google-oauth';

export const OAUTH_COOKIE = 'eh_oauth';
const OAUTH_COOKIE_PATH = `/${API_PREFIX}/${ROUTES.auth.base}/${ROUTES.auth.google}`;

/**
 * „Continuă cu Google”. Browserul pleacă la GET /auth/google, se întoarce la /auth/google/callback, primește cookie-ul
 * de sesiune obișnuit și e trimis înapoi în aplicație (/autentificare-google), unde frontend-ul cere access token-ul.
 * Cookie-ul temporar e SameSite=Lax: întoarcerea de la Google e o navigare de pe alt site, pe care Strict n-ar trimite-o.
 */
@Controller(ROUTES.auth.base)
export class GoogleAuthController {
  constructor(private readonly auth: AuthService, @Inject(GOOGLE_CONFIG) private readonly cfg: GoogleConfig) {}

  private cookieOptions(): CookieOptions {
    const s = cookieSettings();
    return { httpOnly: true, secure: s.secure, sameSite: 'lax', domain: s.domain, path: OAUTH_COOKIE_PATH };
  }

  @Get(ROUTES.auth.google)
  @ThrottleScope('oauth')
  start(@Query('next') next: string | undefined, @Res() res: Response) {
    if (!this.cfg.enabled) throw new NotFoundException('Autentificarea cu Google nu este configurată.');
    const s = newOAuthState(safeNext(next));
    res.cookie(OAUTH_COOKIE, encodeState(s), { ...this.cookieOptions(), maxAge: 10 * 60_000 });
    res.redirect(302, authorizationUrl(this.cfg, s));
  }

  @Get(ROUTES.auth.googleCallback)
  @ThrottleScope('oauth')
  async callback(@Query() q: Record<string, string | undefined>, @Req() req: Request, @Res() res: Response) {
    if (!this.cfg.enabled) throw new NotFoundException('Autentificarea cu Google nu este configurată.');
    const saved = decodeState(req.cookies?.[OAUTH_COOKIE]);
    res.clearCookie(OAUTH_COOKIE, this.cookieOptions()); // o singură folosire
    const fail = (reason: string) => res.redirect(302, `${this.cfg.appUrl}/login?google=${reason}`);

    if (q.error) return fail(q.error === 'access_denied' ? 'cancelled' : 'error');
    // state-ul din URL trebuie să fie cel pus de noi în cookie: altfel cineva ar putea „loga” victima în contul lui (CSRF)
    if (!saved || typeof q.state !== 'string' || !sameValue(q.state, saved.state) || typeof q.code !== 'string') return fail('expired');
    try {
      const identity = await exchangeCode(this.cfg, q.code, saved);
      const session = await this.auth.signInWithGoogle(identity, req.headers['user-agent']);
      setRefreshCookie(res, session.refresh.raw, session.refresh.expiresAt);
      const next = saved.next ? `?next=${encodeURIComponent(saved.next)}` : '';
      return res.redirect(302, `${this.cfg.appUrl}/autentificare-google${next}`);
    } catch (e) {
      if (e instanceof GoogleAuthError) return fail(e.reason === 'email' ? 'unverified' : 'error');
      throw e;
    }
  }
}
