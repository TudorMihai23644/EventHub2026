import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Registration } from './registration.entity';
import { Event } from '../events/event.entity';

@Injectable()
export class RegistrationsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Registration) private readonly repo: Repository<Registration>,
  ) {}

  // Tranzacție + lock pe rândul evenimentului: două cereri simultane
  // nu pot depăși capacitatea.
  register(userId: string, eventId: string) {
    return this.dataSource.transaction(async (m) => {
      const event = await m.findOne(Event, { where: { id: eventId }, lock: { mode: 'pessimistic_write' } });
      if (!event) throw new NotFoundException('Evenimentul nu a fost găsit.');
      if (new Date(event.startsAt).getTime() <= Date.now()) {
        throw new BadRequestException('Nu te poți înscrie la un eveniment care a avut deja loc.');
      }
      const existing = await m.findOne(Registration, { where: { userId, eventId } });
      if (existing) throw new ConflictException('Ești deja înscris la acest eveniment.');
      const taken = await m.count(Registration, { where: { eventId } });
      if (taken >= event.capacity) throw new ConflictException('Nu mai sunt locuri disponibile.');
      return m.save(m.create(Registration, { userId, eventId }));
    });
  }

  // Același lock ca la înscriere: anularea și înscrierea la același eveniment
  // se execută pe rând. După începerea evenimentului înscrierea nu se mai poate anula.
  cancel(userId: string, eventId: string): Promise<void> {
    return this.dataSource.transaction(async (m) => {
      const event = await m.findOne(Event, { where: { id: eventId }, lock: { mode: 'pessimistic_write' } });
      if (!event) throw new NotFoundException('Evenimentul nu a fost găsit.');
      if (new Date(event.startsAt).getTime() <= Date.now()) {
        throw new BadRequestException('Nu poți anula înscrierea la un eveniment care a avut deja loc.');
      }
      const res = await m.delete(Registration, { userId, eventId });
      if (!res.affected) throw new NotFoundException('Nu ești înscris la acest eveniment.');
    });
  }

  async mine(userId: string) {
    const rows = await this.repo.find({
      where: { userId },
      relations: { event: true },
      order: { createdAt: 'DESC' },
    });
    const now = Date.now();
    return rows.map((r) => {
      const isPast = new Date(r.event.startsAt).getTime() <= now;
      return { ...r, isPast, canCancel: !isPast };
    });
  }
}
