import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  createParamDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../users/user.entity';

export const Roles = (...roles: Role[]) => SetMetadata('roles', roles);

export interface AuthUser {
  id: string;
  role: Role;
  /** Din baza de date, la fiecare cerere (vezi sessionFromToken). */
  emailVerified?: boolean;
}

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user,
);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Role[]>('roles', [ctx.getHandler(), ctx.getClass()]);
    if (!roles?.length) return true;
    const user = ctx.switchToHttp().getRequest().user as AuthUser | undefined;
    if (!user || !roles.includes(user.role)) {
      throw new ForbiddenException('Nu ai permisiunea să efectuezi această acțiune.');
    }
    return true;
  }
}
