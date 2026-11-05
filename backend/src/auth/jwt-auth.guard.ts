import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import { User } from '../users/user.entity';
import { AuthUser } from './roles';

const INVALID_SESSION = 'Sesiune invalidă sau expirată. Autentifică-te din nou.';

/**
 * Semnătura JWT nu ajunge: se verifică și contul curent, cu o interogare pe cheia primară.
 *  - contul a fost șters → token respins (înainte rămânea valabil până expira);
 *  - `tv` din token ≠ `tokenVersion` (parola a fost resetată între timp) → token respins;
 *  - rolul și starea emailului vin din baza de date, nu din token (sunt mereu la zi).
 * Token-urile emise înainte de `tv` (fără câmp) contează ca versiunea 0, deci sesiunile existente nu se pierd la actualizare.
 */
export async function sessionFromToken(jwt: JwtService, dataSource: DataSource, token: string): Promise<AuthUser | null> {
  let payload: { sub?: string; tv?: number };
  try {
    payload = await jwt.verifyAsync(token);
  } catch {
    return null;
  }
  if (!payload.sub) return null;
  const user = await dataSource.getRepository(User).findOne({
    where: { id: payload.sub },
    select: { id: true, role: true, tokenVersion: true, emailVerifiedAt: true },
  });
  if (!user || user.tokenVersion !== (payload.tv ?? 0)) return null;
  return { id: user.id, role: user.role, emailVerified: !!user.emailVerifiedAt };
}

function bearer(req: { headers: Record<string, string | undefined> }): string | null {
  const [type, token] = (req.headers.authorization ?? '').split(' ');
  return type === 'Bearer' && token ? token : null;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService, private readonly dataSource: DataSource) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const token = bearer(req);
    if (!token) throw new UnauthorizedException('Autentificare necesară.');
    const user = await sessionFromToken(this.jwt, this.dataSource, token);
    if (!user) throw new UnauthorizedException(INVALID_SESSION);
    req.user = user;
    return true;
  }
}

// Pentru rute publice care își adaptează răspunsul dacă utilizatorul este autentificat
// (ex. `isRegistered`, `canRegister`). Token lipsă, invalid sau învechit = vizitator.
@Injectable()
export class OptionalJwtGuard implements CanActivate {
  constructor(private readonly jwt: JwtService, private readonly dataSource: DataSource) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const token = bearer(req);
    if (token) {
      const user = await sessionFromToken(this.jwt, this.dataSource, token);
      if (user) req.user = user;
    }
    return true;
  }
}
