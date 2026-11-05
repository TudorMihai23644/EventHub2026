import { Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { RegistrationsService } from './registrations.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthUser, CurrentUser, Roles, RolesGuard } from '../auth/roles';
import { ROUTES } from '../common/routes';
import { RequireVerifiedEmail } from '../auth/verified-email.guard';

const EVENT_REGISTRATIONS = `${ROUTES.events.base}/${ROUTES.events.registrations}`;
const MY_REGISTRATIONS = `${ROUTES.registrations.base}/${ROUTES.registrations.mine}`;

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('PARTICIPANT')
export class RegistrationsController {
  constructor(private readonly regs: RegistrationsService) {}

  @Post(EVENT_REGISTRATIONS)
  @RequireVerifiedEmail('să te înscrii la evenimente') // guard-urile clasei (JwtAuthGuard) rulează înainte
  register(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.regs.register(user.id, id);
  }

  @Delete(EVENT_REGISTRATIONS)
  @HttpCode(204)
  cancel(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.regs.cancel(user.id, id);
  }

  @Get(MY_REGISTRATIONS)
  mine(@CurrentUser() user: AuthUser) {
    return this.regs.mine(user.id);
  }
}
