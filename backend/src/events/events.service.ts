import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Event } from './event.entity';
import { Registration } from '../registrations/registration.entity';
import { CreateEventDto, ListEventsQuery, PAGE_SIZE_DEFAULT, UpdateEventDto } from './dto/event.dto';
import { AuthUser } from '../auth/roles';
import { buildEventView } from './event-view';
import { escapeLike } from '../common/escape-like';
import { paginated } from '../common/paginated';

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

  // Paginat; toate filtrele ruleazÄƒ Ã®n baza de date, deci `total` numÄƒrÄƒ exact ce corespunde filtrelor.
  async findUpcoming(q: ListEventsQuery, viewer?: AuthUser) {
    const page = q.page ?? 1;
    const limit = q.limit ?? PAGE_SIZE_DEFAULT;
    const qb = this.base().where('e.startsAt > now()');
    const search = q.search?.trim();
    if (search) {
      qb.andWhere('(e.title ILIKE :s OR e.location ILIKE :s)', { s: `%${escapeLike(search)}%` });
    }
    if (q.available === 'true') {
      qb.andWhere('e.capacity > (SELECT COUNT(*) FROM registrations r WHERE r."eventId" = e.id)');
    }
    // `id` ca al doilea criteriu: evenimentele cu aceeaÈ™i orÄƒ nu sar Ã®ntre pagini.
    const dir = q.sort === 'desc' ? 'DESC' : 'ASC';
    qb.orderBy('e.startsAt', dir).addOrderBy('e.id', dir).skip((page - 1) * limit).take(limit);
    const [events, total] = await qb.getManyAndCount();
    return paginated(await this.views(events, viewer), total, page, limit);
  }

  async findMine(user: AuthUser) {
    const events = await this.base()
      .where('e.organizerId = :id', { id: user.id })
      .orderBy('e.startsAt', 'DESC')
      .getMany();
    return this.views(events, user);
  }

  // O singurÄƒ interogare agregatÄƒ, fÄƒrÄƒ a Ã®ncÄƒrca evenimentele.
  async summary(organizerId: string) {
    const row = await this.repo
      .createQueryBuilder('e')
      .leftJoin('e.registrations', 'r')
      .select('COUNT(DISTINCT e.id)', 'eventsCount')
      .addSelect('COUNT(DISTINCT e.id) FILTER (WHERE e.startsAt > now())', 'upcomingCount')
      .addSelect('COUNT(r.id)', 'totalRegistrations')
      .where('e.organizerId = :id', { id: organizerId })
      .getRawOne<{ eventsCount: string; upcomingCount: string; totalRegistrations: string }>();
    // PostgreSQL Ã®ntoarce COUNT ca text (bigint)
    return {
      eventsCount: Number(row?.eventsCount ?? 0),
      upcomingCount: Number(row?.upcomingCount ?? 0),
      totalRegistrations: Number(row?.totalRegistrations ?? 0),
    };
  }

  async findOne(id: string, viewer?: AuthUser) {
    const event = await this.base().where('e.id = :id', { id }).getOne();
    if (!event) throw new NotFoundException('Evenimentul nu a fost gÄƒsit.');
    return (await this.views([event], viewer))[0];
  }

  async create(user: AuthUser, dto: CreateEventDto) {
    const startsAt = this.parseFutureDate(dto.startsAt);
    const saved = await this.repo.save(this.repo.create({ ...dto, startsAt, organizerId: user.id }));
    return this.findOne(saved.id, user);
  }

  // TranzacÈ›ie + acelaÈ™i lock ca la Ã®nscriere: o Ã®nscriere simultanÄƒ fie este
  // numÄƒratÄƒ Ã®nainte de verificarea capacitÄƒÈ›ii, fie vede deja noua capacitate.
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
          throw this.bad(`Capacitatea nu poate fi sub numÄƒrul de Ã®nscriÈ™i (${taken}).`, 'capacity');
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
    if (!event) throw new NotFoundException('Evenimentul nu a fost gÄƒsit.');
    if (event.organizerId !== userId) {
      throw new ForbiddenException('Doar organizatorul evenimentului Ã®l poate modifica.');
    }
    return event;
  }

  private bad(message: string, field: string) {
    return new BadRequestException({ statusCode: 400, error: 'Bad Request', message, fields: { [field]: message } });
  }

  private parseFutureDate(value: string) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime()) || d.getTime() <= Date.now()) {
      throw this.bad('Data evenimentului trebuie sÄƒ fie Ã®n viitor.', 'startsAt');
    }
    return d;
  }
}
