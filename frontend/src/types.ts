export type Role = 'PARTICIPANT' | 'ORGANIZER';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  /** false până când utilizatorul confirmă adresa din emailul primit la înregistrare. */
  emailVerified: boolean;
}

// Toate câmpurile derivate (status, flag-uri, procente) sunt calculate de API.
export interface EventItem {
  id: string;
  title: string;
  description: string;
  startsAt: string;
  /** Opțional; între început și sfârșit `status` este ONGOING. */
  endsAt: string | null;
  location: string;
  /** Cum se afișează locul: „Brașov”, „Online”, „Brașov și online”. */
  place: string;
  category: string;
  categoryLabel: string;
  format: EventFormat;
  /** Doar pentru participanții înscriși și organizator; altfel null. */
  onlineUrl: string | null;
  /** Există un link online (chiar dacă nu îl vezi încă). */
  hasOnlineLink: boolean;
  /** Imaginea de copertă (WebP, 16:9): `small` 640×360 pentru listă, `large` 1600×900 pentru pagina evenimentului. */
  cover: { small: string; large: string } | null;
  capacity: number;
  organizerId: string;
  organizer?: { id: string; name: string };
  registeredCount: number;
  availableSeats: number;
  occupancyPercent: number;
  status: 'OPEN' | 'FULL' | 'ONGOING' | 'PAST';
  isPast: boolean;
  isOwner: boolean;
  isRegistered: boolean;
  canRegister: boolean;
  /** Participant care s-ar putea înscrie, dar trebuie întâi să-și confirme emailul. */
  mustVerifyEmail: boolean;
  canCancel: boolean;
  canEdit: boolean;
  // listă de așteptare (calculate de API)
  waitlistCount: number;
  isWaitlisted: boolean;
  /** 1 = următorul care primește un loc; null dacă nu este pe listă. */
  waitlistPosition: number | null;
  canJoinWaitlist: boolean;
  canLeaveWaitlist: boolean;
  /** Doar la detaliile unui eveniment (GET /events/:id): link Google Calendar și calea fișierului .ics. */
  calendar?: { google: string; icsPath: string };
  /** Punctul pe hartă (găsit în fundal, prin OpenStreetMap); null pentru online sau dacă adresa nu a fost găsită. */
  map: { lat: number; lng: number; osmUrl: string; directionsUrl: string } | null;
  /** Doar pentru organizator: starea căutării adresei pe hartă și adresa găsită. */
  geocode: { status: 'PENDING' | 'FOUND' | 'NOT_FOUND' | 'FAILED' | 'SKIPPED'; label: string | null } | null;
  /** Prețul în bani (4990 = 49,90 lei); null = gratuit. */
  priceCents: number | null;
  price: { cents: number; currency: string; label: string } | null;
  /** Participantul poate cumpăra un bilet (eveniment cu plată, locuri, email confirmat). */
  canBuy: boolean;
  /** O plată începută și neterminată: același link Stripe, valabil până la `expiresAt`. */
  checkout: { url: string; expiresAt: string } | null;
  /** Eveniment cu plată, dar plățile sunt oprite pe server. */
  salesClosed: boolean;
  /** Biletul participantului înscris (codul din QR); null pentru ceilalți. */
  ticket: { code: string; display: string; checkedInAt: string | null } | null;
  /** Doar pentru organizatorul evenimentului: fereastra de validare a biletelor. */
  checkIn: { opens: string; closes: string; canScan: boolean; canMarkAttendance: boolean } | null;
}

/** POST /check-in */
export interface CheckInResponse {
  result: 'CHECKED_IN' | 'ALREADY_CHECKED_IN';
  checkedInAt: string;
  ticket: string;
  participant: { name: string };
  event: { id: string; title: string };
}

/** O listă de așteptare a participantului (GET /waitlist/me). */
export interface WaitlistItem {
  id: string;
  joinedAt: string;
  position: number | null;
  waitlistCount: number;
  isPast: boolean;
  canLeave: boolean;
  event: { id: string; title: string; startsAt: string; location: string; capacity: number };
}

/** Cine așteaptă, pentru organizator (GET /events/:id/waitlist). */
export interface WaitlistPerson {
  id: string;
  position: number;
  joinedAt: string;
  user: { id: string; name: string; email: string };
}

export type EventFormat = 'PHYSICAL' | 'ONLINE' | 'HYBRID';
export interface Option<T extends string = string> { value: T; label: string }
/** GET /events/categories */
export interface EventOptions {
  categories: Option[];
  formats: Option<EventFormat>[];
  /** Stripe configurat pe server: formularul arată câmpul de preț. */
  payments?: { enabled: boolean; currency: string; minCents: number };
}

// Listele paginate din API (ex. GET /events).
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface RegistrationItem {
  id: string;
  createdAt: string;
  isPast: boolean;
  canCancel: boolean;
  event: { id: string; title: string; description: string; startsAt: string; location: string; capacity: number; organizerId: string };
}

export interface Attendee {
  id: string;
  registeredAt: string;
  /** Când a fost validat biletul la intrare (scanare sau marcare manuală); null = nu a venit (încă). */
  checkedInAt: string | null;
  user: { id: string; name: string; email: string };
}

/** GET /events/:id/stats */
export interface EventStats {
  eventId: string;
  capacity: number;
  registered: number;
  waiting: number;
  availableSeats: number;
  occupancyPercent: number;
  checkedIn: number;
  /** Încasări (doar pentru evenimente cu plată). */
  revenue: { cents: number; label: string; ticketsSold: number; refunds: number } | null;
  /** null înainte de începerea evenimentului. */
  noShow: number | null;
  noShowPercent: number | null;
  byDay: { date: string; count: number; cumulative: number }[];
}

export interface OrganizerSummary {
  eventsCount: number;
  upcomingCount: number;
  totalRegistrations: number;
  totalWaiting: number;
}
