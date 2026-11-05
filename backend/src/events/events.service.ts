import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Event } from './event.entity';
import { Registration } from '../registrations/registration.entity';
import { CreateEventDto, ListEventsQuery, UpdateEventDto } from './dto/event.dto';
import { AuthUser } from '../auth/roles';
import { buildEventView } from './event-view';

@Injectable()
export class EventsService {
  constructor(
    @InjectRepository(Event) private readonly repo: Repository<Event>,
    @InjectRepository(Registration) private readonly regs: Repository<Registration>,
    private readonly dataSource: DataSource,
  ) {}

  private base() {
    return this.repo
      .createQueryBuilder('e')
      .leftJoin('e.organizer', 'o')
      .addSelect(['o.id', 'o.name'])
      .loadRelationCountAndMap('e.registeredCount', 'e.registrations');
  }

  private async views(events: Event[], viewer?: AuthUser) {
    let registered = new Set<string>();
    if (viewer?.role === 'PARTICIPANT' && events.length) {
      const rows = await this.regs.find({
        where: { userId: viewer.id, eventId: In(events.map((e) => e.id)) },
      });
      registered = new Set(rows.map((r) => r.eventId));
    }
    return events.map((e) => buildEventView(e, viewer, registered.has(e.id)));
  }

  async findUpcoming(q: ListEventsQuery, viewer?: AuthUser) {
    const qb = this.base().where('e.startsAt > now()');
    if (q.search?.trim()) {
      qb.andWhere('(e.title ILIKE :s OR e.location ILIKE :s)', { s: `%${q.search.trim()}%` });
    }
    qb.orderBy('e.startsAt', q.sort === 'desc' ? 'DESC' : 'ASC');
    const views = await this.views(await qb.getMany(), viewer);
    return q.available === 'true' ? views.filter((e) => e.availableSeats > 0) : views;
  }

  async findMine(user: AuthUser) {
    const events = await this.base()
      .where('e.organizerId = :id', { id: user.id })
      .orderBy('e.startsAt', 'DESC')
      .getMany();
    return this.views(events, user);
  }

  async summary(organizerId: string) {
    const events = await this.base().where('e.organizerId = :id', { id: organizerId }).getMany();
    const now = Date.now();
    return {
      eventsCount: events.length,
      upcomingCount: events.filter((e) => new Date(e.startsAt).getTime() > now).length,
      totalRegistrations: events.reduce((sum, e) => sum + (e.registeredCount ?? 0), 0),
    };
  }

  async findOne(id: string, viewer?: AuthUser) {
    const event = await this.base().where('e.id = :id', { id }).getOne();
    if (!event) throw new NotFoundException('Evenimentul nu a fost găsit.');
    return (await this.views([event], viewer))[0];
  }

  async create(user: AuthUser, dto: CreateEventDto) {
    const startsAt = this.parseFutureDate(dto.startsAt);
    const saved = await this.repo.save(this.repo.create({ ...dto, startsAt, organizerId: user.id }));
    return this.findOne(saved.id, user);
  }

  // Tranzacție + același lock ca la înscriere: o înscriere simultană fie este
  // numărată înainte de verificarea capacității, fie vede deja noua capacitate.
  async update(user: AuthUser, id: string, dto: UpdateEventDto) {
    await this.dataSource.transaction(async (m) => {
      const event = this.assertOwner(
        await m.findOne(Event, { where: { id }, lock: { mode: 'pessimistic_write' } }),
        user.id,
      );
      if (dto.startsAt !== undefined) {
        const next = new Date(dto.startsAt);
        if (next.getTime() !== event.startsAt.getTime()) event.startsAt = this.parseFutureDate(dto.startsAt);
      }
      if (dto.capacity !== undefined) {
        const taken = await m.count(Registration, { where: { eventId: id } });
        if (dto.capacity < taken) {
          throw this.bad(`Capacitatea nu poate fi sub numărul de înscriși (${taken}).`, 'capacity');
        }
        event.capacity = dto.capacity;
      }
      if (dto.title !== undefined) event.title = dto.title;
      if (dto.description !== undefined) event.description = dto.description;
      if (dto.location !== undefined) event.location = dto.location;
      await m.save(event);
    });
    return this.findOne(id, user);
  }

  async attendees(userId: string, id: string) {
    await this.owned(userId, id);
    const rows = await this.regs.find({
      where: { eventId: id },
      relations: { user: true },
      order: { createdAt: 'ASC' },
    });
    return rows.map((r) => ({
      id: r.id,
      registeredAt: r.createdAt,
      user: { id: r.user.id, name: r.user.name, email: r.user.email },
    }));
  }

  async remove(userId: string, id: string) {
    const event = await this.owned(userId, id);
    await this.repo.remove(event);
  }

  private async owned(userId: string, id: string) {
    return this.assertOwner(await this.repo.findOne({ where: { id } }), userId);
  }

  private assertOwner(event: Event | null, userId: string) {
    if (!event) throw new NotFoundException('Evenimentul nu a fost găsit.');
    if (event.organizerId !== userId) {
      throw new ForbiddenException('Doar organizatorul evenimentului îl poate modifica.');
    }
    return event;
  }

  private bad(message: string, field: string) {
    return new BadRequestException({ statusCode: 400, error: 'Bad Request', message, fields: { [field]: message } });
  }

  private parseFutureDate(value: string) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime()) || d.getTime() <= Date.now()) {
      throw this.bad('Data evenimentului trebuie să fie în viitor.', 'startsAt');
    }
    return d;
  }
}
