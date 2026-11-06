import { Injectable, Logger } from '@nestjs/common';
import { DataSource, MoreThan } from 'typeorm';
import { AuthService } from '../auth/auth.service';
import { EventsService } from '../events/events.service';
import { Event } from '../events/event.entity';
import { RegistrationsService } from '../registrations/registrations.service';
import { Registration } from '../registrations/registration.entity';
import { WaitlistEntry } from '../waitlist/waitlist-entry.entity';
import { CoverService } from '../images/cover.service';
import { OutboxEmail } from '../mail/outbox.entity';
import { User } from '../users/user.entity';

/**
 * Ștergerea contului. NU se bazează pe ON DELETE CASCADE pentru lucrurile care contează:
 *  - un participant: fiecare înscriere la un eveniment viitor se anulează prin fluxul normal (lock + promovare de pe
 *    lista de așteptare + email organizatorului), altfel locurile s-ar elibera fără ca cineva să fie promovat;
 *  - un organizator: fiecare eveniment viitor se șterge prin fluxul normal (participanții și lista de așteptare sunt
 *    anunțați), cele trecute fără emailuri; imaginile de copertă se șterg de pe disc / Cloudinary.
 * Restul (sesiuni, linkuri, înscrieri trecute) dispare odată cu contul. Emailurile încă netrimise către adresă se șterg.
 */
@Injectable()
export class AccountService {
  private readonly logger = new Logger('Account');

  constructor(
    private readonly dataSource: DataSource,
    private readonly auth: AuthService,
    private readonly events: EventsService,
    private readonly registrations: RegistrationsService,
    private readonly covers: CoverService,
  ) {}

  async deleteAccount(userId: string, password: string) {
    const user = await this.auth.assertPassword(userId, password);
    const now = new Date();

    if (user.role === 'PARTICIPANT') {
      const upcoming = await this.dataSource.getRepository(Registration).find({
        where: { userId, event: { startsAt: MoreThan(now) } },
        relations: { event: true },
      });
      for (const r of upcoming) {
        await this.registrations.cancel(userId, r.eventId, { notifyParticipant: false }).catch((e) => {
          // ex. evenimentul a început între timp: înscrierea dispare oricum odată cu contul
          this.logger.warn(`Înscrierea la ${r.eventId} nu a putut fi anulată normal: ${e}`);
        });
      }
      await this.dataSource.getRepository(WaitlistEntry).delete({ userId });
    }

    if (user.role === 'ORGANIZER') {
      const own = await this.dataSource.getRepository(Event).find({ where: { organizerId: userId } });
      for (const e of own) {
        const cover = await this.events.remove(userId, e.id, { notify: new Date(e.startsAt) > now });
        await this.covers.discard(cover);
      }
    }

    await this.dataSource.transaction(async (m) => {
      await m.delete(OutboxEmail, { to: user.email, status: 'PENDING' });
      await m.delete(User, { id: userId }); // sesiuni, linkuri de unică folosință, înscrieri trecute: ON DELETE CASCADE
    });
  }
}
