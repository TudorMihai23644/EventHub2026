import { timingSafeEqual } from 'crypto';
import { ConflictException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { secret } from '../common/secrets';
import { UsersService } from '../users/users.service';
import { User } from '../users/user.entity';
import { LoginDto, RegisterDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
  constructor(private readonly users: UsersService, private readonly jwt: JwtService) {}

  async register(dto: RegisterDto) {
    if (dto.role === 'ORGANIZER') this.assertInviteCode(dto.inviteCode);
    const email = dto.email.trim().toLowerCase();
    if (await this.users.findByEmailWithPassword(email)) {
      const message = 'Există deja un cont cu această adresă de email.';
      throw new ConflictException({ statusCode: 409, error: 'Conflict', message, fields: { email: message } });
    }
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.users.create({ name: dto.name.trim(), email, passwordHash, role: dto.role });
    return this.session(user);
  }

  async login(dto: LoginDto) {
    const user = await this.users.findByEmailWithPassword(dto.email.trim().toLowerCase());
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Email sau parolă incorecte.');
    }
    return this.session(user);
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

  private async session(user: User) {
    const accessToken = await this.jwt.signAsync({ sub: user.id, role: user.role });
    return {
      accessToken,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    };
  }
}
