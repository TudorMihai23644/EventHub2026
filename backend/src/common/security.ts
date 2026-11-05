import { ExecutionContext, SetMetadata } from '@nestjs/common';
import { ThrottlerModuleOptions } from '@nestjs/throttler';

// Toate limitele de cereri într-un singur loc. ttl în milisecunde.
const MINUTE = 60_000;
export const LIMITS = {
  default: { ttl: MINUTE, limit: 120 }, // per IP, per rută
  loginAccount: { ttl: MINUTE, limit: 5 }, // per IP + email: ghicirea parolei unui cont
  loginIp: { ttl: MINUTE, limit: 30 }, // per IP: încercări pe multe conturi
  register: { ttl: 60 * MINUTE, limit: 10 }, // per IP: conturi false în masă
  forgotAccount: { ttl: 60 * MINUTE, limit: 3 }, // per IP + email: emailuri de resetare către o adresă
  forgotIp: { ttl: 60 * MINUTE, limit: 20 }, // per IP: cereri de resetare pentru multe adrese
  reset: { ttl: 60 * MINUTE, limit: 10 }, // per IP: încercări de token-uri de resetare
  verify: { ttl: 60 * MINUTE, limit: 20 }, // per IP: încercări de token-uri de confirmare
  resend: { ttl: 60 * MINUTE, limit: 5 }, // per IP: retrimiterea emailului de confirmare
  refresh: { ttl: MINUTE, limit: 30 }, // per IP: reînnoirea sesiunii (normal: o dată la 15 minute per tab)
} as const;

// „un minut”, „5 minute”, „45 de minute” (în română, de la 20 în sus se pune „de”).
function minutesRo(n: number) {
  if (n <= 1) return 'un minut';
  const mod = n % 100;
  return mod === 0 || mod >= 20 ? `${n} de minute` : `${n} minute`;
}
export const tooManyRequests = (secondsLeft: number) =>
  `Prea multe încercări. Încearcă din nou peste ${minutesRo(Math.ceil(Math.max(1, secondsLeft) / 60))}.`;
export const TOO_MANY_REQUESTS = tooManyRequests(60);

// Limitele stricte se aplică doar rutelor marcate cu @ThrottleScope(...).
export type ThrottleScopeName = 'login' | 'register' | 'forgot' | 'reset' | 'verify' | 'resend' | 'refresh';
const SCOPE_KEY = 'eventhub:throttle-scope';
export const ThrottleScope = (scope: ThrottleScopeName) => SetMetadata(SCOPE_KEY, scope);
export const throttleScopeOf = (handler: object): ThrottleScopeName | undefined => Reflect.getMetadata(SCOPE_KEY, handler);
const onlyFor = (scope: ThrottleScopeName) => (ctx: ExecutionContext) => throttleScopeOf(ctx.getHandler()) !== scope;

// IP + email: utilizatorii din aceeași rețea (birou, Wi-Fi, operator mobil) nu se blochează între ei.
const ipAndEmail = (req: Record<string, any>) =>
  `${req.ip}|${String(req.body?.email ?? '').trim().toLowerCase()}`;

export const throttlerOptions: ThrottlerModuleOptions = {
  // mesajul spune cât mai e de așteptat (limitele de o oră nu se termină „peste un minut”)
  errorMessage: (_ctx, detail) => tooManyRequests(detail.timeToBlockExpire),
  throttlers: [
    { name: 'default', ...LIMITS.default },
    { name: 'login-ip', ...LIMITS.loginIp, skipIf: onlyFor('login') },
    { name: 'login-account', ...LIMITS.loginAccount, skipIf: onlyFor('login'), getTracker: ipAndEmail },
    { name: 'register', ...LIMITS.register, skipIf: onlyFor('register') },
    { name: 'forgot-ip', ...LIMITS.forgotIp, skipIf: onlyFor('forgot') },
    { name: 'forgot-account', ...LIMITS.forgotAccount, skipIf: onlyFor('forgot'), getTracker: ipAndEmail },
    { name: 'reset', ...LIMITS.reset, skipIf: onlyFor('reset') },
    { name: 'verify', ...LIMITS.verify, skipIf: onlyFor('verify') },
    { name: 'resend', ...LIMITS.resend, skipIf: onlyFor('resend') },
    { name: 'refresh', ...LIMITS.refresh, skipIf: onlyFor('refresh') },
  ],
};

// Documentația Swagger: implicit doar în afara producției; SWAGGER_ENABLED=true/false o forțează.
export function swaggerEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const flag = env.SWAGGER_ENABLED?.trim().toLowerCase();
  if (flag === 'true') return true;
  if (flag === 'false') return false;
  return env.NODE_ENV !== 'production';
}

// TRUST_PROXY pentru Express: un număr de proxy-uri ("1"), "true", sau o listă/nume ("loopback").
// Fără el, în spatele unui reverse proxy toți utilizatorii ar avea IP-ul proxy-ului.
export function trustProxySetting(value: string | undefined): boolean | number | string | undefined {
  const v = value?.trim();
  if (!v || v.toLowerCase() === 'false') return undefined;
  if (v.toLowerCase() === 'true') return true;
  return /^\d+$/.test(v) ? Number(v) : v;
}
