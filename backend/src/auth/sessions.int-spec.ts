import { JwtService } from '@nestjs/jwt';
import { DataSource, Repository } from 'typeorm';
import { clearTables, openTestDb } from '../test/int-db';
import { SessionsService } from './sessions.service';
import { RefreshToken } from './refresh-token.entity';
import { AuthService } from './auth.service';
import { TokensService } from './tokens.service';
import { sessionFromToken } from './jwt-auth.guard';
import { hashToken } from './tokens.service';
import { UsersService } from '../users/users.service';
import { User } from '../users/user.entity';
import { Notifications } from '../mail/notifications.service';
import { OutboxEmail } from '../mail/outbox.entity';

const cfg = { appUrl: 'http://app.test', timeZone: 'Europe/Bucharest', from: 'x@test' };

describe('Sesiuni cu refresh token (integrare)', () => {
  let ds: DataSource;
  let sessions: SessionsService;
  let auth: AuthService;
  let jwt: JwtService;
  let rows: Repository<RefreshToken>;
  let users: Repository<User>;
  let n = 0;

  beforeAll(async () => {
    ds = await openTestDb();
    rows = ds.getRepository(RefreshToken);
    users = ds.getRepository(User);
    sessions = new SessionsService(ds);
    jwt = new JwtService({ secret: 'test-secret', signOptions: { expiresIn: 900 } });
    auth = new AuthService(new UsersService(users), jwt, ds, new TokensService(), new Notifications(cfg), sessions);
  });
  afterAll(() => ds?.destroy());
  beforeEach(async () => {
    await clearTables(ds);
    await ds.query('TRUNCATE refresh_tokens, auth_tokens');
  });

  const signUp = () => auth.register({ name: 'Ana', email: `s${++n}@test.ro`, password: 'parola123', role: 'PARTICIPANT' }, 'Mozilla/5.0 Test');
  const row = (raw: string) => rows.findOneByOrFail({ tokenHash: hashToken(raw) });
  /** Mută în trecut momentul rotației, ca să simulăm „au trecut N secunde”. */
  const ageRotation = (raw: string, seconds: number) =>
    ds.query(`UPDATE refresh_tokens SET "replacedAt" = now() - make_interval(secs => $2) WHERE "tokenHash" = $1`, [hashToken(raw), seconds]);

  it('autentificarea creează o sesiune: doar hash-ul în baza de date, 30 de zile, limită 90 de zile', async () => {
    const s = await signUp();
    const r = await row(s.refresh.raw);
    expect(r.tokenHash).not.toContain(s.refresh.raw);
    expect(r.userAgent).toBe('Mozilla/5.0 Test');
    const days = (d: Date) => Math.round((d.getTime() - r.createdAt.getTime()) / 86_400_000);
    expect([days(r.expiresAt), days(r.familyExpiresAt)]).toEqual([30, 90]);
  });

  it('reînnoirea înlocuiește token-ul cu unul nou din aceeași familie', async () => {
    const s = await signUp();
    const res = await auth.refreshSession(s.refresh.raw, 'UA');
    expect(res?.user.id).toBe(s.user.id);
    expect(await sessionFromToken(jwt, ds, res!.accessToken)).toMatchObject({ id: s.user.id });
    const [old, next] = [await row(s.refresh.raw), await row(res!.refresh!.raw)];
    expect(old.replacedAt).toBeInstanceOf(Date);
    expect(old.lastUsedAt).toBeInstanceOf(Date);
    expect(next.familyId).toBe(old.familyId);
    expect(next.familyExpiresAt).toEqual(old.familyExpiresAt); // limita de 90 de zile nu se mută
  });

  it('același token folosit din nou în 30 s (alt tab) → access token, fără token nou, familia rămâne', async () => {
    const s = await signUp();
    const first = await auth.refreshSession(s.refresh.raw);
    const second = await auth.refreshSession(s.refresh.raw);
    expect(second?.accessToken).toBeTruthy();
    expect(second?.refresh).toBeUndefined();
    expect(await auth.refreshSession(first!.refresh!.raw)).not.toBeNull(); // cel nou merge în continuare
  });

  it('două reînnoiri simultane cu același cookie: una rotește, cealaltă primește grace; nimeni nu e deconectat', async () => {
    const s = await signUp();
    const [a, b] = await Promise.all([auth.refreshSession(s.refresh.raw), auth.refreshSession(s.refresh.raw)]);
    expect(a && b).toBeTruthy();
    expect([a!.refresh, b!.refresh].filter(Boolean)).toHaveLength(1);
    expect(await rows.count()).toBe(2); // originalul + exact un token nou
    expect((await rows.find()).every((r) => r.revokedAt === null)).toBe(true);
  });

  it('token înlocuit folosit din nou după 30 s → furt: toată familia este revocată', async () => {
    const s = await signUp();
    const next = await auth.refreshSession(s.refresh.raw);
    await ageRotation(s.refresh.raw, 31);
    expect(await auth.refreshSession(s.refresh.raw)).toBeNull(); // hoțul
    expect(await auth.refreshSession(next!.refresh!.raw)).toBeNull(); // și utilizatorul trebuie să se autentifice din nou
    expect((await rows.find()).every((r) => r.revokedAt !== null)).toBe(true);
  });

  it('furtul revocă doar acea autentificare, nu și sesiunea de pe alt dispozitiv', async () => {
    const s = await signUp();
    const laptop = await auth.login({ email: s.user.email, password: 'parola123' }, 'Laptop');
    await auth.refreshSession(s.refresh.raw);
    await ageRotation(s.refresh.raw, 60);
    await auth.refreshSession(s.refresh.raw);
    expect(await auth.refreshSession(laptop.refresh.raw)).not.toBeNull();
  });

  it('token expirat sau peste limita de 90 de zile → respins', async () => {
    const a = await signUp();
    await ds.query(`UPDATE refresh_tokens SET "expiresAt" = now() - interval '1 second' WHERE "tokenHash" = $1`, [hashToken(a.refresh.raw)]);
    expect(await auth.refreshSession(a.refresh.raw)).toBeNull();
    const b = await signUp();
    await ds.query(`UPDATE refresh_tokens SET "familyExpiresAt" = now() - interval '1 second' WHERE "tokenHash" = $1`, [hashToken(b.refresh.raw)]);
    expect(await auth.refreshSession(b.refresh.raw)).toBeNull();
    expect(await auth.refreshSession('inventat')).toBeNull();
    expect(await auth.refreshSession(undefined)).toBeNull();
  });

  it('logout închide sesiunea acestui dispozitiv; celelalte rămân', async () => {
    const s = await signUp();
    const phone = await auth.login({ email: s.user.email, password: 'parola123' }, 'Phone');
    const rotated = await auth.refreshSession(s.refresh.raw);
    await auth.logout(s.refresh.raw); // chiar și cu un token deja înlocuit, se închide toată familia
    expect(await auth.refreshSession(rotated!.refresh!.raw)).toBeNull();
    expect(await auth.refreshSession(phone.refresh.raw)).not.toBeNull();
  });

  it('logout pe toate dispozitivele: toate refresh token-urile și toate access token-urile', async () => {
    const s = await signUp();
    const phone = await auth.login({ email: s.user.email, password: 'parola123' }, 'Phone');
    await auth.logoutAll(s.user.id);
    expect(await auth.refreshSession(s.refresh.raw)).toBeNull();
    expect(await auth.refreshSession(phone.refresh.raw)).toBeNull();
    expect(await sessionFromToken(jwt, ds, phone.accessToken)).toBeNull(); // tokenVersion a crescut
  });

  it('resetarea parolei revocă toate sesiunile', async () => {
    const s = await signUp();
    await auth.forgotPassword({ email: s.user.email });
    const mail = await ds.getRepository(OutboxEmail).findOneByOrFail({ kind: 'password-reset' });
    const token = decodeURIComponent(mail.text.match(/token=([A-Za-z0-9_%-]+)/)![1]);
    await auth.resetPassword({ token, password: 'parola-noua' });
    expect(await auth.refreshSession(s.refresh.raw)).toBeNull();
  });

  it('curățenia zilnică șterge doar token-urile expirate / revocate de peste 7 zile', async () => {
    const [a, b, c] = [await signUp(), await signUp(), await signUp()];
    await ds.query(`UPDATE refresh_tokens SET "expiresAt" = now() - interval '8 days' WHERE "tokenHash" = $1`, [hashToken(a.refresh.raw)]);
    await ds.query(`UPDATE refresh_tokens SET "revokedAt" = now() - interval '8 days' WHERE "tokenHash" = $1`, [hashToken(b.refresh.raw)]);
    await ds.query(`UPDATE refresh_tokens SET "revokedAt" = now() - interval '2 days' WHERE "tokenHash" = $1`, [hashToken(c.refresh.raw)]);
    expect(await sessions.cleanup()).toBe(2);
    expect((await rows.find()).map((r) => r.tokenHash)).toEqual([hashToken(c.refresh.raw)]);
  });
});
