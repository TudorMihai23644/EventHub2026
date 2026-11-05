import { Event } from './event.entity';
import { AuthUser } from '../auth/roles';

export type EventStatus = 'OPEN' | 'FULL' | 'PAST';

/**
 * Toată starea derivată pe care o afișează frontend-ul se calculează aici.
 * `waitlistPosition`: locul utilizatorului pe lista de așteptare (1 = următorul), sau null.
 */
export function buildEventView(e: Event, viewer?: AuthUser, registered = false, now = Date.now(), waitlistPosition: number | null = null) {
  const registeredCount = e.registeredCount ?? 0;
  const waitlistCount = e.waitlistCount ?? 0;
  const availableSeats = Math.max(0, e.capacity - registeredCount);
  const isPast = new Date(e.startsAt).getTime() <= now;
  const isOwner = viewer?.role === 'ORGANIZER' && viewer.id === e.organizerId;
  const isParticipant = viewer?.role === 'PARTICIPANT';
  // emailVerified vine din sesiune; `undefined` (ex. în teste vechi) contează ca confirmat
  const verified = viewer?.emailVerified !== false;
  const status: EventStatus = isPast ? 'PAST' : availableSeats === 0 ? 'FULL' : 'OPEN';
  const isWaitlisted = isParticipant && waitlistPosition !== null;
  // ce ar putea face un participant care nu e nici înscris, nici pe listă: înscriere (locuri) sau listă (plin)
  const free = isParticipant && !isPast && !registered && !isWaitlisted;
  const couldRegister = free && availableSeats > 0;
  const couldWait = free && availableSeats === 0;
  return {
    ...e,
    registeredCount,
    availableSeats,
    occupancyPercent: e.capacity ? Math.min(100, Math.round((registeredCount / e.capacity) * 100)) : 0,
    status,
    isPast,
    isOwner,
    isRegistered: isParticipant && registered,
    canRegister: couldRegister && verified,
    /** S-ar putea înscrie (sau intra pe lista de așteptare), dar întâi trebuie să-și confirme adresa de email. */
    mustVerifyEmail: (couldRegister || couldWait) && !verified,
    canCancel: isParticipant && registered && !isPast,
    canEdit: isOwner,
    // listă de așteptare
    waitlistCount,
    isWaitlisted,
    waitlistPosition: isWaitlisted ? waitlistPosition : null,
    canJoinWaitlist: couldWait && verified,
    canLeaveWaitlist: isWaitlisted && !isPast,
  };
}
