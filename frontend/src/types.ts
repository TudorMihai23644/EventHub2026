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
  location: string;
  capacity: number;
  organizerId: string;
  organizer?: { id: string; name: string };
  registeredCount: number;
  availableSeats: number;
  occupancyPercent: number;
  status: 'OPEN' | 'FULL' | 'PAST';
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
  user: { id: string; name: string; email: string };
}

export interface OrganizerSummary {
  eventsCount: number;
  upcomingCount: number;
  totalRegistrations: number;
  totalWaiting: number;
}
