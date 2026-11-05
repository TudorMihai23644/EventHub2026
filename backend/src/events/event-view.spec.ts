import { buildEventView } from './event-view';
import { Event } from './event.entity';

const day = 86_400_000;
const ev = (over: Partial<Event> = {}) =>
  ({ id: 'e1', organizerId: 'org1', capacity: 2, registeredCount: 0, startsAt: new Date(Date.now() + day), ...over }) as Event;

describe('buildEventView', () => {
  it('participantul se poate înscrie la un eveniment viitor cu locuri', () => {
    const v = buildEventView(ev(), { id: 'u1', role: 'PARTICIPANT' }, false);
    expect(v).toMatchObject({ status: 'OPEN', canRegister: true, canCancel: false, canEdit: false });
  });

  it('nu permite înscrierea când evenimentul e plin, dar permite anularea celui înscris', () => {
    const full = ev({ registeredCount: 2 });
    expect(buildEventView(full, { id: 'u1', role: 'PARTICIPANT' }, false)).toMatchObject({ status: 'FULL', canRegister: false });
    expect(buildEventView(full, { id: 'u2', role: 'PARTICIPANT' }, true)).toMatchObject({ isRegistered: true, canCancel: true });
  });

  it('un eveniment trecut nu mai poate fi înscris sau anulat', () => {
    const past = ev({ startsAt: new Date(Date.now() - day) });
    expect(buildEventView(past, { id: 'u1', role: 'PARTICIPANT' }, true)).toMatchObject({ status: 'PAST', canRegister: false, canCancel: false });
  });

  it('doar organizatorul proprietar are canEdit; vizitatorul nu are nicio acțiune', () => {
    expect(buildEventView(ev(), { id: 'org1', role: 'ORGANIZER' }).canEdit).toBe(true);
    expect(buildEventView(ev(), { id: 'org2', role: 'ORGANIZER' }).canEdit).toBe(false);
    expect(buildEventView(ev())).toMatchObject({ canRegister: false, canCancel: false, canEdit: false });
  });
});
