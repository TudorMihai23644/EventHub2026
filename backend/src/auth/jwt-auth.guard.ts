import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const [type, token] = (req.headers.authorization ?? '').split(' ');
    if (type !== 'Bearer' || !token) {
      throw new UnauthorizedException('Autentificare necesară.');
    }
    try {
      const payload = await this.jwt.verifyAsync(token);
      req.user = { id: payload.sub, role: payload.role };
      return true;
    } catch {
      throw new UnauthorizedException('Sesiune invalidă sau expirată. Autentifică-te din nou.');
    }
  }
}

// Pentru rute publice care își adaptează răspunsul dacă utilizatorul este autentificat
// (ex. `isRegistered`, `canRegister`). Token lipsă sau invalid = vizitator.
@Injectable()
export class OptionalJwtGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const [type, token] = (req.headers.authorization ?? '').split(' ');
    if (type === 'Bearer' && token) {
      try {
        const payload = await this.jwt.verifyAsync(token);
        req.user = { id: payload.sub, role: payload.role };
      } catch {
        /* vizitator */
      }
    }
    return true;
  }
}
