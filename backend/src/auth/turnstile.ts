import { BadRequestException, CanActivate, ExecutionContext, Inject, Injectable, Logger, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { secret } from '../common/secrets';

export const TURNSTILE_CONFIG = Symbol('TURNSTILE_CONFIG');
/** Antetul în care frontend-ul trimite token-ul widget-ului (formularele nu își schimbă câmpurile). */
export const TURNSTILE_HEADER = 'x-turnstile-token';

export interface TurnstileConfig {
  /** Activ doar cu ambele chei (TURNSTILE_SITE_KEY public, TURNSTILE_SECRET_KEY secret). */
  enabled: boolean;
  siteKey: string | null;
  secretKey: string;
  verifyUrl: string;
}

export function turnstileConfig(env: NodeJS.ProcessEnv = process.env): TurnstileConfig {
  const siteKey = env.TURNSTILE_SITE_KEY?.trim() || null;
  const secretKey = secret('TURNSTILE_SECRET_KEY', false, env) ?? '';
  return {
    enabled: !!siteKey && !!secretKey,
    siteKey: siteKey && secretKey ? siteKey : null,
    secretKey,
    verifyUrl: env.TURNSTILE_VERIFY_URL?.trim() || 'https://challenges.cloudflare.com/turnstile/v0/siteverify',
  };
}

export type TurnstileAction = 'login' | 'register' | 'forgot';
const ACTION_KEY = 'eventhub:turnstile-action';
/** Marchează o rută protejată de Turnstile; `action` trebuie să fie cel dat widget-ului din formular. */
export const Turnstile = (action: TurnstileAction) => SetMetadata(ACTION_KEY, action);

export type Verdict = 'ok' | 'rejected' | 'unavailable';

/**
 * Verificarea la Cloudflare (siteverify). Token-urile sunt de unică folosință și expiră în 5 minute.
 *  - `rejected`: Cloudflare spune că nu e un om / token invalid / alt formular (action) → cererea e respinsă;
 *  - `unavailable`: Cloudflare nu răspunde → cererea trece (limitarea cererilor rămâne), ca o pană la ei
 *    să nu blocheze autentificarea tuturor. E scris în log.
 */
export async function verifyTurnstile(cfg: TurnstileConfig, token: string, ip: string | undefined, action: TurnstileAction): Promise<Verdict> {
  let res: Response;
  try {
    res = await fetch(cfg.verifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret: cfg.secretKey, response: token, ...(ip ? { remoteip: ip } : {}) }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    return 'unavailable';
  }
  if (res.status >= 500) return 'unavailable';
  const data = (await res.json().catch(() => null)) as { success?: boolean; action?: string } | null;
  if (!data) return 'unavailable';
  if (data.success !== true) return 'rejected';
  // cheile de test Cloudflare nu întorc `action`; cheile reale da, și trebuie să fie formularul potrivit
  if (data.action && data.action !== action) return 'rejected';
  return 'ok';
}

@Injectable()
export class TurnstileGuard implements CanActivate {
  private readonly logger = new Logger('Turnstile');

  constructor(@Inject(TURNSTILE_CONFIG) private readonly cfg: TurnstileConfig, private readonly reflector: Reflector) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const action = this.reflector.get<TurnstileAction | undefined>(ACTION_KEY, ctx.getHandler());
    if (!this.cfg.enabled || !action) return true;
    const req = ctx.switchToHttp().getRequest();
    const token = req.headers[TURNSTILE_HEADER];
    if (typeof token !== 'string' || !token || token.length > 2048) {
      throw new BadRequestException({ statusCode: 400, error: 'Bad Request', code: 'CAPTCHA_REQUIRED', message: 'Bifează verificarea anti-robot.' });
    }
    const verdict = await verifyTurnstile(this.cfg, token, req.ip, action);
    if (verdict === 'unavailable') {
      this.logger.warn(`Cloudflare Turnstile nu răspunde; cererea „${action}” trece fără verificare.`);
      return true;
    }
    if (verdict === 'rejected') {
      throw new BadRequestException({ statusCode: 400, error: 'Bad Request', code: 'CAPTCHA_FAILED', message: 'Verificarea anti-robot nu a reușit. Încearcă din nou.' });
    }
    return true;
  }
}
