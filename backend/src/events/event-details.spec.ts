import { buildEventView } from './event-view';
import { Event } from './event.entity';
import { eventIcs, googleCalendarUrl } from './calendar';
import { placeLabel, categoryLabel } from './categories';
import * as T from '../mail/templates';

const H = 3_600_000;
const ev = (over: Partial<Event> = {}) =>
  ({
    id: 'e1', organizerId: 'org1', capacity: 10, registeredCount: 0, title: 'Webinar', location: 'Online',
    startsAt: new Date(Date.now() + 24 * H), endsAt: null, category: 'CONFERINTA', format: 'ONLINE',
    onlineUrl: 'https://meet.example.ro/secret', ...over,
  }) as Event;

describe('linkul online: doar pentru cei înscriși și organizator', () => {
  const participant = { id: 'u1', role: 'PARTICIPANT' as const, emailVerified: true };
  it.each([
    ['vizitator', undefined, false, null],
    ['participant neînscris', participant, false, null],
    ['participant pe lista de așteptare', participant, false, 1],
    ['alt organizator', { id: 'org2', role: 'ORGANIZER' as const }, false, null],
  ])('%s: NU vede linkul, dar știe că există', (_label, viewer, registered, position) => {
    const v = buildEventView(ev(), viewer, registered as boolean, Date.now(), position as number | null);
    expect(v.onlineUrl).toBeNull();
    expect(v.hasOnlineLink).toBe(true);
    expect(JSON.stringify(v)).not.toContain('meet.example.ro');
  });

  it('participant înscris și organizatorul: văd linkul', () => {
    expect(buildEventView(ev(), participant, true).onlineUrl).toBe('https://meet.example.ro/secret');
    expect(buildEventView(ev(), { id: 'org1', role: 'ORGANIZER' }).onlineUrl).toBe('https://meet.example.ro/secret');
  });
});

describe('starea „În desfășurare”', () => {
  it('a început, nu s-a terminat → ONGOING; regulile rămân cele de „trecut”', () => {
    const v = buildEventView(ev({ startsAt: new Date(Date.now() - H), endsAt: new Date(Date.now() + H) }), { id: 'u1', role: 'PARTICIPANT' });
    expect(v).toMatchObject({ status: 'ONGOING', isPast: true, canRegister: false, canJoinWaitlist: false });
  });

  it('s-a terminat → PAST; fără oră de sfârșit, după început → PAST', () => {
    expect(buildEventView(ev({ startsAt: new Date(Date.now() - 3 * H), endsAt: new Date(Date.now() - H) })).status).toBe('PAST');
    expect(buildEventView(ev({ startsAt: new Date(Date.now() - H), endsAt: null })).status).toBe('PAST');
  });

  it('eticheta categoriei și locul vin din API', () => {
    const v = buildEventView(ev({ format: 'HYBRID', location: 'Sala Patria' }));
    expect(v).toMatchObject({ categoryLabel: 'Conferință', place: 'Sala Patria și online' });
    expect(categoryLabel('NECUNOSCUT')).toBe('Altele');
    expect(placeLabel({ format: 'PHYSICAL', location: 'Brașov' })).toBe('Brașov');
  });
});

describe('ora de sfârșit în calendar și în emailuri', () => {
  const cfg = { appUrl: 'https://eventhub.test', apiUrl: 'https://api.test/api', timeZone: 'Europe/Bucharest' };
  const start = new Date('2026-12-01T17:00:00Z'); // 19:00 la București

  it('.ics și Google folosesc endsAt; locul e „Online”, fără link', () => {
    const e = { ...ev(), startsAt: start, endsAt: new Date('2026-12-01T19:30:00Z') };
    const ics = eventIcs(e, cfg).replace(/\r\n[ \t]/g, '');
    expect(ics).toContain('DTEND:20261201T193000Z');
    expect(ics).toContain('LOCATION:Online');
    expect(ics).not.toContain('meet.example.ro');
    expect(new URL(googleCalendarUrl(e, cfg)).searchParams.get('dates')).toBe('20261201T170000Z/20261201T193000Z');
    expect(googleCalendarUrl(e, cfg)).not.toContain('meet.example.ro');
  });

  it.each([
    [null, 'marți, 1 decembrie 2026 la 19:00'],
    [new Date('2026-12-01T19:30:00Z'), 'marți, 1 decembrie 2026 la 19:00–21:30'],
    [new Date('2026-12-03T16:00:00Z'), 'marți, 1 decembrie 2026 la 19:00 – joi, 3 decembrie 2026 la 18:00'],
  ])('formatWhen cu sfârșit %s → %s', (endsAt, expected) => {
    expect(T.formatWhen({ startsAt: start, endsAt }, cfg.timeZone)).toBe(expected);
  });

  const info = { id: 'e1', title: 'Webinar', startsAt: start, endsAt: null, location: 'Online', format: 'ONLINE', onlineUrl: 'https://meet.example.ro/secret' };

  it('linkul apare în confirmare, memento și „ai primit un loc”', () => {
    for (const c of [
      T.registrationConfirmed(cfg, { name: 'Ana', event: info }),
      T.eventReminder(cfg, { name: 'Ana', event: info, hasWaitlist: false, now: new Date('2026-11-30T12:00:00Z') }),
      T.waitlistPromoted(cfg, { name: 'Ana', event: info }),
    ]) expect(c.text).toContain('Link online: https://meet.example.ro/secret');
  });

  it('linkul NU apare la lista de așteptare, anulare sau ștergere', () => {
    for (const c of [
      T.waitlistJoined(cfg, { name: 'Ana', event: info, position: 1 }),
      T.registrationCancelled(cfg, { name: 'Ana', event: info }),
      T.eventCancelled(cfg, { name: 'Ana', event: info }),
      T.eventCancelled(cfg, { name: 'Ana', event: info, waiting: true }),
    ]) expect(c.text).not.toContain('meet.example.ro');
  });

  it('link schimbat: cei înscriși primesc linkul nou, cei care așteaptă doar „s-a schimbat”', () => {
    const after = { ...info, onlineUrl: 'https://meet.example.ro/nou' };
    const reg = T.eventUpdated(cfg, { name: 'Ana', before: info, after });
    const wait = T.eventUpdated(cfg, { name: 'Ana', before: info, after, waiting: true });
    expect(reg.text).toContain('Link nou: https://meet.example.ro/nou');
    expect(wait.text).toContain('Link online: s-a schimbat');
    expect(wait.text).not.toContain('meet.example.ro');
  });

  it('ora de sfârșit mutată → apare în emailul de modificare', () => {
    const changes = T.eventChanges(cfg, info, { ...info, endsAt: new Date('2026-12-01T20:00:00Z') });
    expect(changes).toEqual([['Când', 'marți, 1 decembrie 2026 la 19:00 → marți, 1 decembrie 2026 la 19:00–22:00']]);
  });
});
