import { ForbiddenException } from '@nestjs/common';
import { AuthService } from './auth.service';

function setup() {
  const users: any = { findByEmailWithPassword: jest.fn(async () => null) };
  const jwt: any = { signAsync: jest.fn(async () => 'token') };
  const manager: any = {
    create: jest.fn((_e: unknown, d: object) => d),
    save: jest.fn(async (d: any) => ({ id: 'u1', tokenVersion: 0, emailVerifiedAt: null, ...d })),
  };
  const dataSource: any = { transaction: (cb: (m: unknown) => unknown) => cb(manager) };
  const tokens: any = { issue: jest.fn(async () => 'raw-token') };
  const notifications: any = { emailVerification: jest.fn() };
  const sessions: any = { start: jest.fn(async () => ({ raw: 'refresh-raw', expiresAt: new Date() })) };
  const service = new AuthService(users, jwt, dataSource, tokens, notifications, sessions);
  // `users.create` = contul salvat (în tranzacție)
  return { service, users: { create: manager.save }, tokens, notifications, jwt };
}

const base = { name: 'Ana', email: 'ana@test.ro', password: 'parola123' };

describe('AuthService.register - cont de organizator', () => {
  const OLD = process.env.ORGANIZER_INVITE_CODE;
  afterEach(() => { process.env.ORGANIZER_INVITE_CODE = OLD; });

  it('refuză organizatorul fără cod de invitație', async () => {
    process.env.ORGANIZER_INVITE_CODE = 'secret-123';
    const { service, users } = setup();
    await expect(service.register({ ...base, role: 'ORGANIZER' })).rejects.toThrow(ForbiddenException);
    expect(users.create).not.toHaveBeenCalled();
  });

  it('refuză un cod greșit', async () => {
    process.env.ORGANIZER_INVITE_CODE = 'secret-123';
    const { service } = setup();
    await expect(service.register({ ...base, role: 'ORGANIZER', inviteCode: 'gresit' })).rejects.toThrow(ForbiddenException);
  });

  it('refuză orice organizator când codul nu este configurat', async () => {
    delete process.env.ORGANIZER_INVITE_CODE;
    const { service } = setup();
    await expect(service.register({ ...base, role: 'ORGANIZER', inviteCode: '' })).rejects.toThrow(ForbiddenException);
  });

  it('acceptă organizatorul cu codul corect', async () => {
    process.env.ORGANIZER_INVITE_CODE = 'secret-123';
    const { service } = setup();
    const res = await service.register({ ...base, role: 'ORGANIZER', inviteCode: 'secret-123' });
    expect(res.user.role).toBe('ORGANIZER');
  });

  it('participantul se înregistrează fără cod', async () => {
    delete process.env.ORGANIZER_INVITE_CODE;
    const { service } = setup();
    const res = await service.register({ ...base, role: 'PARTICIPANT' });
    expect(res.user.role).toBe('PARTICIPANT');
  });
});

describe('AuthService.register - confirmarea emailului', () => {
  it('contul nou nu este confirmat și primește un link de confirmare, în aceeași tranzacție', async () => {
    const { service, tokens, notifications } = setup();
    const res = await service.register({ ...base, role: 'PARTICIPANT' });
    expect(res.user).toEqual({ id: 'u1', name: 'Ana', email: 'ana@test.ro', role: 'PARTICIPANT', emailVerified: false });
    expect(tokens.issue).toHaveBeenCalledWith(expect.anything(), 'u1', 'EMAIL_VERIFY');
    expect(notifications.emailVerification).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ email: 'ana@test.ro' }), 'raw-token');
  });

  it('token-ul de sesiune conține versiunea sesiunilor (tv)', async () => {
    const { service, jwt } = setup();
    await service.register({ ...base, role: 'PARTICIPANT' });
    expect(jwt.signAsync).toHaveBeenCalledWith({ sub: 'u1', role: 'PARTICIPANT', tv: 0 });
  });

  it('organizator respins: nici cont, nici email', async () => {
    process.env.ORGANIZER_INVITE_CODE = 'secret-123';
    const { service, notifications } = setup();
    await expect(service.register({ ...base, role: 'ORGANIZER', inviteCode: 'gresit' })).rejects.toThrow(ForbiddenException);
    expect(notifications.emailVerification).not.toHaveBeenCalled();
  });
});
