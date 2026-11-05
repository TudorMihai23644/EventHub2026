import { Event } from './event.entity';
import { AuthUser } from '../auth/roles';

export type EventStatus = 'OPEN' | 'FULL' | 'PAST';

// Toată starea derivată pe care o afișează frontend-ul se calculează aici.
export function buildEventView(e: Event, viewer?: AuthUser, registered = false, now = Date.now()) {
  const registeredCount = e.registeredCount ?? 0;
  const availableSeats = Math.max(0, e.capacity - registeredCount);
  const isPast = new Date(e.startsAt).getTime() <= now;
  const isOwner = viewer?.role === 'ORGANIZER' && viewer.id === e.organizerId;
  const isParticipant = viewer?.role === 'PARTICIPANT';
  const status: EventStatus = isPast ? 'PAST' : availableSeats === 0 ? 'FULL' : 'OPEN';
  return {
    ...e,
    registeredCount,
    availableSeats,
    occupancyPercent: e.capacity ? Math.min(100, Math.round((registeredCount / e.capacity) * 100)) : 0,
    status,
    isPast,
    isOwner,
    isRegistered: isParticipant && registered,
    canRegister: isParticipant && !isPast && !registered && availableSeats > 0,
    canCancel: isParticipant && registered && !isPast,
    canEdit: isOwner,
  };
}
