import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { RegistrationsService } from './registrations.service';
import { Event } from '../events/event.entity';

const inDays = (d: number) => new Date(Date.now() + d * 86_400_000);

function setup(event: Partial<Event> | null, existing: unknown, taken: number, deleted = 1) {
  const manager: any = {
    findOne: jest.fn(async (entity: unknown) => (entity === Event ? event : existing)),
    count: jest.fn(async () => taken),
    create: jest.fn((_entity: unknown, data: object) => data),
    save: jest.fn(async (data: object) => ({ id: 'r1', ...data })),
    delete: jest.fn(async () => ({ affected: deleted })),
  };
  const dataSource: any = { transaction: (cb: (m: unknown) => unknown) => cb(manager) };
  const notifications: any = { registrationCreated: jest.fn(), registrationCancelled: jest.fn() };
  return { service: new RegistrationsService(dataSource, {} as any, notifications), manager, notifications };
}

describe('RegistrationsService.register', () => {
  const future = { id: 'e1', startsAt: inDays(3), capacity: 2 };

  it('înscrie participantul când există locuri', async () => {
    const { service, manager } = setup(future, null, 1);
    await expect(service.register('u1', 'e1')).resolves.toMatchObject({ userId: 'u1', eventId: 'e1' });
    expect(manager.save).toHaveBeenCalled();
  });

  it('pune emailurile în coadă în aceeași tranzacție, cu locurile ocupate după înscriere', async () => {
    const { service, manager, notifications } = setup(future, null, 1);
    await service.register('u1', 'e1');
    expect(notifications.registrationCreated).toHaveBeenCalledWith(manager, { userId: 'u1', event: future, taken: 2 });
  });

  it('nu pune niciun email în coadă dacă înscrierea este respinsă', async () => {
    const { service, notifications } = setup(future, null, 2);
    await expect(service.register('u1', 'e1')).rejects.toThrow(ConflictException);
    expect(notifications.registrationCreated).not.toHaveBeenCalled();
  });

  it('respinge înscrierea duplicată', async () => {
    const { service } = setup(future, { id: 'r0' }, 1);
    await expect(service.register('u1', 'e1')).rejects.toThrow(ConflictException);
  });

  it('respinge înscrierea când capacitatea este atinsă', async () => {
    const { service, manager } = setup(future, null, 2);
    await expect(service.register('u1', 'e1')).rejects.toThrow('Nu mai sunt locuri disponibile.');
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('respinge înscrierea la evenimente trecute', async () => {
    const { service } = setup({ ...future, startsAt: inDays(-1) }, null, 0);
    await expect(service.register('u1', 'e1')).rejects.toThrow(BadRequestException);
  });

  it('returnează 404 pentru un eveniment inexistent', async () => {
    const { service } = setup(null, null, 0);
    await expect(service.register('u1', 'nope')).rejects.toThrow(NotFoundException);
  });
});

describe('RegistrationsService.cancel', () => {
  const future = { id: 'e1', startsAt: inDays(3), capacity: 2 };

  it('anulează înscrierea la un eveniment viitor, cu lock pe eveniment', async () => {
    const { service, manager } = setup(future, null, 1);
    await expect(service.cancel('u1', 'e1')).resolves.toBeUndefined();
    expect(manager.findOne).toHaveBeenCalledWith(Event, expect.objectContaining({ lock: { mode: 'pessimistic_write' } }));
    expect(manager.delete).toHaveBeenCalledWith(expect.anything(), { userId: 'u1', eventId: 'e1' });
  });

  it('respinge anularea după începerea evenimentului', async () => {
    const { service, manager } = setup({ ...future, startsAt: inDays(-1) }, null, 1);
    await expect(service.cancel('u1', 'e1')).rejects.toThrow(BadRequestException);
    expect(manager.delete).not.toHaveBeenCalled();
  });

  it('returnează 404 dacă participantul nu este înscris', async () => {
    const { service, notifications } = setup(future, null, 0, 0);
    await expect(service.cancel('u1', 'e1')).rejects.toThrow('Nu ești înscris la acest eveniment.');
    expect(notifications.registrationCancelled).not.toHaveBeenCalled();
  });

  it('după anulare, pune emailurile în coadă cu locurile rămase ocupate', async () => {
    const { service, manager, notifications } = setup(future, null, 1);
    await service.cancel('u1', 'e1');
    expect(notifications.registrationCancelled).toHaveBeenCalledWith(manager, { userId: 'u1', event: future, taken: 1 });
  });

  it('returnează 404 pentru un eveniment inexistent', async () => {
    const { service, manager } = setup(null, null, 0);
    await expect(service.cancel('u1', 'nope')).rejects.toThrow(NotFoundException);
    expect(manager.delete).not.toHaveBeenCalled();
  });
});
