import {
  Body, Controller, Delete, Get, HttpCode, Inject, Param, ParseUUIDPipe, Patch, Post, Query, Res, UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { MAIL_CONFIG, MailConfig } from '../mail/mail.config';
import { calendarLinks, eventIcs, icsFilename } from './calendar';
import { EVENT_CATEGORIES, EVENT_FORMATS } from './categories';
import { EventsService } from './events.service';
import { CreateEventDto, ListEventsQuery, UpdateEventDto } from './dto/event.dto';
import { JwtAuthGuard, OptionalJwtGuard } from '../auth/jwt-auth.guard';
import { AuthUser, CurrentUser, Roles, RolesGuard } from '../auth/roles';
import { ROUTES } from '../common/routes';
import { RequireVerifiedEmail } from '../auth/verified-email.guard';

@Controller(ROUTES.events.base)
export class EventsController {
  constructor(private readonly events: EventsService, @Inject(MAIL_CONFIG) private readonly mail: MailConfig) {}

  @Get()
  @UseGuards(OptionalJwtGuard)
  list(@CurrentUser() viewer: AuthUser | undefined, @Query() query: ListEventsQuery) {
    return this.events.findUpcoming(query, viewer);
  }

  // categoriile și formatele, cu etichetele în română (frontend-ul nu le scrie de mână)
  @Get(ROUTES.events.categories)
  categories() {
    return { categories: EVENT_CATEGORIES, formats: EVENT_FORMATS };
  }

  // rutele fixe ('categories', 'mine', 'mine/summary') se declară înainte de ':id'
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

  // fișier .ics pentru Apple Calendar, Outlook, telefoane (public)
  @Get(ROUTES.events.calendar)
  async calendar(@Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response) {
    const event = await this.events.findOne(id);
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${icsFilename(event.title)}"`);
    return eventIcs(event, this.mail);
  }

  // detaliile includ și linkurile „Adaugă în calendar” (Google + calea fișierului .ics)
  @Get(ROUTES.events.one)
  @UseGuards(OptionalJwtGuard)
  async one(@CurrentUser() viewer: AuthUser | undefined, @Param('id', ParseUUIDPipe) id: string) {
    const event = await this.events.findOne(id, viewer);
    return { ...event, calendar: calendarLinks(event, this.mail) };
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
