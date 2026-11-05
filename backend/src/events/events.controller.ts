import {
  Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { EventsService } from './events.service';
import { CreateEventDto, ListEventsQuery, UpdateEventDto } from './dto/event.dto';
import { JwtAuthGuard, OptionalJwtGuard } from '../auth/jwt-auth.guard';
import { AuthUser, CurrentUser, Roles, RolesGuard } from '../auth/roles';
import { ROUTES } from '../common/routes';
import { RequireVerifiedEmail } from '../auth/verified-email.guard';

@Controller(ROUTES.events.base)
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Get()
  @UseGuards(OptionalJwtGuard)
  list(@CurrentUser() viewer: AuthUser | undefined, @Query() query: ListEventsQuery) {
    return this.events.findUpcoming(query, viewer);
  }

  // rutele fixe ('mine', 'mine/summary') se declară înainte de ':id'
  @Get(ROUTES.events.mine)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ORGANIZER')
  mine(@CurrentUser() user: AuthUser) {
    return this.events.findMine(user);
  }

  @Get(ROUTES.events.summary)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ORGANIZER')
  summary(@CurrentUser() user: AuthUser) {
    return this.events.summary(user.id);
  }

  // lista participanților, doar pentru organizatorul proprietar
  @Get(ROUTES.events.registrations)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ORGANIZER')
  attendees(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.events.attendees(user.id, id);
  }

  @Get(ROUTES.events.one)
  @UseGuards(OptionalJwtGuard)
  one(@CurrentUser() viewer: AuthUser | undefined, @Param('id', ParseUUIDPipe) id: string) {
    return this.events.findOne(id, viewer);
  }

  @Post()
  @RequireVerifiedEmail('să creezi evenimente') // deasupra lui UseGuards: rulează după JwtAuthGuard
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ORGANIZER')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateEventDto) {
    return this.events.create(user, dto);
  }

  @Patch(ROUTES.events.one)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ORGANIZER')
  update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateEventDto) {
    return this.events.update(user, id, dto);
  }

  @Delete(ROUTES.events.one)
  @HttpCode(204)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ORGANIZER')
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.events.remove(user.id, id);
  }
}
