import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { VerifiedEmailGuard } from './verified-email.guard';

const ctx = (user: unknown, action = 'să te înscrii la evenimente') => {
  const handler = () => undefined;
  Reflect.defineMetadata('eventhub:verified-email-action', action, handler);
  return { switchToHttp: () => ({ getRequest: () => ({ user }) }), getHandler: () => handler } as any;
};

describe('VerifiedEmailGuard', () => {
  const guard = new VerifiedEmailGuard(new Reflector());

  it('lasă să treacă un cont confirmat', () => {
    expect(guard.canActivate(ctx({ id: 'u1', role: 'PARTICIPANT', emailVerified: true }))).toBe(true);
  });

  it('oprește un cont neconfirmat cu 403, codul EMAIL_NOT_VERIFIED și acțiunea în mesaj', () => {
    try {
      guard.canActivate(ctx({ id: 'u1', role: 'PARTICIPANT', emailVerified: false }));
      fail('trebuia să arunce');
    } catch (e) {
      expect(e).toBeInstanceOf(ForbiddenException);
      expect((e as ForbiddenException).getResponse()).toMatchObject({
        statusCode: 403,
        code: 'EMAIL_NOT_VERIFIED',
        message: expect.stringContaining('Confirmă-ți adresa de email înainte să te înscrii la evenimente.'),
      });
    }
  });

  it('fără sesiune (guard pus înaintea lui JwtAuthGuard) → 401, nu trece din greșeală', () => {
    expect(() => guard.canActivate(ctx(undefined))).toThrow(UnauthorizedException);
  });
});
