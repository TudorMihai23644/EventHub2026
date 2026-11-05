import { ForbiddenException } from '@nestjs/common';
import { ACCESS_TOKEN_TTL_SECONDS, ROTATION_GRACE_SECONDS, accessTokenTtl, decideRefresh, nextRefreshExpiry } from './session-policy';
import { CLIENT_HEADER, ClientHeaderGuard, REFRESH_COOKIE_PATH, cookieSettings } from './cookies';

const now = new Date('2026-11-05T12:00:00Z');
const at = (s: number) => new Date(now.getTime() + s * 1000);
const DAY = 86_400;
const token = (over: Partial<Parameters<typeof decideRefresh>[0] & object> = {}) => ({
  expiresAt: at(10 * DAY), familyExpiresAt: at(60 * DAY), replacedAt: null, revokedAt: null, ...over,
});

describe('decideRefresh', () => {
  it('token valid → rotate', () => expect(decideRefresh(token(), now)).toBe('rotate'));
  it('inexistent → invalid', () => expect(decideRefresh(null, now)).toBe('invalid'));
  it('revocat → invalid', () => expect(decideRefresh(token({ revokedAt: at(-5) }), now)).toBe('invalid'));
  it('expirat → invalid', () => expect(decideRefresh(token({ expiresAt: at(-1) }), now)).toBe('invalid'));
  it('peste limita de 90 de zile a sesiunii → invalid', () => expect(decideRefresh(token({ familyExpiresAt: at(-1) }), now)).toBe('invalid'));

  it(`înlocuit acum ${ROTATION_GRACE_SECONDS} s sau mai puțin (alt tab) → grace`, () => {
    expect(decideRefresh(token({ replacedAt: at(-1) }), now)).toBe('grace');
    expect(decideRefresh(token({ replacedAt: at(-ROTATION_GRACE_SECONDS) }), now)).toBe('grace');
  });

  it('înlocuit demult și folosit din nou → theft', () => {
    expect(decideRefresh(token({ replacedAt: at(-ROTATION_GRACE_SECONDS - 1) }), now)).toBe('theft');
  });

  it('înlocuit dar revocat (logout) → invalid, nu theft', () => {
    expect(decideRefresh(token({ replacedAt: at(-100), revokedAt: at(-50) }), now)).toBe('invalid');
  });
});

describe('nextRefreshExpiry', () => {
  it('peste 30 de zile', () => expect(nextRefreshExpiry(now, at(60 * DAY))).toEqual(at(30 * DAY)));
  it('dar niciodată după limita sesiunii', () => expect(nextRefreshExpiry(now, at(5 * DAY))).toEqual(at(5 * DAY)));
});

describe('accessTokenTtl', () => {
  it('implicit 15 minute', () => expect(accessTokenTtl({})).toBe(15 * 60));
  it('ACCESS_TOKEN_TTL_SECONDS (pentru teste)', () => expect(accessTokenTtl({ ACCESS_TOKEN_TTL_SECONDS: '2' })).toBe(2));
  it('valori invalide → implicit', () => {
    for (const v of ['0', '-5', 'abc', '1.5']) expect(accessTokenTtl({ ACCESS_TOKEN_TTL_SECONDS: v })).toBe(ACCESS_TOKEN_TTL_SECONDS);
  });
});

describe('cookieSettings', () => {
  it.each([
    [{}, { secure: false, sameSite: 'lax' }],
    [{ NODE_ENV: 'production' }, { secure: true, sameSite: 'lax' }],
    [{ NODE_ENV: 'production', COOKIE_SECURE: 'false' }, { secure: false, sameSite: 'lax' }], // docker compose local
    [{ COOKIE_SECURE: 'true' }, { secure: true, sameSite: 'lax' }],
    [{ COOKIE_SAMESITE: 'strict' }, { secure: false, sameSite: 'strict' }],
    [{ COOKIE_SAMESITE: 'none', COOKIE_SECURE: 'false' }, { secure: true, sameSite: 'none' }], // none cere Secure
    [{ COOKIE_SAMESITE: 'ceva' }, { secure: false, sameSite: 'lax' }],
  ])('%j → %j', (env, expected) => {
    expect(cookieSettings(env as NodeJS.ProcessEnv)).toMatchObject(expected);
  });

  it('domeniul vine din COOKIE_DOMAIN; calea este doar /api/auth', () => {
    expect(cookieSettings({ COOKIE_DOMAIN: '.eventhub.ro' } as NodeJS.ProcessEnv).domain).toBe('.eventhub.ro');
    expect(REFRESH_COOKIE_PATH).toBe('/api/auth');
  });
});

describe('ClientHeaderGuard (CSRF)', () => {
  const ctx = (headers: Record<string, string>) => ({ switchToHttp: () => ({ getRequest: () => ({ headers }) }) }) as any;
  const guard = new ClientHeaderGuard();
  it('cu antetul corect trece', () => expect(guard.canActivate(ctx({ [CLIENT_HEADER]: 'web' }))).toBe(true));
  it('fără antet sau cu altă valoare → 403', () => {
    expect(() => guard.canActivate(ctx({}))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(ctx({ [CLIENT_HEADER]: 'altceva' }))).toThrow(ForbiddenException);
  });
});
