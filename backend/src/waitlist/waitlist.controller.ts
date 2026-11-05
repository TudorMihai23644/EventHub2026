import { Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { WaitlistService } from './waitlist.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthUser, CurrentUser, Roles, RolesGuard } from '../auth/roles';
import { RequireVerifiedEmail } from '../auth/verified-email.guard';
import { ROUTES } from '../common/routes';

const EVENT_WAITLIST = `${ROUTES.events.base}/${ROUTES.events.waitlist}`;
const MY_WAITLIST = `${ROUTES.waitlist.base}/${ROUTES.waitlist.mine}`;

@Controller()
export class WaitlistController {
  constructor(private readonly waitlist: WaitlistService) {}

  // 201 { position, waitlistCount }; doar când evenimentul este plin
  @Post(EVENT_WAITLIST)
  @RequireVerifiedEmail('să intri pe lista de așteptare') // deasupra lui UseGuards: rulează după JwtAuthGuard
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PARTICIPANT')
  join(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.waitlist.join(user.id, id);
  }

  @Delete(EVENT_WAITLIST)
  @HttpCode(204)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PARTICIPANT')
  leave(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.waitlist.leave(user.id, id);
  }

  // cine așteaptă, în ordine: doar organizatorul proprietar
  @Get(EVENT_WAITLIST)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ORGANIZER')
  list(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.waitlist.listForOwner(user.id, id);
  }

  @Get(MY_WAITLIST)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PARTICIPANT')
  mine(@CurrentUser() user: AuthUser) {
    return this.waitlist.mine(user.id);
  }
}
