import { createEvent } from 'ics';

// „Adaugă în calendar”: fișier .ics (Apple, Outlook, telefoane, import în Google) și link Google Calendar.

/** Evenimentele nu au încă oră de sfârșit (vine în ideea 11): în calendar durează 2 ore. */
export const DEFAULT_DURATION_HOURS = 2;

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  location: string;
  startsAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

interface CalendarCfg {
  appUrl: string;
  apiUrl?: string;
}

const eventPageUrl = (cfg: CalendarCfg, id: string) => `${cfg.appUrl}/events/${encodeURIComponent(id)}`;
export const icsPath = (id: string) => `/events/${encodeURIComponent(id)}/calendar.ics`;

/**
 * SEQUENCE crește la fiecare modificare: aplicațiile de calendar înlocuiesc intrarea veche (același UID)
 * în loc să o dubleze. Secundele dintre creare și ultima modificare cresc mereu și încap într-un întreg pe 32 de biți
 * zeci de ani.
 */
export function sequenceOf(e: Pick<CalendarEvent, 'createdAt' | 'updatedAt'>): number {
  if (!e.createdAt || !e.updatedAt) return 0;
  return Math.max(0, Math.floor((new Date(e.updatedAt).getTime() - new Date(e.createdAt).getTime()) / 1000));
}

/** Conținutul fișierului .ics. Orele sunt în UTC; fiecare aplicație le arată în fusul orar al utilizatorului. */
export function eventIcs(e: CalendarEvent, cfg: CalendarCfg): string {
  const url = eventPageUrl(cfg, e.id);
  const { error, value } = createEvent({
    uid: `${e.id}@eventhub`,
    sequence: sequenceOf(e),
    productId: 'eventhub/ics',
    title: e.title,
    description: [e.description?.trim(), url].filter(Boolean).join('\n\n'),
    location: e.location,
    url,
    start: new Date(e.startsAt).getTime(),
    startInputType: 'utc',
    startOutputType: 'utc',
    duration: { hours: DEFAULT_DURATION_HOURS },
  });
  if (error || !value) throw error ?? new Error('Fișierul de calendar nu a putut fi creat.');
  return refoldIcs(value);
}

/**
 * RFC 5545 cere rânduri de cel mult 75 de OCTEȚI. Biblioteca `ics` pliază la 75 de caractere, iar în UTF-8
 * „ă”, „ș”, „ț” au câte 2 octeți: un rând cu diacritice ar ajunge la ~140 de octeți. Desfacem plierea și o refacem
 * pe octeți, fără să tăiem vreodată un caracter în două. Rândurile de continuare încep cu un spațiu.
 */
export function refoldIcs(ics: string): string {
  const lines = ics.replace(/\r\n[ \t]/g, '').split('\r\n');
  return lines.map(foldLine).join('\r\n');
}

function foldLine(line: string): string {
  const parts: string[] = [];
  let current = '';
  let bytes = 0;
  let limit = 75; // primul rând: 75 de octeți; următoarele: 74 + spațiul de la început
  for (const ch of line) { // iterează pe caractere Unicode întregi (inclusiv perechi surrogate)
    const size = Buffer.byteLength(ch, 'utf8');
    if (bytes + size > limit) {
      parts.push(current);
      current = '';
      bytes = 0;
      limit = 74;
    }
    current += ch;
    bytes += size;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

// 20261201T170000Z
const googleDate = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

export function googleCalendarUrl(e: CalendarEvent, cfg: CalendarCfg): string {
  const start = new Date(e.startsAt);
  const end = new Date(start.getTime() + DEFAULT_DURATION_HOURS * 3_600_000);
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: e.title,
    dates: `${googleDate(start)}/${googleDate(end)}`,
    details: eventPageUrl(cfg, e.id),
    location: e.location,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Ce primește frontend-ul la detaliile evenimentului: linkul Google și calea .ics (relativă la adresa API-ului). */
export function calendarLinks(e: CalendarEvent, cfg: CalendarCfg) {
  return { google: googleCalendarUrl(e, cfg), icsPath: icsPath(e.id) };
}

/** Nume de fișier sigur: litere, cifre, cratimă; diacriticele devin litere simple. */
export function icsFilename(title: string): string {
  const base = title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${base || 'eveniment'}.ics`;
}
