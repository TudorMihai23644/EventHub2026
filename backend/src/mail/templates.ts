import { MailConfig } from './mail.config';
import { googleCalendarUrl, icsPath } from '../events/calendar';
import { placeLabel } from '../events/categories';
import { formatTicketCode } from '../registrations/ticket-code';
import { priceLabel } from '../payments/stripe';

// Conținutul emailurilor: funcții pure, fără bază de date, ușor de testat.
// Tot ce scrie un utilizator (titlu, locație, nume) trece prin escapeHtml.

export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

export interface EventInfo {
  id: string;
  title: string;
  startsAt: Date;
  location: string;
  endsAt?: Date | null;
  format?: string | null;
  /** Doar pentru emailurile către participanții înscriși (vezi `withLink`). */
  onlineUrl?: string | null;
}

type Cfg = Pick<MailConfig, 'appUrl' | 'timeZone' | 'apiUrl'>;

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Subiectul este un antet de email: fără rânduri noi.
const oneLine = (s: string) => s.replace(/[\r\n]+/g, ' ').trim();

export function formatDate(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('ro-RO', { dateStyle: 'full', timeStyle: 'short', timeZone }).format(date);
}

const eventUrl = (cfg: Cfg, id: string) => `${cfg.appUrl}/events/${encodeURIComponent(id)}`;

interface Body {
  heading: string; // text simplu
  lines: string[]; // text simplu, câte un paragraf
  facts?: [string, string][]; // etichetă → valoare, text simplu
  button?: { label: string; url: string };
  links?: { label: string; url: string }[]; // linkuri secundare, sub buton (ex. „Adaugă în calendar”)
}

function render(cfg: Cfg, subject: string, b: Body): EmailContent {
  const p = (t: string) => `<p style="margin:0 0 14px;line-height:1.55">${escapeHtml(t)}</p>`;
  const facts = (b.facts ?? [])
    .map(([k, v]) => `<tr><td style="padding:4px 16px 4px 0;color:#a1a1ab;white-space:nowrap">${escapeHtml(k)}</td><td style="padding:4px 0;color:#ffffff">${escapeHtml(v)}</td></tr>`)
    .join('');
  const button = b.button
    ? `<p style="margin:22px 0 6px"><a href="${escapeHtml(b.button.url)}" style="display:inline-block;background:#ff1030;color:#000000;font-weight:800;text-decoration:none;padding:12px 22px;border-radius:999px">${escapeHtml(b.button.label)}</a></p>`
    : '';
  const links = b.links?.length
    ? `<p style="margin:14px 0 0;font-size:14px;color:#a1a1ab">${b.links
        .map((l) => `<a href="${escapeHtml(l.url)}" style="color:#ff4d63">${escapeHtml(l.label)}</a>`)
        .join(' &nbsp;·&nbsp; ')}</p>`
    : '';
  const html = `<!doctype html><html lang="ro"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;background:#000000;color:#d6d6dc;font-family:Segoe UI,Arial,sans-serif;font-size:16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#000000"><tr><td align="center" style="padding:28px 14px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#0b0b0c;border:1px solid #26262b;border-top:3px solid #ff1030;border-radius:12px">
<tr><td style="padding:26px 26px 8px;font-weight:800;font-size:18px;color:#ff1030;letter-spacing:.02em">EventHub</td></tr>
<tr><td style="padding:6px 26px 26px">
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.25;color:#ffffff">${escapeHtml(b.heading)}</h1>
${b.lines.map(p).join('\n')}
${facts ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 4px;font-size:15px">${facts}</table>` : ''}
${button}
${links}
</td></tr></table>
<p style="margin:16px 0 0;font-size:12px;color:#6d6d77">Primești acest email pentru că ai un cont EventHub.</p>
</td></tr></table></body></html>`;
  const text = [
    b.heading,
    '',
    ...b.lines.flatMap((l) => [l, '']),
    ...(b.facts ?? []).map(([k, v]) => `${k}: ${v}`),
    ...(b.button ? ['', `${b.button.label}: ${b.button.url}`] : []),
    ...(b.links ?? []).map((l) => `${l.label}: ${l.url}`),
    '',
    '— EventHub',
  ].join('\n');
  return { subject: oneLine(subject), html, text };
}

const timeOnly = (d: Date, timeZone: string) => new Intl.DateTimeFormat('ro-RO', { timeStyle: 'short', timeZone }).format(d);

/** „marți, 1 decembrie 2026 la 19:00–21:30” (aceeași zi) sau „… la 19:00 – miercuri, 2 decembrie 2026 la 18:00”. */
export function formatWhen(e: Pick<EventInfo, 'startsAt' | 'endsAt'>, timeZone: string): string {
  const start = formatDate(e.startsAt, timeZone);
  if (!e.endsAt) return start;
  const end = new Date(e.endsAt);
  return dayIn(e.startsAt, timeZone) === dayIn(end, timeZone)
    ? `${start}–${timeOnly(end, timeZone)}`
    : `${start} – ${formatDate(end, timeZone)}`;
}

/** `withLink`: doar în emailurile către cei înscriși apare și linkul online (cei care așteaptă nu îl primesc). */
const eventFacts = (cfg: Cfg, e: EventInfo, opts: { withLink?: boolean } = {}): [string, string][] => [
  ['Când', formatWhen(e, cfg.timeZone)],
  ['Unde', placeLabel(e)],
  ...(opts.withLink && e.onlineUrl ? [['Link online', e.onlineUrl] as [string, string]] : []),
];

/** „Adaugă în calendar”: Google + fișier .ics (doar dacă știm adresa publică a API-ului). */
function calendarLinks(cfg: Cfg, e: EventInfo) {
  const links = [{ label: 'Adaugă în Google Calendar', url: googleCalendarUrl(e, cfg) }];
  if (cfg.apiUrl) links.push({ label: 'Apple / Outlook (.ics)', url: `${cfg.apiUrl}${icsPath(e.id)}` });
  return links;
}

// Ziua calendaristică (YYYY-MM-DD) în fusul orar dat; 'en-CA' formatează exact așa.
const dayIn = (d: Date, timeZone: string) => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

/** „Începe în curând” (≤ 3 ore), „Astăzi”, „Mâine”, socotit pe zilele din fusul orar al aplicației, nu din UTC. */
export function reminderWhen(start: Date, now: Date, timeZone: string): 'Începe în curând' | 'Astăzi' | 'Mâine' {
  if (start.getTime() - now.getTime() <= 3 * 3_600_000) return 'Începe în curând';
  return dayIn(start, timeZone) === dayIn(now, timeZone) ? 'Astăzi' : 'Mâine';
}

// ---------- pentru participanți ----------

/** Codul biletului și cum se folosește (doar în emailurile către cei înscriși). */
const ticketFacts = (ticket?: string | null): [string, string][] => (ticket ? [['Bilet', formatTicketCode(ticket)]] : []);
const TICKET_HINT = 'La intrare arată codul QR din pagina evenimentului (sau spune codul biletului).';

export function registrationConfirmed(cfg: Cfg, d: { name: string; event: EventInfo; ticket?: string | null }): EmailContent {
  return render(cfg, `Te-ai înscris la „${d.event.title}”`, {
    heading: `Te-ai înscris la „${d.event.title}”`,
    lines: [`Bună, ${d.name}! Înscrierea ta a fost confirmată.`, ...(d.ticket ? [TICKET_HINT] : [])],
    facts: [...eventFacts(cfg, d.event, { withLink: true }), ...ticketFacts(d.ticket)],
    button: { label: 'Vezi evenimentul', url: eventUrl(cfg, d.event.id) },
    links: calendarLinks(cfg, d.event),
  });
}

/** Memento-ul de cu o zi înainte. `hasWaitlist`: îndemnul la anulare spune că locul ajunge la cineva care așteaptă. */
export function eventReminder(cfg: Cfg, d: { name: string; event: EventInfo; hasWaitlist: boolean; now?: Date; ticket?: string | null }): EmailContent {
  const when = reminderWhen(d.event.startsAt, d.now ?? new Date(), cfg.timeZone);
  const cancelHint = d.hasWaitlist
    ? 'Dacă nu mai poți veni, anulează înscrierea din pagina evenimentului: locul ajunge imediat la primul de pe lista de așteptare.'
    : 'Dacă nu mai poți veni, anulează înscrierea din pagina evenimentului, ca locul să rămână liber pentru altcineva.';
  return render(cfg, `${when}: „${d.event.title}”`, {
    heading: `${when}: „${d.event.title}”`,
    lines: [`Bună, ${d.name}! Îți amintim de evenimentul la care ești înscris.`, ...(d.ticket ? [TICKET_HINT] : []), cancelHint],
    facts: [...eventFacts(cfg, d.event, { withLink: true }), ...ticketFacts(d.ticket)],
    button: { label: 'Vezi evenimentul', url: eventUrl(cfg, d.event.id) },
    links: calendarLinks(cfg, d.event),
  });
}

export function registrationCancelled(cfg: Cfg, d: { name: string; event: EventInfo; refunded?: boolean }): EmailContent {
  return render(cfg, `Înscrierea la „${d.event.title}” a fost anulată`, {
    heading: 'Înscriere anulată',
    lines: [
      `Bună, ${d.name}! Ți-ai anulat înscrierea la „${d.event.title}”.`,
      ...(d.refunded ? ['Banii pentru bilet îți vor fi returnați pe card; îți scriem când returnarea e făcută.'] : []),
      'Dacă te răzgândești și mai sunt locuri, te poți înscrie din nou.',
    ],
    facts: eventFacts(cfg, d.event),
    button: { label: 'Vezi evenimentul', url: eventUrl(cfg, d.event.id) },
  });
}

/** Câmpurile care contează pentru cine vine. Capacitatea și descrierea nu declanșează email. */
export function eventChanges(cfg: Cfg, before: EventInfo, after: EventInfo): [string, string][] {
  const changes: [string, string][] = [];
  if (before.title !== after.title) changes.push(['Titlu', `${before.title} → ${after.title}`]);
  const [whenBefore, whenAfter] = [formatWhen(before, cfg.timeZone), formatWhen(after, cfg.timeZone)];
  if (whenBefore !== whenAfter) changes.push(['Când', `${whenBefore} → ${whenAfter}`]);
  const [placeBefore, placeAfter] = [placeLabel(before), placeLabel(after)];
  if (placeBefore !== placeAfter) changes.push(['Unde', `${placeBefore} → ${placeAfter}`]);
  // linkul în sine nu apare aici (emailul merge și la cei de pe lista de așteptare); îl adaugă eventUpdated pentru înscriși
  if ((before.onlineUrl ?? null) !== (after.onlineUrl ?? null) && after.onlineUrl) changes.push(['Link online', 's-a schimbat']);
  return changes;
}

/** `waiting`: destinatarul este pe lista de așteptare, nu înscris. */
export function eventUpdated(cfg: Cfg, d: { name: string; before: EventInfo; after: EventInfo; waiting?: boolean }): EmailContent {
  const intro = d.waiting
    ? 'Organizatorul a modificat un eveniment pentru care ești pe lista de așteptare. Locul tău pe listă rămâne același.'
    : 'Organizatorul a modificat un eveniment la care ești înscris. Înscrierea ta rămâne valabilă.';
  return render(cfg, `S-a schimbat evenimentul „${d.after.title}”`, {
    heading: `Modificări la „${d.after.title}”`,
    lines: [`Bună, ${d.name}! ${intro}`],
    facts: [
      ...eventChanges(cfg, d.before, d.after),
      // linkul nou, doar pentru cei înscriși
      ...(!d.waiting && d.after.onlineUrl && d.after.onlineUrl !== d.before.onlineUrl ? [['Link nou', d.after.onlineUrl] as [string, string]] : []),
    ],
    button: { label: 'Vezi evenimentul', url: eventUrl(cfg, d.after.id) },
  });
}

export function eventCancelled(cfg: Cfg, d: { name: string; event: EventInfo; waiting?: boolean }): EmailContent {
  const what = d.waiting
    ? 'Organizatorul a anulat evenimentul pentru care erai pe lista de așteptare.'
    : 'Organizatorul a anulat evenimentul la care erai înscris, iar înscrierea ta a fost ștearsă.';
  return render(cfg, `Evenimentul „${d.event.title}” a fost anulat`, {
    heading: `„${d.event.title}” a fost anulat`,
    lines: [`Bună, ${d.name}! ${what}`],
    facts: [['Era programat', formatWhen(d.event, cfg.timeZone)], ['Unde', placeLabel(d.event)]],
    button: { label: 'Vezi alte evenimente', url: `${cfg.appUrl}/` },
  });
}

// ---------- listă de așteptare ----------

export function waitlistJoined(cfg: Cfg, d: { name: string; event: EventInfo; position: number }): EmailContent {
  return render(cfg, `Ești pe lista de așteptare pentru „${d.event.title}”`, {
    heading: 'Ești pe lista de așteptare',
    lines: [
      `Bună, ${d.name}! Evenimentul „${d.event.title}” este plin, dar te-am trecut pe lista de așteptare, pe locul ${d.position}.`,
      'Dacă se eliberează un loc, te înscriem automat și îți scriem imediat. Poți ieși oricând de pe listă din pagina evenimentului.',
    ],
    facts: eventFacts(cfg, d.event),
    button: { label: 'Vezi evenimentul', url: eventUrl(cfg, d.event.id) },
  });
}

export function waitlistPromoted(cfg: Cfg, d: { name: string; event: EventInfo; ticket?: string | null }): EmailContent {
  return render(cfg, `Ai primit un loc la „${d.event.title}”`, {
    heading: 'Ai primit un loc!',
    lines: [
      `Bună, ${d.name}! S-a eliberat un loc la „${d.event.title}”, iar tu erai primul pe lista de așteptare: acum ești înscris.`,
      'Dacă nu mai poți veni, anulează înscrierea din pagina evenimentului, ca locul să ajungă la următoarea persoană.',
      ...(d.ticket ? [TICKET_HINT] : []),
    ],
    facts: [...eventFacts(cfg, d.event, { withLink: true }), ...ticketFacts(d.ticket)],
    button: { label: 'Vezi evenimentul', url: eventUrl(cfg, d.event.id) },
    links: calendarLinks(cfg, d.event),
  });
}

// ---------- cont: resetare parolă, confirmare email ----------
// Linkurile conțin token-ul în clar; conținutul acestor emailuri se șterge din coadă după trimitere.

export const passwordResetUrl = (cfg: Cfg, token: string) => `${cfg.appUrl}/resetare-parola?token=${encodeURIComponent(token)}`;
export const emailVerifyUrl = (cfg: Cfg, token: string) => `${cfg.appUrl}/confirmare-email?token=${encodeURIComponent(token)}`;

export function passwordReset(cfg: Cfg, d: { name: string; token: string }): EmailContent {
  return render(cfg, 'Resetează-ți parola EventHub', {
    heading: 'Resetează-ți parola',
    lines: [
      `Bună, ${d.name}! Am primit o cerere de resetare a parolei pentru contul tău.`,
      'Linkul este valabil 30 de minute și poate fi folosit o singură dată.',
      'Dacă nu tu ai cerut resetarea, ignoră acest email: parola ta rămâne neschimbată.',
    ],
    button: { label: 'Alege o parolă nouă', url: passwordResetUrl(cfg, d.token) },
  });
}

export function emailVerification(cfg: Cfg, d: { name: string; token: string }): EmailContent {
  return render(cfg, 'Confirmă adresa de email pentru EventHub', {
    heading: 'Confirmă adresa de email',
    lines: [
      `Bună, ${d.name}! Mai e un pas: confirmă că această adresă îți aparține.`,
      'După confirmare te poți înscrie la evenimente (sau, ca organizator, poți crea evenimente). Linkul este valabil 24 de ore.',
      'Dacă nu tu ți-ai creat contul, ignoră acest email.',
    ],
    button: { label: 'Confirmă adresa', url: emailVerifyUrl(cfg, d.token) },
  });
}

export function passwordChanged(cfg: Cfg, d: { name: string }): EmailContent {
  return render(cfg, 'Parola ta EventHub a fost schimbată', {
    heading: 'Parola a fost schimbată',
    lines: [
      `Bună, ${d.name}! Parola contului tău tocmai a fost schimbată, iar toate sesiunile deschise au fost închise.`,
      'Dacă nu tu ai schimbat-o, cere imediat o resetare a parolei folosind „Ai uitat parola?” pe pagina de autentificare.',
    ],
    button: { label: 'Autentifică-te', url: `${cfg.appUrl}/login` },
  });
}

// ---------- pentru organizator ----------

interface OrganizerData {
  organizerName: string;
  participantName: string;
  event: EventInfo;
  taken: number;
  capacity: number;
  /** Înscris automat de pe lista de așteptare. */
  fromWaitlist?: boolean;
}

export function organizerNewRegistration(cfg: Cfg, d: OrganizerData): EmailContent {
  const how = d.fromWaitlist ? ' (de pe lista de așteptare)' : '';
  return render(cfg, `Înscriere nouă: ${d.participantName} la „${d.event.title}”${how}`, {
    heading: 'Înscriere nouă',
    lines: [`Bună, ${d.organizerName}! ${d.participantName} s-a înscris la „${d.event.title}”${how}.`],
    facts: [['Locuri ocupate', `${d.taken} din ${d.capacity}`], ['Când', formatDate(d.event.startsAt, cfg.timeZone)]],
    button: { label: 'Deschide panoul', url: `${cfg.appUrl}/organizator` },
  });
}

export function organizerCancellation(cfg: Cfg, d: OrganizerData): EmailContent {
  return render(cfg, `Anulare: ${d.participantName} la „${d.event.title}”`, {
    heading: 'O înscriere a fost anulată',
    lines: [`Bună, ${d.organizerName}! ${d.participantName} și-a anulat înscrierea la „${d.event.title}”.`],
    facts: [['Locuri ocupate', `${d.taken} din ${d.capacity}`], ['Când', formatDate(d.event.startsAt, cfg.timeZone)]],
    button: { label: 'Deschide panoul', url: `${cfg.appUrl}/organizator` },
  });
}

export function paymentRefunded(cfg: Cfg, d: { name: string; eventTitle: string; amountCents: number }): EmailContent {
  return render(cfg, `Ți-am returnat banii pentru „${d.eventTitle}”`, {
    heading: 'Plată returnată',
    lines: [
      `${d.name ? `Bună, ${d.name}! ` : ''}Am returnat ${priceLabel(d.amountCents)} pentru biletul la „${d.eventTitle}”.`,
      'Suma apare în contul cardului în câteva zile lucrătoare, în funcție de bancă.',
    ],
    button: { label: 'Vezi evenimentele', url: cfg.appUrl },
  });
}
