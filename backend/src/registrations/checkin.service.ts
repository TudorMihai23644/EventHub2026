import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Registration } from './registration.entity';
import { Event } from '../events/event.entity';
import { formatTicketCode, normalizeTicketCode } from './ticket-code';
import { CHECKIN_OPENS_HOURS_BEFORE, checkInWindow } from './checkin-window';

export type CheckInResult = 'CHECKED_IN' | 'ALREADY_CHECKED_IN';

@Injectable()
export class CheckinService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Scanarea unui bilet de către organizator. Atomic: un singur UPDATE „unde checkedInAt e gol”, deci două
   * scanări simultane ale aceluiași bilet dau o validare și un „deja validat”, niciodată două validări.
   * Un cod al altui organizator primește același răspuns ca un cod inexistent (nu dezvăluie că biletul există).
   */
  async scan(organizerId: string, rawCode: string) {
    const code = normalizeTicketCode(rawCode);
    if (!code) throw new BadRequestException({ statusCode: 400, error: 'Bad Request', message: 'Codul biletului nu este valid.', fields: { code: 'Codul biletului nu este valid.' } });
    const reg = await this.dataSource.getRepository(Registration).findOne({ where: { ticketCode: code }, relations: { event: true, user: true } });
    if (!reg || reg.event.organizerId !== organizerId) throw new NotFoundException('Bilet necunoscut pentru evenimentele tale.');
    this.assertWindow(reg.event, { allowAfterClose: false });
    // Pentru UPDATE … RETURNING, TypeORM (PostgreSQL) întoarce [rânduri, numărul de rânduri afectate].
    const [rows] = (await this.dataSource.query(
      `UPDATE registrations SET "checkedInAt" = now() WHERE id = $1 AND "checkedInAt" IS NULL RETURNING "checkedInAt"`,
      [reg.id],
    )) as [{ checkedInAt: Date }[], number];
    const result: CheckInResult = rows.length === 1 ? 'CHECKED_IN' : 'ALREADY_CHECKED_IN';
    const checkedInAt = rows[0]?.checkedInAt ?? (await this.dataSource.getRepository(Registration).findOneByOrFail({ id: reg.id })).checkedInAt;
    return {
      result,
      checkedInAt,
      ticket: formatTicketCode(code),
      participant: { name: reg.user.name },
      event: { id: reg.event.id, title: reg.event.title },
    };
  }

  /** Marcare manuală din lista de participanți (ex. cineva fără telefon). Corecturile sunt permise și după eveniment. */
  async setAttendance(organizerId: string, eventId: string, registrationId: string, present: boolean) {
    const reg = await this.dataSource.getRepository(Registration).findOne({ where: { id: registrationId, eventId }, relations: { event: true } });
    if (!reg) throw new NotFoundException('Înscrierea nu a fost găsită.');
    if (reg.event.organizerId !== organizerId) throw new ForbiddenException('Doar organizatorul evenimentului poate valida bilete.');
    this.assertWindow(reg.event, { allowAfterClose: true });
    await this.dataSource.getRepository(Registration).update({ id: reg.id }, { checkedInAt: present ? () => 'COALESCE("checkedInAt", now())' : null });
    return { id: reg.id, checkedInAt: (await this.dataSource.getRepository(Registration).findOneByOrFail({ id: reg.id })).checkedInAt };
  }

  private assertWindow(e: Event, opts: { allowAfterClose: boolean }) {
    const { opens, closes } = checkInWindow(e);
    const now = Date.now();
    if (now < opens.getTime()) {
      throw new BadRequestException(`Validarea biletelor începe cu ${CHECKIN_OPENS_HOURS_BEFORE} ore înainte de eveniment.`);
    }
    if (!opts.allowAfterClose && now > closes.getTime()) throw new BadRequestException('Validarea biletelor pentru acest eveniment s-a încheiat.');
  }
}
