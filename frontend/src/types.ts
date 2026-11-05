export type Role = 'PARTICIPANT' | 'ORGANIZER';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
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
  canCancel: boolean;
  canEdit: boolean;
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
}
