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
  const manager: any = {
    findOne: jest.fn(async () => (event ? { ...event } : null)),
    count: jest.fn(async () => taken),
    save: jest.fn(async (e: object) => e),
  };
  const dataSource: any = { transaction: (cb: (m: unknown) => unknown) => cb(manager) };
  const service = new EventsService({} as any, {} as any, dataSource);
  // findOne reîncarcă evenimentul după salvare; aici testăm doar regulile din tranzacție
  jest.spyOn(service, 'findOne').mockResolvedValue({ id: 'e1' } as any);
  return { service, manager };
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
});
