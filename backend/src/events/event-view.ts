import { Event } from './event.entity';
import { AuthUser } from '../auth/roles';
import { categoryLabel, placeLabel } from './categories';

/** ONGOING: a început, dar nu s-a terminat (are oră de sfârșit). Pentru reguli contează tot `isPast` (= a început). */
export type EventStatus = 'OPEN' | 'FULL' | 'ONGOING' | 'PAST';

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
  const ongoing = isPast && !!e.endsAt && new Date(e.endsAt).getTime() > now;
  const status: EventStatus = ongoing ? 'ONGOING' : isPast ? 'PAST' : availableSeats === 0 ? 'FULL' : 'OPEN';
  // Linkul online: doar participanții înscriși și organizatorul (altfel capacitatea n-ar mai însemna nimic).
  const canSeeOnlineUrl = isOwner || (isParticipant && registered);
  const isWaitlisted = isParticipant && waitlistPosition !== null;
  // ce ar putea face un participant care nu e nici înscris, nici pe listă: înscriere (locuri) sau listă (plin)
  const free = isParticipant && !isPast && !registered && !isWaitlisted;
  const couldRegister = free && availableSeats > 0;
  const couldWait = free && availableSeats === 0;
  return {
    ...e,
    onlineUrl: canSeeOnlineUrl ? e.onlineUrl ?? null : null,
    hasOnlineLink: (e.format === 'ONLINE' || e.format === 'HYBRID') && !!e.onlineUrl,
    categoryLabel: categoryLabel(e.category),
    place: placeLabel(e),
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
