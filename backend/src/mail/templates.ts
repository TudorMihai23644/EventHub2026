import { MailConfig } from './mail.config';

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
}

type Cfg = Pick<MailConfig, 'appUrl' | 'timeZone'>;

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
}

function render(cfg: Cfg, subject: string, b: Body): EmailContent {
  const p = (t: string) => `<p style="margin:0 0 14px;line-height:1.55">${escapeHtml(t)}</p>`;
  const facts = (b.facts ?? [])
    .map(([k, v]) => `<tr><td style="padding:4px 16px 4px 0;color:#a1a1ab;white-space:nowrap">${escapeHtml(k)}</td><td style="padding:4px 0;color:#ffffff">${escapeHtml(v)}</td></tr>`)
    .join('');
  const button = b.button
    ? `<p style="margin:22px 0 6px"><a href="${escapeHtml(b.button.url)}" style="display:inline-block;background:#ff1030;color:#000000;font-weight:800;text-decoration:none;padding:12px 22px;border-radius:999px">${escapeHtml(b.button.label)}</a></p>`
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
</td></tr></table>
<p style="margin:16px 0 0;font-size:12px;color:#6d6d77">Primești acest email pentru că ai un cont EventHub.</p>
</td></tr></table></body></html>`;
  const text = [
    b.heading,
    '',
    ...b.lines.flatMap((l) => [l, '']),
    ...(b.facts ?? []).map(([k, v]) => `${k}: ${v}`),
    ...(b.button ? ['', `${b.button.label}: ${b.button.url}`] : []),
    '',
    '— EventHub',
  ].join('\n');
  return { subject: oneLine(subject), html, text };
}

const eventFacts = (cfg: Cfg, e: EventInfo): [string, string][] => [
  ['Când', formatDate(e.startsAt, cfg.timeZone)],
  ['Unde', e.location],
];

// ---------- pentru participanți ----------

export function registrationConfirmed(cfg: Cfg, d: { name: string; event: EventInfo }): EmailContent {
  return render(cfg, `Te-ai înscris la „${d.event.title}”`, {
    heading: `Te-ai înscris la „${d.event.title}”`,
    lines: [`Bună, ${d.name}! Înscrierea ta a fost confirmată.`],
    facts: eventFacts(cfg, d.event),
    button: { label: 'Vezi evenimentul', url: eventUrl(cfg, d.event.id) },
  });
}

export function registrationCancelled(cfg: Cfg, d: { name: string; event: EventInfo }): EmailContent {
  return render(cfg, `Înscrierea la „${d.event.title}” a fost anulată`, {
    heading: 'Înscriere anulată',
    lines: [`Bună, ${d.name}! Ți-ai anulat înscrierea la „${d.event.title}”.`, 'Dacă te răzgândești și mai sunt locuri, te poți înscrie din nou.'],
    facts: eventFacts(cfg, d.event),
    button: { label: 'Vezi evenimentul', url: eventUrl(cfg, d.event.id) },
  });
}

/** Câmpurile care contează pentru cine vine. Capacitatea și descrierea nu declanșează email. */
export function eventChanges(cfg: Cfg, before: EventInfo, after: EventInfo): [string, string][] {
  const changes: [string, string][] = [];
  if (before.title !== after.title) changes.push(['Titlu', `${before.title} → ${after.title}`]);
  if (before.startsAt.getTime() !== after.startsAt.getTime()) {
    changes.push(['Când', `${formatDate(before.startsAt, cfg.timeZone)} → ${formatDate(after.startsAt, cfg.timeZone)}`]);
  }
  if (before.location !== after.location) changes.push(['Unde', `${before.location} → ${after.location}`]);
  return changes;
}

export function eventUpdated(cfg: Cfg, d: { name: string; before: EventInfo; after: EventInfo }): EmailContent {
  return render(cfg, `S-a schimbat evenimentul „${d.after.title}”`, {
    heading: `Modificări la „${d.after.title}”`,
    lines: [`Bună, ${d.name}! Organizatorul a modificat un eveniment la care ești înscris. Înscrierea ta rămâne valabilă.`],
    facts: eventChanges(cfg, d.before, d.after),
    button: { label: 'Vezi evenimentul', url: eventUrl(cfg, d.after.id) },
  });
}

export function eventCancelled(cfg: Cfg, d: { name: string; event: EventInfo }): EmailContent {
  return render(cfg, `Evenimentul „${d.event.title}” a fost anulat`, {
    heading: `„${d.event.title}” a fost anulat`,
    lines: [`Bună, ${d.name}! Organizatorul a anulat evenimentul la care erai înscris, iar înscrierea ta a fost ștearsă.`],
    facts: [['Era programat', formatDate(d.event.startsAt, cfg.timeZone)], ['Unde', d.event.location]],
    button: { label: 'Vezi alte evenimente', url: `${cfg.appUrl}/` },
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
}

export function organizerNewRegistration(cfg: Cfg, d: OrganizerData): EmailContent {
  return render(cfg, `Înscriere nouă: ${d.participantName} la „${d.event.title}”`, {
    heading: 'Înscriere nouă',
    lines: [`Bună, ${d.organizerName}! ${d.participantName} s-a înscris la „${d.event.title}”.`],
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
