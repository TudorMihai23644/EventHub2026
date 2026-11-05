import { dueForReminder } from './reminders.service';
import { eventReminder, reminderWhen } from '../mail/templates';

const H = 3_600_000;
const now = new Date('2026-11-30T12:00:00Z');
const at = (hours: number) => new Date(now.getTime() + hours * H);

describe('dueForReminder', () => {
  const base = { startsAt: at(20), registeredAt: at(-72), reminderSentAt: null };
  it('în fereastra de 24 de ore, înscris dinainte, netrimis → da', () => expect(dueForReminder(base, now)).toBe(true));
  it('mai mult de 24 de ore până la început → încă nu', () => expect(dueForReminder({ ...base, startsAt: at(30) }, now)).toBe(false));
  it('exact la 24 de ore → da', () => expect(dueForReminder({ ...base, startsAt: at(24) }, now)).toBe(true));
  it('deja trimis → nu', () => expect(dueForReminder({ ...base, reminderSentAt: at(-1) }, now)).toBe(false));
  it('evenimentul a început → nu', () => expect(dueForReminder({ ...base, startsAt: at(-0.1) }, now)).toBe(false));
  it('înscris în ultimele 24 de ore dinaintea evenimentului (a primit deja confirmarea) → nu', () => {
    expect(dueForReminder({ ...base, registeredAt: at(-2) }, now)).toBe(false); // începe la +20h, înscris la -2h: în fereastră
  });
});

describe('reminderWhen: ziua socotită la București, nu în UTC', () => {
  const tz = 'Europe/Bucharest'; // UTC+2 iarna
  it.each([
    // [acum (UTC), început (UTC), așteptat]
    ['2026-11-30T12:00:00Z', '2026-12-01T17:00:00Z', 'Mâine'],
    ['2026-12-01T06:00:00Z', '2026-12-01T17:00:00Z', 'Astăzi'],
    ['2026-12-01T15:30:00Z', '2026-12-01T17:00:00Z', 'Începe în curând'],
    // 21:30 UTC = 23:30 la București; 22:30 UTC = 00:30 a doua zi la București → „Mâine”, deși în UTC e aceeași zi
    ['2026-11-30T21:30:00Z', '2026-12-01T22:30:00Z', 'Mâine'],
    // 22:30 UTC = 00:30 la București (deja 1 decembrie); eveniment 1 decembrie 19:00 → „Astăzi”, deși în UTC e încă 30 nov.
    ['2026-11-30T22:30:00Z', '2026-12-01T17:00:00Z', 'Astăzi'],
  ])('acum %s, începe %s → %s', (nowIso, startIso, expected) => {
    expect(reminderWhen(new Date(startIso), new Date(nowIso), tz)).toBe(expected);
  });
});

describe('eventReminder', () => {
  const cfg = { appUrl: 'https://eventhub.test', apiUrl: 'https://api.eventhub.test/api', timeZone: 'Europe/Bucharest' };
  const event = { id: 'e1', title: 'Concert', startsAt: new Date('2026-12-01T17:00:00Z'), location: 'Brașov' };

  it('subiect, oră locală, link, „Adaugă în calendar”', () => {
    const c = eventReminder(cfg, { name: 'Ana', event, hasWaitlist: false, now: new Date('2026-11-30T12:00:00Z') });
    expect(c.subject).toBe('Mâine: „Concert”');
    expect(c.text).toContain('19:00');
    expect(c.text).toContain('https://eventhub.test/events/e1');
    expect(c.text).toContain('Adaugă în Google Calendar: https://calendar.google.com/calendar/render?');
    expect(c.text).toContain('Apple / Outlook (.ics): https://api.eventhub.test/api/events/e1/calendar.ics');
  });

  it('îndemnul la anulare pomenește lista de așteptare doar când există una', () => {
    const withList = eventReminder(cfg, { name: 'Ana', event, hasWaitlist: true, now: new Date('2026-11-30T12:00:00Z') });
    const without = eventReminder(cfg, { name: 'Ana', event, hasWaitlist: false, now: new Date('2026-11-30T12:00:00Z') });
    expect(withList.text).toContain('lista de așteptare');
    expect(without.text).not.toContain('lista de așteptare');
  });

  it('fără adresa publică a API-ului: doar linkul Google, fără .ics', () => {
    const c = eventReminder({ ...cfg, apiUrl: undefined }, { name: 'Ana', event, hasWaitlist: false, now: new Date('2026-11-30T12:00:00Z') });
    expect(c.text).toContain('Adaugă în Google Calendar');
    expect(c.text).not.toContain('.ics');
  });
});
