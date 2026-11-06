import { JwtService } from '@nestjs/jwt';
import { ConflictException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { clearTables, openTestDb } from '../../test/int-db';
import { SessionsService } from '../sessions.service';
import { AuthService } from '../auth.service';
import { TokensService } from '../tokens.service';
import { sessionFromToken } from '../jwt-auth.guard';
import { UsersService } from '../../users/users.service';
import { User } from '../../users/user.entity';
import { Notifications } from '../../mail/notifications.service';

const cfg = { appUrl: 'http://app.test', timeZone: 'Europe/Bucharest', from: 'x@test' };

describe('„Continuă cu Google” (integrare)', () => {
  let ds: DataSource;
  let auth: AuthService;
  let jwt: JwtService;
  let users: Repository<User>;

  beforeAll(async () => {
    ds = await openTestDb();
    users = ds.getRepository(User);
    jwt = new JwtService({ secret: 'test-secret', signOptions: { expiresIn: 900 } });
    auth = new AuthService(new UsersService(users), jwt, ds, new TokensService(), new Notifications(cfg), new SessionsService(ds));
  });
  afterAll(() => ds?.destroy());
  beforeEach(async () => {
    await clearTables(ds);
    await ds.query('TRUNCATE refresh_tokens, auth_tokens');
  });

  const withSecrets = (email: string) =>
    users.createQueryBuilder('u').addSelect(['u.passwordHash', 'u.googleId']).where('u.email = :email', { email }).getOneOrFail();
  const google = (over: Partial<{ sub: string; email: string; name: string }> = {}) => ({ sub: 'g-1', email: 'ana@gmail.com', name: 'Ana Pop', ...over });

  it('cont nou: participant, adresă confirmată, fără parolă; a doua oară → același cont', async () => {
    const first = await auth.signInWithGoogle(google(), 'UA');
    expect(first.user).toMatchObject({ email: 'ana@gmail.com', name: 'Ana Pop', role: 'PARTICIPANT', emailVerified: true });
    expect(first.refresh.raw).toBeTruthy();
    expect(await withSecrets('ana@gmail.com')).toMatchObject({ passwordHash: null, googleId: 'g-1' });
    const again = await auth.signInWithGoogle(google({ email: 'ana.noua@gmail.com' }), 'UA'); // Google: același sub, alt email
    expect(again.user.id).toBe(first.user.id);
    expect(await users.count()).toBe(1);
  });

  it('fără parolă: login cu parolă → USE_GOOGLE; schimbarea parolei / ștergerea → NO_PASSWORD; „Ai uitat parola” o setează', async () => {
    const { user } = await auth.signInWithGoogle(google());
    await expect(auth.login({ email: 'ana@gmail.com', password: 'orice-parola' })).rejects.toMatchObject({ response: { code: 'USE_GOOGLE' } });
    await expect(auth.changePassword(user.id, 'x', 'parola-noua')).rejects.toMatchObject({ response: { code: 'NO_PASSWORD' } });
    await expect(auth.assertPassword(user.id, 'x')).rejects.toMatchObject({ response: { code: 'NO_PASSWORD' } });

    // „Ai uitat parola?” trimite un link; token-ul din link îl emitem direct (în email e doar varianta brută)
    const raw = await ds.transaction((m) => new TokensService().issue(m, user.id, 'PASSWORD_RESET'));
    await auth.resetPassword({ token: raw, password: 'parola-noua' });
    expect((await auth.login({ email: 'ana@gmail.com', password: 'parola-noua' })).user.id).toBe(user.id);
  });

  it('cont existent cu adresa confirmată: se leagă, parola și sesiunile rămân', async () => {
    const reg = await auth.register({ name: 'Ana', email: 'ana@gmail.com', password: 'parola123', role: 'PARTICIPANT' });
    await users.update({ id: reg.user.id }, { emailVerifiedAt: new Date() });
    const g = await auth.signInWithGoogle(google());
    expect(g.user.id).toBe(reg.user.id);
    expect((await auth.login({ email: 'ana@gmail.com', password: 'parola123' })).user.id).toBe(reg.user.id);
    expect(await auth.refreshSession(reg.refresh.raw)).not.toBeNull();
    expect(await sessionFromToken(jwt, ds, reg.accessToken)).toMatchObject({ id: reg.user.id });
  });

  it('cont existent NECONFIRMAT (posibil creat de altcineva cu adresa ta): parola ștearsă, sesiunile închise', async () => {
    const attacker = await auth.register({ name: 'Intrus', email: 'ana@gmail.com', password: 'parola-intrus', role: 'PARTICIPANT' });
    const g = await auth.signInWithGoogle(google());
    expect(g.user).toMatchObject({ id: attacker.user.id, emailVerified: true });
    await expect(auth.login({ email: 'ana@gmail.com', password: 'parola-intrus' })).rejects.toMatchObject({ response: { code: 'USE_GOOGLE' } });
    expect(await auth.refreshSession(attacker.refresh.raw)).toBeNull(); // sesiunea veche nu se mai reînnoiește
    expect(await sessionFromToken(jwt, ds, attacker.accessToken)).toBeNull(); // nici access token-ul vechi
    expect(await auth.refreshSession(g.refresh.raw)).not.toBeNull(); // doar sesiunea proprietarului
  });

  it('adresa e deja legată de ALT cont Google → 409, nimic schimbat', async () => {
    await auth.signInWithGoogle(google());
    await expect(auth.signInWithGoogle(google({ sub: 'g-2' }))).rejects.toThrow(ConflictException);
    expect((await withSecrets('ana@gmail.com')).googleId).toBe('g-1');
  });

  it('un organizator existent se poate conecta cu Google (rolul rămâne)', async () => {
    const org = await users.save(users.create({ name: 'Org', email: 'org@gmail.com', passwordHash: 'x', role: 'ORGANIZER', emailVerifiedAt: new Date() }));
    expect((await auth.signInWithGoogle(google({ sub: 'g-org', email: 'org@gmail.com' }))).user).toMatchObject({ id: org.id, role: 'ORGANIZER' });
  });

  it('două conectări simultane, prima dată: un singur cont', async () => {
    const results = await Promise.allSettled([auth.signInWithGoogle(google()), auth.signInWithGoogle(google())]);
    expect(await users.count()).toBe(1);
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled']); // niciun 500
    const [a, b] = results as PromiseFulfilledResult<Awaited<ReturnType<AuthService['signInWithGoogle']>>>[];
    expect(a.value.user.id).toBe(b.value.user.id);
  });
});
