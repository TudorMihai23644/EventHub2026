import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { EventsService } from './events.service';
import { Event } from './event.entity';
import { AuthUser } from '../auth/roles';

const inDays = (d: number) => new Date(Date.now() + d * 86_400_000);
const owner: AuthUser = { id: 'org1', role: 'ORGANIZER' };
const base = {
  id: 'e1', organizerId: 'org1', capacity: 10, startsAt: inDays(3),
  title: 'Titlu', description: 'Descriere lungă', location: 'Brașov',
};

function setup(event: Partial<Event> | null, taken = 0) {
  const calls: string[] = []; // ordinea apelurilor, pentru „anunță înainte de ștergere”
  const manager: any = {
    findOne: jest.fn(async () => (event ? { ...event } : null)),
    count: jest.fn(async () => taken),
    save: jest.fn(async (e: object) => e),
    remove: jest.fn(async () => calls.push('remove')),
  };
  const notifications: any = {
    eventUpdated: jest.fn(async () => 0),
    eventCancelled: jest.fn(async () => calls.push('eventCancelled')),
  };
  const dataSource: any = { transaction: (cb: (m: unknown) => unknown) => cb(manager) };
  const waitlist: any = { promote: jest.fn(async () => calls.push('promote')) };
  const service = new EventsService({} as any, {} as any, dataSource, notifications, waitlist);
  // findOne reîncarcă evenimentul după salvare; aici testăm doar regulile din tranzacție
  jest.spyOn(service, 'findOne').mockResolvedValue({ id: 'e1' } as any);
  return { service, manager, notifications, waitlist, calls };
}

describe('EventsService.update', () => {
  it('blochează rândul evenimentului și salvează o capacitate validă', async () => {
    const { service, manager } = setup(base, 9);
    await service.update(owner, 'e1', { capacity: 9 });
    expect(manager.findOne).toHaveBeenCalledWith(Event, expect.objectContaining({ lock: { mode: 'pessimistic_write' } }));
    expect(manager.save).toHaveBeenCalledWith(expect.objectContaining({ capacity: 9 }));
  });

  it('respinge o capacitate sub numărul de înscriși', async () => {
    const { service, manager } = setup(base, 9);
    await expect(service.update(owner, 'e1', { capacity: 8 })).rejects.toThrow(BadRequestException);
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('refuză editarea de către alt organizator', async () => {
    const { service, manager } = setup(base);
    await expect(service.update({ id: 'org2', role: 'ORGANIZER' }, 'e1', { title: 'Alt titlu' })).rejects.toThrow(ForbiddenException);
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('returnează 404 pentru un eveniment inexistent', async () => {
    const { service } = setup(null);
    await expect(service.update(owner, 'nope', { title: 'Alt titlu' })).rejects.toThrow(NotFoundException);
  });

  it('trimite la notificări starea de dinainte și cea de după, în aceeași tranzacție', async () => {
    const { service, manager, notifications } = setup(base);
    await service.update(owner, 'e1', { title: 'Titlu nou', location: 'Cluj' });
    expect(notifications.eventUpdated).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({ title: 'Titlu', location: 'Brașov' }),
      expect.objectContaining({ title: 'Titlu nou', location: 'Cluj' }),
    );
  });

  it('nu notifică nimic dacă modificarea este respinsă', async () => {
    const { service, notifications } = setup(base, 9);
    await expect(service.update(owner, 'e1', { capacity: 8 })).rejects.toThrow(BadRequestException);
    expect(notifications.eventUpdated).not.toHaveBeenCalled();
  });
});

describe('EventsService.update - lista de așteptare', () => {
  it('capacitatea mărită: întâi promovarea, apoi emailul de modificare', async () => {
    const { service, waitlist, calls, notifications } = setup(base, 3);
    notifications.eventUpdated.mockImplementation(async () => calls.push('eventUpdated'));
    await service.update(owner, 'e1', { capacity: 12 });
    expect(waitlist.promote).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ capacity: 12 }));
    expect(calls).toEqual(['promote', 'eventUpdated']);
  });

  it('capacitatea micșorată, egală sau neschimbată: fără promovare', async () => {
    for (const dto of [{ capacity: 8 }, { capacity: 10 }, { title: 'Alt titlu' }]) {
      const { service, waitlist } = setup(base, 3);
      await service.update(owner, 'e1', dto);
      expect(waitlist.promote).not.toHaveBeenCalled();
    }
  });
});

describe('EventsService.remove', () => {
  it('blochează evenimentul, anunță participanții, apoi șterge', async () => {
    const { service, manager, calls } = setup(base);
    await service.remove('org1', 'e1');
    expect(manager.findOne).toHaveBeenCalledWith(Event, expect.objectContaining({ lock: { mode: 'pessimistic_write' } }));
    expect(calls).toEqual(['eventCancelled', 'remove']);
  });

  it('alt organizator nu poate șterge și nu se trimite nimic', async () => {
    const { service, manager, notifications } = setup(base);
    await expect(service.remove('org2', 'e1')).rejects.toThrow(ForbiddenException);
    expect(notifications.eventCancelled).not.toHaveBeenCalled();
    expect(manager.remove).not.toHaveBeenCalled();
  });
});
