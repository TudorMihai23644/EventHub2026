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
import { Notifications, info } from '../mail/notifications.service';
import { WaitlistService } from '../waitlist/waitlist.service';

@Injectable()
export class EventsService {
  constructor(
    @InjectRepository(Event) private readonly repo: Repository<Event>,
    @InjectRepository(Registration) private readonly regs: Repository<Registration>,
    private readonly dataSource: DataSource,
    private readonly notifications: Notifications,
    private readonly waitlist: WaitlistService,
  ) {}

  private base() {
    return this.repo
      .createQueryBuilder('e')
      .leftJoin('e.organizer', 'o')
      .addSelect(['o.id', 'o.name'])
      .loadRelationCountAndMap('e.registeredCount', 'e.registrations')
      .loadRelationCountAndMap('e.waitlistCount', 'e.waitlist');
  }

  private async views(events: Event[], viewer?: AuthUser) {
    let registered = new Set<string>();
    let positions = new Map<string, number>();
    if (viewer?.role === 'PARTICIPANT' && events.length) {
      const ids = events.map((e) => e.id);
      const rows = await this.regs.find({ where: { userId: viewer.id, eventId: In(ids) } });
      registered = new Set(rows.map((r) => r.eventId));
      positions = await this.waitlist.positions(viewer.id, ids);
    }
    const now = Date.now();
    return events.map((e) => buildEventView(e, viewer, registered.has(e.id), now, positions.get(e.id) ?? null));
  }

  // Paginat; toate filtrele rulează în baza de date, deci `total` numără exact ce corespunde filtrelor.
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
    // `id` ca al doilea criteriu: evenimentele cu aceeași oră nu sar între pagini.
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

  // O singură interogare agregată, fără a încărca evenimentele.
  async summary(organizerId: string) {
    // Două LEFT JOIN-uri înmulțesc rândurile (înscrieri × așteptare), deci totul se numără DISTINCT.
    const row = await this.repo
      .createQueryBuilder('e')
      .leftJoin('e.registrations', 'r')
      .leftJoin('e.waitlist', 'w')
      .select('COUNT(DISTINCT e.id)', 'eventsCount')
      .addSelect('COUNT(DISTINCT e.id) FILTER (WHERE e.startsAt > now())', 'upcomingCount')
      .addSelect('COUNT(DISTINCT r.id)', 'totalRegistrations')
      .addSelect('COUNT(DISTINCT w.id)', 'totalWaiting')
      .where('e.organizerId = :id', { id: organizerId })
      .getRawOne<{ eventsCount: string; upcomingCount: string; totalRegistrations: string; totalWaiting: string }>();
    // PostgreSQL întoarce COUNT ca text (bigint)
    return {
      eventsCount: Number(row?.eventsCount ?? 0),
      upcomingCount: Number(row?.upcomingCount ?? 0),
      totalRegistrations: Number(row?.totalRegistrations ?? 0),
      totalWaiting: Number(row?.totalWaiting ?? 0),
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
      const before = info(event); // pentru emailul „s-a schimbat evenimentul”
      const oldCapacity = event.capacity;
      if (dto.startsAt !== undefined) {
        const next = new Date(dto.startsAt);
        if (next.getTime() !== event.startsAt.getTime()) {
          event.startsAt = this.parseFutureDate(dto.startsAt);
          // data nouă: memento-ul se trimite din nou, raportat la noua dată
          await m.update(Registration, { eventId: id }, { reminderSentAt: null });
        }
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
      const capacityUp = dto.capacity !== undefined && dto.capacity > oldCapacity;
      await m.save(event);
      // Locurile noi merg la lista de așteptare. Întâi promovarea: cei înscriși acum primesc apoi emailul de
      // modificare ca participanți, nu ca oameni care așteaptă.
      if (capacityUp) await this.waitlist.promote(m, event);
      // email doar dacă s-au schimbat titlul, data/ora sau locația
      await this.notifications.eventUpdated(m, before, event);
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

  // Participanții sunt anunțați înainte de ștergere: după ea, înscrierile (și lista lor) nu mai există.
  // Lock ca la înscriere: nimeni nu se poate înscrie între citirea listei și ștergere.
  async remove(userId: string, id: string) {
    await this.dataSource.transaction(async (m) => {
      const event = this.assertOwner(
        await m.findOne(Event, { where: { id }, lock: { mode: 'pessimistic_write' } }),
        userId,
      );
      await this.notifications.eventCancelled(m, event);
      await m.remove(event);
    });
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
