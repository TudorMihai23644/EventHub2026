import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, Not, Repository } from 'typeorm';
import { Event } from './event.entity';
import { Registration } from '../registrations/registration.entity';
import { CreateEventDto, ListEventsQuery, PAGE_SIZE_DEFAULT, UpdateEventDto } from './dto/event.dto';
import { AuthUser } from '../auth/roles';
import { buildEventView } from './event-view';
import { escapeLike } from '../common/escape-like';
import { paginated } from '../common/paginated';
import { Notifications, info } from '../mail/notifications.service';
import { WaitlistService } from '../waitlist/waitlist.service';
import { MAX_DURATION_DAYS } from './categories';
import { WaitlistEntry } from '../waitlist/waitlist-entry.entity';
import { csvDate, toCsv } from '../common/csv';

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
    let tickets = new Map<string, { code: string; checkedInAt: Date | null }>();
    let positions = new Map<string, number>();
    if (viewer?.role === 'PARTICIPANT' && events.length) {
      const ids = events.map((e) => e.id);
      const rows = await this.regs.find({ where: { userId: viewer.id, eventId: In(ids) } });
      tickets = new Map(rows.map((r) => [r.eventId, { code: r.ticketCode, checkedInAt: r.checkedInAt }]));
      positions = await this.waitlist.positions(viewer.id, ids);
    }
    const now = Date.now();
    return events.map((e) => buildEventView(e, viewer, tickets.has(e.id), now, positions.get(e.id) ?? null, tickets.get(e.id) ?? null));
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
    if (q.category) qb.andWhere('e.category = :category', { category: q.category });
    // `id` ca al doilea criteriu: evenimentele cu aceeași oră nu sar între pagini.
    const dir = q.sort === 'desc' ? 'DESC' : 'ASC';
    qb.orderBy('e.startsAt', dir).addOrderBy('e.id', dir).skip((page - 1) * limit).take(limit);
    const [events, total] = await qb.getManyAndCount();
    return paginated(await this.views(events, viewer), total, page, limit);
  }

  /** Arhiva publică: evenimentele care au început, cele mai recente întâi; aceleași filtre de căutare și categorie. */
  async findPast(q: ListEventsQuery, viewer?: AuthUser) {
    const page = q.page ?? 1;
    const limit = q.limit ?? PAGE_SIZE_DEFAULT;
    const qb = this.base().where('e.startsAt <= now()');
    const search = q.search?.trim();
    if (search) qb.andWhere('(e.title ILIKE :s OR e.location ILIKE :s)', { s: `%${escapeLike(search)}%` });
    if (q.category) qb.andWhere('e.category = :category', { category: q.category });
    qb.orderBy('e.startsAt', 'DESC').addOrderBy('e.id', 'DESC').skip((page - 1) * limit).take(limit);
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
    const event = this.repo.create({
      title: dto.title,
      description: dto.description,
      capacity: dto.capacity,
      startsAt: this.parseFutureDate(dto.startsAt),
      endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
      category: dto.category,
      format: dto.format ?? 'PHYSICAL',
      location: dto.location ?? '',
      onlineUrl: dto.onlineUrl ?? null,
      organizerId: user.id,
    });
    this.applyEventRules(event, { locationGiven: dto.location != null });
    const saved = await this.repo.save(event);
    return this.findOne(saved.id, user);
  }

  /**
   * Regulile pe evenimentul complet (după ce PATCH-ul a fost aplicat peste ce e salvat):
   *  - ONLINE: link obligatoriu; locația devine „Online”;
   *  - PHYSICAL / HYBRID: locație obligatorie (nu „Online” rămas de la un format anterior); PHYSICAL nu păstrează link;
   *  - HYBRID: și link obligatoriu;
   *  - sfârșitul, dacă există: după început, cel mult MAX_DURATION_DAYS zile.
   */
  private applyEventRules(e: Event, opts: { locationGiven: boolean; wasOnline?: boolean }) {
    e.format ??= 'PHYSICAL'; // coloana are implicit PHYSICAL; aici doar apărare
    if (e.format === 'ONLINE') {
      if (!e.onlineUrl) throw this.bad('Adaugă linkul pentru evenimentul online.', 'onlineUrl');
      e.location = 'Online';
    } else {
      const leftoverOnline = opts.wasOnline && !opts.locationGiven; // „Online” rămas de la formatul vechi
      if (!e.location || e.location.trim().length < 2 || leftoverOnline) throw this.bad('Locația este obligatorie.', 'location');
      if (e.format === 'PHYSICAL') e.onlineUrl = null;
      else if (!e.onlineUrl) throw this.bad('Adaugă linkul pentru partea online a evenimentului.', 'onlineUrl');
    }
    if (e.endsAt) {
      const ms = e.endsAt.getTime() - e.startsAt.getTime();
      if (ms <= 0) throw this.bad('Ora de sfârșit trebuie să fie după ora de început.', 'endsAt');
      if (ms > MAX_DURATION_DAYS * 86_400_000) throw this.bad(`Un eveniment poate dura cel mult ${MAX_DURATION_DAYS} zile.`, 'endsAt');
    }
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
      const oldStart = event.startsAt;
      const wasOnline = event.format === 'ONLINE';
      if (dto.startsAt !== undefined) {
        const next = new Date(dto.startsAt);
        if (next.getTime() !== event.startsAt.getTime()) {
          event.startsAt = this.parseFutureDate(dto.startsAt);
          // data nouă: memento-ul se trimite din nou, raportat la noua dată
          await m.update(Registration, { eventId: id }, { reminderSentAt: null });
        }
      }
      if (dto.endsAt !== undefined) {
        event.endsAt = dto.endsAt ? new Date(dto.endsAt) : null; // null = fără oră de sfârșit
      } else if (event.endsAt && event.startsAt.getTime() !== oldStart.getTime()) {
        // a mutat doar începutul: sfârșitul se mută la fel, durata rămâne
        event.endsAt = new Date(event.endsAt.getTime() + (event.startsAt.getTime() - oldStart.getTime()));
      }
      if (dto.category !== undefined) event.category = dto.category;
      if (dto.format !== undefined) event.format = dto.format;
      if (dto.onlineUrl !== undefined) event.onlineUrl = dto.onlineUrl;
      if (dto.capacity !== undefined) {
        const taken = await m.count(Registration, { where: { eventId: id } });
        if (dto.capacity < taken) {
          throw this.bad(`Capacitatea nu poate fi sub numărul de înscriși (${taken}).`, 'capacity');
        }
        event.capacity = dto.capacity;
      }
      if (dto.title !== undefined) event.title = dto.title;
      if (dto.description !== undefined) event.description = dto.description;
      if (dto.location !== undefined) event.location = dto.location ?? '';
      this.applyEventRules(event, { locationGiven: dto.location != null, wasOnline });
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
      checkedInAt: r.checkedInAt,
      user: { id: r.user.id, name: r.user.name, email: r.user.email },
    }));
  }

  /** CSV pentru organizator: înscrișii, apoi lista de așteptare în ordine. Orele în fusul orar al aplicației. */
  async attendeesCsv(userId: string, id: string, timeZone: string) {
    const event = await this.owned(userId, id);
    const regs = await this.regs.find({ where: { eventId: id }, relations: { user: true }, order: { createdAt: 'ASC', id: 'ASC' } });
    const waiting = await this.dataSource.getRepository(WaitlistEntry).find({ where: { eventId: id }, relations: { user: true }, order: { createdAt: 'ASC', id: 'ASC' } });
    const rows: unknown[][] = [['Nr.', 'Nume', 'Email', 'Status', 'Data', 'Prezent']];
    regs.forEach((r, i) => rows.push([i + 1, r.user.name, r.user.email, 'Înscris', csvDate(r.createdAt, timeZone), r.checkedInAt ? `Da (${csvDate(r.checkedInAt, timeZone)})` : 'Nu']));
    waiting.forEach((w, i) => rows.push([regs.length + i + 1, w.user.name, w.user.email, `Pe lista de așteptare (locul ${i + 1})`, csvDate(w.createdAt, timeZone), '']));
    return { event, csv: toCsv(rows) };
  }

  /**
   * Statistici pentru organizator: ocupare, lista de așteptare și înscrierile pe zile (în fusul orar al aplicației).
   * Înscrierile anulate nu mai există în baza de date, deci seria arată înscrierile actuale după ziua în care s-au făcut.
   */
  async stats(userId: string, id: string, timeZone: string) {
    const event = await this.owned(userId, id);
    const registered = await this.regs.count({ where: { eventId: id } });
    const checkedIn = await this.regs.count({ where: { eventId: id, checkedInAt: Not(IsNull()) } });
    const waiting = await this.dataSource.getRepository(WaitlistEntry).count({ where: { eventId: id } });
    // absenți: au sens doar după ce evenimentul a început
    const started = new Date(event.startsAt).getTime() <= Date.now();
    const byDay: { day: string; count: number }[] = await this.dataSource.query(
      `SELECT to_char("createdAt" AT TIME ZONE $2, 'YYYY-MM-DD') AS day, count(*)::int AS count
         FROM registrations WHERE "eventId" = $1 GROUP BY 1 ORDER BY 1`,
      [id, timeZone],
    );
    let total = 0;
    return {
      eventId: id,
      capacity: event.capacity,
      registered,
      waiting,
      availableSeats: Math.max(0, event.capacity - registered),
      occupancyPercent: event.capacity ? Math.min(100, Math.round((registered / event.capacity) * 100)) : 0,
      byDay: byDay.map((d) => ({ date: d.day, count: d.count, cumulative: (total += d.count) })),
      checkedIn,
      noShow: started ? registered - checkedIn : null,
      noShowPercent: started && registered ? Math.round(((registered - checkedIn) / registered) * 100) : null,
    };
  }

  // Participanții sunt anunțați înainte de ștergere: după ea, înscrierile (și lista lor) nu mai există.
  // Lock ca la înscriere: nimeni nu se poate înscrie între citirea listei și ștergere.
  /** Întoarce coperta evenimentului șters: fișierele ei se șterg după ce ștergerea din baza de date a reușit. */
  async remove(userId: string, id: string, opts: { notify?: boolean } = {}) {
    return this.dataSource.transaction(async (m) => {
      const event = this.assertOwner(
        await m.findOne(Event, { where: { id }, lock: { mode: 'pessimistic_write' } }),
        userId,
      );
      if (opts.notify !== false) await this.notifications.eventCancelled(m, event);
      const cover = event.coverImage ?? null;
      await m.remove(event);
      return cover;
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
