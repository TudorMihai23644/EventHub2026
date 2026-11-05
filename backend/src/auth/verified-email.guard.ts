import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata, UnauthorizedException, UseGuards, applyDecorators } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthUser } from './roles';

const ACTION_KEY = 'eventhub:verified-email-action';

/**
 * Acțiunea cere o adresă de email confirmată. `action` completează mesajul:
 * „Confirmă-ți adresa de email înainte <action>.”
 * Se pune DEASUPRA lui @UseGuards(JwtAuthGuard, …) pe metodă: decoratorii se aplică de jos în sus,
 * iar acest guard trebuie să ruleze după cel care citește sesiunea.
 */
export const RequireVerifiedEmail = (action: string) =>
  applyDecorators(SetMetadata(ACTION_KEY, action), UseGuards(VerifiedEmailGuard));

@Injectable()
export class VerifiedEmailGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const user = ctx.switchToHttp().getRequest().user as AuthUser | undefined;
    if (!user) throw new UnauthorizedException('Autentificare necesară.'); // apărare: guard pus în ordinea greșită
    if (user.emailVerified) return true;
    const action = this.reflector.get<string>(ACTION_KEY, ctx.getHandler()) ?? 'să continui';
    throw new ForbiddenException({
      statusCode: 403,
      error: 'Forbidden',
      code: 'EMAIL_NOT_VERIFIED',
      message: `Confirmă-ți adresa de email înainte ${action}. Verifică emailul primit la înregistrare sau cere unul nou.`,
    });
  }
}
