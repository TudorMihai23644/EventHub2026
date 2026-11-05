import { DEFAULT_DURATION_HOURS, calendarLinks, eventIcs, googleCalendarUrl, icsFilename, sequenceOf } from './calendar';

const cfg = { appUrl: 'https://eventhub.test', apiUrl: 'https://api.eventhub.test/api' };
const event = {
  id: '0b6e7a52-1111-4222-8333-944455556666',
  title: 'Concert de iarnă',
  description: 'Program: colinde, ceai.',
  location: 'Sala Patria, Brașov',
  startsAt: new Date('2026-12-01T17:00:00Z'),
  createdAt: new Date('2026-11-01T10:00:00Z'),
  updatedAt: new Date('2026-11-01T10:00:00Z'),
};

/** Ca o aplicație de calendar: lipește rândurile continuate (care încep cu spațiu) și întoarce câmpurile. */
function parseIcs(ics: string): Record<string, string> {
  const unfolded = ics.replace(/\r\n[ \t]/g, '');
  const fields: Record<string, string> = {};
  for (const line of unfolded.split('\r\n')) {
    const i = line.indexOf(':');
    if (i > 0) fields[line.slice(0, i).split(';')[0]] ??= line.slice(i + 1);
  }
  return fields;
}

describe('eventIcs', () => {
  it('un VEVENT complet, cu ore UTC și UID stabil', () => {
    const ics = eventIcs(event, cfg);
    expect(ics.startsWith('BEGIN:VCALENDAR')).toBe(true);
    expect(ics).toContain('\r\n'); // RFC 5545 cere CRLF
    const f = parseIcs(ics);
    expect(f.UID).toBe(`${event.id}@eventhub`);
    expect(f.DTSTART).toBe('20261201T170000Z');
    expect(f.SUMMARY).toBe('Concert de iarnă');
    expect(f.LOCATION).toBe('Sala Patria\\, Brașov'); // virgula se escapează în iCalendar
    expect(f.URL).toBe(`https://eventhub.test/events/${event.id}`);
    expect(f.DESCRIPTION).toContain('Program: colinde\\, ceai.');
    expect(f.DESCRIPTION).toContain(`https://eventhub.test/events/${event.id}`);
  });

  it(`durează ${DEFAULT_DURATION_HOURS} ore (până la ideea 11)`, () => {
    const f = parseIcs(eventIcs(event, cfg));
    const end = f.DTEND ?? '';
    const duration = f.DURATION ?? '';
    expect(end === '20261201T190000Z' || /PT2H/.test(duration)).toBe(true);
  });

  it('escapează virgule, punct și virgulă, backslash și rânduri noi din textul organizatorului', () => {
    const f = parseIcs(eventIcs({ ...event, title: 'A, B; C \\ D', description: 'rând 1\nrând 2' }, cfg));
    expect(f.SUMMARY).toBe('A\\, B\\; C \\\\ D');
    expect(f.DESCRIPTION.startsWith('rând 1\\nrând 2')).toBe(true);
  });

  it('niciun rând nu depășește 75 de octeți (rândurile lungi sunt pliate)', () => {
    const ics = eventIcs({ ...event, description: 'ă'.repeat(300) }, cfg);
    for (const line of ics.split('\r\n')) expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75);
    expect(parseIcs(ics).DESCRIPTION.startsWith('ă'.repeat(300))).toBe(true);
  });

  it('plierea nu taie caractere: emoji (4 octeți) și diacritice rămân întregi după despliere', () => {
    const text = '🎉ăș'.repeat(60);
    const ics = eventIcs({ ...event, title: text }, cfg);
    for (const line of ics.split('\r\n')) expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75);
    expect(parseIcs(ics).SUMMARY).toBe(text);
    expect(ics).not.toContain('�');
  });

  it('SEQUENCE crește când evenimentul este modificat', () => {
    expect(sequenceOf(event)).toBe(0);
    const later = { ...event, updatedAt: new Date('2026-11-03T10:00:00Z') };
    expect(sequenceOf(later)).toBeGreaterThan(0);
    expect(parseIcs(eventIcs(later, cfg)).SEQUENCE).toBe(String(sequenceOf(later)));
  });
});

describe('googleCalendarUrl', () => {
  it('șablon Google Calendar cu ore UTC, 2 ore, diacritice și & codificate', () => {
    const url = new URL(googleCalendarUrl({ ...event, title: 'Rock & Roll în Brașov' }, cfg));
    expect(url.origin + url.pathname).toBe('https://calendar.google.com/calendar/render');
    expect(url.searchParams.get('action')).toBe('TEMPLATE');
    expect(url.searchParams.get('text')).toBe('Rock & Roll în Brașov');
    expect(url.searchParams.get('dates')).toBe('20261201T170000Z/20261201T190000Z');
    expect(url.searchParams.get('location')).toBe('Sala Patria, Brașov');
    expect(url.searchParams.get('details')).toBe(`https://eventhub.test/events/${event.id}`);
    expect(url.toString()).not.toContain(' ');
  });
});

describe('calendarLinks / icsFilename', () => {
  it('linkul Google și calea relativă a fișierului .ics', () => {
    expect(calendarLinks(event, cfg)).toEqual({ google: googleCalendarUrl(event, cfg), icsPath: `/events/${event.id}/calendar.ics` });
  });

  it.each([
    ['Concert de iarnă', 'Concert-de-iarna.ics'],
    ['Șezătoare „Țară” / 2026', 'Sezatoare-Tara-2026.ics'],
    ['"; rm -rf', 'rm-rf.ics'],
    ['???', 'eveniment.ics'],
  ])('%j → %j', (title, name) => expect(icsFilename(title)).toBe(name));
});
