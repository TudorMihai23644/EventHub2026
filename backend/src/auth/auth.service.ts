import { timingSafeEqual } from 'crypto';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { DataSource, IsNull } from 'typeorm';
import { secret } from '../common/secrets';
import { UsersService } from '../users/users.service';
import { User, publicUser } from '../users/user.entity';
import { Notifications } from '../mail/notifications.service';
import { TokensService } from './tokens.service';
import { SessionsService } from './sessions.service';
import { ForgotPasswordDto, LoginDto, RegisterDto, ResetPasswordDto, VerifyEmailDto } from './dto/auth.dto';

// Același răspuns indiferent dacă există sau nu un cont: formularul nu dezvăluie ce adrese au cont.
export const FORGOT_MESSAGE = 'Dacă există un cont cu această adresă, vei primi un email cu instrucțiuni.';
// Un singur mesaj pentru link inexistent / expirat / deja folosit: nimic de ghicit.
export const INVALID_RESET = 'Linkul de resetare nu mai este valabil. Cere unul nou.';
export const INVALID_VERIFY = 'Linkul de confirmare nu mai este valabil. Cere unul nou.';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly dataSource: DataSource,
    private readonly tokens: TokensService,
    private readonly notifications: Notifications,
    private readonly sessions: SessionsService,
  ) {}

  async register(dto: RegisterDto, userAgent?: string) {
    if (dto.role === 'ORGANIZER') this.assertInviteCode(dto.inviteCode);
    const email = normalizeEmail(dto.email);
    if (await this.users.findByEmailWithPassword(email)) {
      const message = 'Există deja un cont cu această adresă de email.';
      throw new ConflictException({ statusCode: 409, error: 'Conflict', message, fields: { email: message } });
    }
    const passwordHash = await bcrypt.hash(dto.password, 10);
    // Contul și emailul de confirmare: împreună sau deloc.
    const user = await this.dataSource.transaction(async (m) => {
      const u = await m.save(m.create(User, { name: dto.name.trim(), email, passwordHash, role: dto.role }));
      const token = await this.tokens.issue(m, u.id, 'EMAIL_VERIFY');
      await this.notifications.emailVerification(m, u, token);
      return u;
    });
    return this.session(user, userAgent);
  }

  async login(dto: LoginDto, userAgent?: string) {
    const user = await this.users.findByEmailWithPassword(normalizeEmail(dto.email));
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Email sau parolă incorecte.');
    }
    return this.session(user, userAgent);
  }

  /**
   * Reînnoirea cu refresh token-ul din cookie. null = sesiune invalidă (controller-ul șterge cookie-ul și răspunde 401).
   * `refresh` lipsește la 'grace': browserul are deja cookie-ul nou (l-a primit alt tab), deci nu îl înlocuim.
   */
  async refreshSession(raw: string | undefined, userAgent?: string) {
    const r = await this.sessions.refresh(raw, userAgent);
    if ((r.decision !== 'rotate' && r.decision !== 'grace') || !r.userId) return null;
    const user = await this.users.findById(r.userId);
    if (!user) return null;
    return { accessToken: await this.accessToken(user), user: publicUser(user), refresh: r.refresh };
  }

  /** Logout: închide sesiunea acestui dispozitiv (funcționează și cu access token-ul expirat). */
  async logout(raw: string | undefined) {
    await this.sessions.revokeByRaw(raw);
  }

  /** Logout pe toate dispozitivele: toate refresh token-urile + toate access token-urile (`tokenVersion`). */
  async logoutAll(userId: string) {
    await this.dataSource.transaction(async (m) => {
      await this.sessions.revokeAllForUser(m, userId);
      await m.update(User, { id: userId }, { tokenVersion: () => '"tokenVersion" + 1' });
    });
  }

  async me(userId: string) {
    const user = await this.users.findById(userId);
    if (!user) throw new NotFoundException('Contul nu mai există.');
    return publicUser(user);
  }

  /** Trimite un link de resetare dacă există contul. Răspunsul e mereu același. */
  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.users.findByEmailWithPassword(normalizeEmail(dto.email));
    if (user) {
      await this.dataSource.transaction(async (m) => {
        const token = await this.tokens.issue(m, user.id, 'PASSWORD_RESET');
        await this.notifications.passwordReset(m, user, token);
      });
    }
    return { message: FORGOT_MESSAGE };
  }

  /** Parolă nouă din linkul primit pe email. Închide toate sesiunile existente ale contului. */
  async resetPassword(dto: ResetPasswordDto) {
    const passwordHash = await bcrypt.hash(dto.password, 10);
    await this.dataSource.transaction(async (m) => {
      const token = await this.tokens.consume(m, dto.token, 'PASSWORD_RESET');
      if (!token) throw tokenError(INVALID_RESET);
      await m.update(User, { id: token.userId }, {
        passwordHash,
        tokenVersion: () => '"tokenVersion" + 1', // JWT-urile emise înainte nu mai sunt acceptate
      });
      // Linkul a ajuns în căsuța de email, deci adresa este a lui.
      await m.update(User, { id: token.userId, emailVerifiedAt: IsNull() }, { emailVerifiedAt: () => 'now()' });
      await this.tokens.revokeAll(m, token.userId, 'PASSWORD_RESET');
      await this.sessions.revokeAllForUser(m, token.userId); // nicio sesiune veche nu se mai poate reînnoi
      await this.notifications.passwordChanged(m, await m.findOneByOrFail(User, { id: token.userId }));
    });
    return { message: 'Parola a fost schimbată. Autentifică-te cu noua parolă.' };
  }

  /** Confirmarea adresei din linkul primit pe email. Nu cere autentificare (linkul poate fi deschis pe alt dispozitiv). */
  async verifyEmail(dto: VerifyEmailDto) {
    await this.dataSource.transaction(async (m) => {
      const token = await this.tokens.consume(m, dto.token, 'EMAIL_VERIFY');
      if (!token) throw tokenError(INVALID_VERIFY);
      await m.update(User, { id: token.userId, emailVerifiedAt: IsNull() }, { emailVerifiedAt: () => 'now()' });
    });
    return { message: 'Adresa de email a fost confirmată.', emailVerified: true };
  }

  async resendVerification(userId: string) {
    const user = await this.users.findById(userId);
    if (!user) throw new NotFoundException('Contul nu mai există.');
    if (user.emailVerifiedAt) {
      throw new BadRequestException({ statusCode: 400, error: 'Bad Request', message: 'Adresa ta de email este deja confirmată.' });
    }
    await this.dataSource.transaction(async (m) => {
      const token = await this.tokens.issue(m, user.id, 'EMAIL_VERIFY'); // anulează linkul anterior
      await this.notifications.emailVerification(m, user, token);
    });
    return { message: 'Ți-am trimis un nou email de confirmare.' };
  }

  // Conturile de organizator se creează doar cu codul de invitație din
  // ORGANIZER_INVITE_CODE. Dacă variabila nu e setată, nimeni nu se poate
  // înregistra ca organizator.
  private assertInviteCode(provided?: string) {
    const expected = secret('ORGANIZER_INVITE_CODE', false);
    const a = Buffer.from(provided ?? '');
    const b = Buffer.from(expected ?? '');
    if (!expected || a.length !== b.length || !timingSafeEqual(a, b)) {
      const message = 'Cod de invitație invalid. Conturile de organizator se creează doar pe bază de invitație.';
      throw new ForbiddenException({ statusCode: 403, error: 'Forbidden', message, fields: { inviteCode: message } });
    }
  }

  /** Autentificare reușită: access token (în corpul răspunsului) + refresh token (controller-ul îl pune în cookie). */
  private async session(user: User, userAgent?: string) {
    const refresh = await this.sessions.start(user.id, userAgent);
    return { accessToken: await this.accessToken(user), user: publicUser(user), refresh };
  }

  // `tv`: versiunea sesiunilor contului; după resetarea parolei sau logout-all, token-urile cu `tv` vechi sunt respinse.
  // Durata (15 minute) vine din JwtModule (auth.module.ts).
  private accessToken(user: Pick<User, 'id' | 'role' | 'tokenVersion'>) {
    return this.jwt.signAsync({ sub: user.id, role: user.role, tv: user.tokenVersion ?? 0 });
  }
}

const normalizeEmail = (email: string) => email.trim().toLowerCase();
const tokenError = (message: string) =>
  new BadRequestException({ statusCode: 400, error: 'Bad Request', code: 'TOKEN_INVALID', message });
