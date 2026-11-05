import { ForbiddenException } from '@nestjs/common';
import { AuthService } from './auth.service';

function setup() {
  const users: any = {
    findByEmailWithPassword: jest.fn(async () => null),
    create: jest.fn(async (d: any) => ({ id: 'u1', ...d })),
  };
  const jwt: any = { signAsync: jest.fn(async () => 'token') };
  return { service: new AuthService(users, jwt), users };
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
