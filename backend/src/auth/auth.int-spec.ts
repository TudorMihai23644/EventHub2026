import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DataSource, Repository } from 'typeorm';
import { clearTables, openTestDb } from '../test/int-db';
import { AuthService, FORGOT_MESSAGE, INVALID_RESET, INVALID_VERIFY } from './auth.service';
import { TokensService } from './tokens.service';
import { AuthToken } from './auth-token.entity';
import { sessionFromToken } from './jwt-auth.guard';
import { UsersService } from '../users/users.service';
import { User } from '../users/user.entity';
import { Notifications } from '../mail/notifications.service';
import { OutboxEmail } from '../mail/outbox.entity';
import { OutboxWorker } from '../mail/outbox.worker';
import { SCRUBBED } from '../mail/outbox-retry';
import { BatchResult, Mailer, OutgoingEmail } from '../mail/mailer';

const cfg = { appUrl: 'http://app.test', timeZone: 'Europe/Bucharest', from: 'x@test' };

class CapturingMailer extends Mailer {
  readonly name = 'capture';
  sent: OutgoingEmail[] = [];
  async sendBatch(emails: OutgoingEmail[]): Promise<BatchResult> {
    this.sent.push(...emails);
    return { failed: [] };
  }
}

describe('Cont: confirmare email, resetare parolă, sesiuni (integrare)', () => {
  let ds: DataSource;
  let auth: AuthService;
  let jwt: JwtService;
  let users: Repository<User>;
  let outbox: Repository<OutboxEmail>;
  let tokens: Repository<AuthToken>;
  let n = 0;

  beforeAll(async () => {
    ds = await openTestDb();
    users = ds.getRepository(User);
    outbox = ds.getRepository(OutboxEmail);
    tokens = ds.getRepository(AuthToken);
    jwt = new JwtService({ secret: 'test-secret', signOptions: { expiresIn: 3600 } });
    auth = new AuthService(new UsersService(users), jwt, ds, new TokensService(), new Notifications(cfg));
  });
  afterAll(() => ds?.destroy());
  beforeEach(async () => {
    await clearTables(ds);
    await ds.query('TRUNCATE auth_tokens');
  });

  const register = (email = `u${++n}@test.ro`) =>
    auth.register({ name: 'Ana', email, password: 'parola-veche', role: 'PARTICIPANT' });
  /** Linkul din ultimul email de tipul dat (ca utilizatorul care dă click). */
  const linkToken = async (kind: string) => {
    const rows = await outbox.find({ where: { kind }, order: { createdAt: 'DESC' } });
    const m = rows[0]?.text.match(/token=([A-Za-z0-9_-]+)/);
    if (!m) throw new Error(`niciun link în emailul ${kind}`);
    return decodeURIComponent(m[1]);
  };
  const expireAll = () => ds.query(`UPDATE auth_tokens SET "expiresAt" = now() - interval '1 minute'`);

  describe('confirmarea emailului', () => {
    it('contul nou nu este confirmat și primește un link (sensibil) pe email', async () => {
      const res = await register('ana@test.ro');
      expect(res.user.emailVerified).toBe(false);
      const [mail] = await outbox.find({ where: { kind: 'email-verify' } });
      expect(mail).toMatchObject({ to: 'ana@test.ro', sensitive: true, subject: 'Confirmă adresa de email pentru EventHub' });
      expect(mail.text).toContain('http://app.test/confirmare-email?token=');
    });

    it('în baza de date se păstrează doar hash-ul, nu token-ul din link', async () => {
      await register();
      const raw = await linkToken('email-verify');
      const [row] = await tokens.find();
      expect(row.tokenHash).toHaveLength(64);
      expect(row.tokenHash).not.toContain(raw);
    });

    it('linkul confirmă adresa o singură dată', async () => {
      const { user } = await register();
      const raw = await linkToken('email-verify');
      await expect(auth.verifyEmail({ token: raw })).resolves.toMatchObject({ emailVerified: true });
      expect((await users.findOneByOrFail({ id: user.id })).emailVerifiedAt).toBeInstanceOf(Date);
      await expect(auth.verifyEmail({ token: raw })).rejects.toThrow(INVALID_VERIFY);
    });

    it('un link expirat sau inventat este respins', async () => {
      await register();
      const raw = await linkToken('email-verify');
      await expireAll();
      await expect(auth.verifyEmail({ token: raw })).rejects.toThrow(BadRequestException);
      await expect(auth.verifyEmail({ token: 'inventat' })).rejects.toThrow(INVALID_VERIFY);
    });

    it('retrimiterea anulează linkul vechi; după confirmare nu se mai poate retrimite', async () => {
      const { user } = await register();
      const first = await linkToken('email-verify');
      await auth.resendVerification(user.id);
      const second = await linkToken('email-verify');
      expect(second).not.toBe(first);
      await expect(auth.verifyEmail({ token: first })).rejects.toThrow(INVALID_VERIFY);
      await auth.verifyEmail({ token: second });
      await expect(auth.resendVerification(user.id)).rejects.toThrow('deja confirmată');
    });
  });

  describe('resetarea parolei', () => {
    it('răspunsul e identic pentru un cont existent și unul inexistent; email doar pentru cel existent', async () => {
      await register('ana@test.ro');
      await ds.query('DELETE FROM email_outbox');
      const a = await auth.forgotPassword({ email: 'ANA@test.ro ' });
      const b = await auth.forgotPassword({ email: 'nimeni@test.ro' });
      expect(a).toEqual({ message: FORGOT_MESSAGE });
      expect(b).toEqual(a);
      const mails = await outbox.find();
      expect(mails.map((m) => [m.kind, m.to, m.sensitive])).toEqual([['password-reset', 'ana@test.ro', true]]);
    });

    it('parolă nouă: cea veche nu mai merge, cea nouă da, sesiunile vechi sunt închise', async () => {
      const reg = await register('ana@test.ro');
      const oldSession = reg.accessToken;
      expect(await sessionFromToken(jwt, ds, oldSession)).toMatchObject({ id: reg.user.id });

      await auth.forgotPassword({ email: 'ana@test.ro' });
      await auth.resetPassword({ token: await linkToken('password-reset'), password: 'parola-noua' });

      await expect(auth.login({ email: 'ana@test.ro', password: 'parola-veche' })).rejects.toThrow(UnauthorizedException);
      const fresh = await auth.login({ email: 'ana@test.ro', password: 'parola-noua' });
      expect(await sessionFromToken(jwt, ds, oldSession)).toBeNull(); // token de dinainte de resetare
      expect(await sessionFromToken(jwt, ds, fresh.accessToken)).toMatchObject({ id: reg.user.id });
      expect((await users.findOneByOrFail({ id: reg.user.id })).tokenVersion).toBe(1);
    });

    it('trimite „parola a fost schimbată” și confirmă adresa (linkul a ajuns în căsuța ei)', async () => {
      const reg = await register('ana@test.ro');
      await auth.forgotPassword({ email: 'ana@test.ro' });
      await auth.resetPassword({ token: await linkToken('password-reset'), password: 'parola-noua' });
      expect(await outbox.count({ where: { kind: 'password-changed', to: 'ana@test.ro' } })).toBe(1);
      expect((await users.findOneByOrFail({ id: reg.user.id })).emailVerifiedAt).toBeInstanceOf(Date);
    });

    it('linkul merge o singură dată', async () => {
      await register('ana@test.ro');
      await auth.forgotPassword({ email: 'ana@test.ro' });
      const raw = await linkToken('password-reset');
      await auth.resetPassword({ token: raw, password: 'parola-noua' });
      await expect(auth.resetPassword({ token: raw, password: 'alta-parola' })).rejects.toThrow(INVALID_RESET);
    });

    it('o cerere nouă anulează linkul anterior', async () => {
      await register('ana@test.ro');
      await auth.forgotPassword({ email: 'ana@test.ro' });
      const first = await linkToken('password-reset');
      await auth.forgotPassword({ email: 'ana@test.ro' });
      const second = await linkToken('password-reset');
      await expect(auth.resetPassword({ token: first, password: 'parola-noua' })).rejects.toThrow(INVALID_RESET);
      await expect(auth.resetPassword({ token: second, password: 'parola-noua' })).resolves.toBeDefined();
    });

    it('un link expirat este respins și parola rămâne neschimbată', async () => {
      await register('ana@test.ro');
      await auth.forgotPassword({ email: 'ana@test.ro' });
      const raw = await linkToken('password-reset');
      await expireAll();
      await expect(auth.resetPassword({ token: raw, password: 'parola-noua' })).rejects.toThrow(INVALID_RESET);
      await expect(auth.login({ email: 'ana@test.ro', password: 'parola-veche' })).resolves.toBeDefined();
    });

    it('un link de confirmare nu poate fi folosit ca link de resetare', async () => {
      await register('ana@test.ro');
      const verifyRaw = await linkToken('email-verify');
      await expect(auth.resetPassword({ token: verifyRaw, password: 'parola-noua' })).rejects.toThrow(INVALID_RESET);
    });

    it('două resetări simultane cu același link: doar una reușește', async () => {
      await register('ana@test.ro');
      await auth.forgotPassword({ email: 'ana@test.ro' });
      const raw = await linkToken('password-reset');
      const results = await Promise.allSettled([
        auth.resetPassword({ token: raw, password: 'parola-unu' }),
        auth.resetPassword({ token: raw, password: 'parola-doi' }),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    });
  });

  describe('sesiuni', () => {
    it('token-ul unui cont șters nu mai este acceptat', async () => {
      const reg = await register();
      await users.delete({ id: reg.user.id });
      expect(await sessionFromToken(jwt, ds, reg.accessToken)).toBeNull();
    });

    it('token-urile emise înainte de `tv` (fără câmp) contează ca versiunea 0', async () => {
      const reg = await register();
      const legacy = await jwt.signAsync({ sub: reg.user.id, role: 'PARTICIPANT' });
      expect(await sessionFromToken(jwt, ds, legacy)).toMatchObject({ id: reg.user.id, emailVerified: false });
    });

    it('rolul și starea emailului vin din baza de date, nu din token', async () => {
      const reg = await register();
      await users.update({ id: reg.user.id }, { emailVerifiedAt: new Date() });
      expect(await sessionFromToken(jwt, ds, reg.accessToken)).toMatchObject({ emailVerified: true });
    });
  });

  describe('emailurile cu link secret, după trimitere', () => {
    it('ajung întregi la destinatar, dar conținutul lor este șters din coadă', async () => {
      await register('ana@test.ro');
      await auth.forgotPassword({ email: 'ana@test.ro' });
      const mailer = new CapturingMailer();
      await new OutboxWorker(ds, mailer).processBatch();

      expect(mailer.sent.find((e) => e.subject.startsWith('Resetează'))!.text).toMatch(/resetare-parola\?token=/);
      const rows = await outbox.find();
      for (const r of rows) {
        expect(r.status).toBe('SENT');
        if (r.sensitive) expect([r.html, r.text]).toEqual([SCRUBBED, SCRUBBED]);
      }
      expect(rows.filter((r) => r.sensitive)).toHaveLength(2); // confirmare + resetare
    });
  });
});
