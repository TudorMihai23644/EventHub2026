import { buildEventView } from './event-view';
import { Event } from './event.entity';

const day = 86_400_000;
const ev = (over: Partial<Event> = {}) =>
  ({ id: 'e1', organizerId: 'org1', capacity: 2, registeredCount: 0, startsAt: new Date(Date.now() + day), ...over }) as Event;

describe('buildEventView', () => {
  it('participantul se poate înscrie la un eveniment viitor cu locuri', () => {
    const v = buildEventView(ev(), { id: 'u1', role: 'PARTICIPANT' }, false);
    expect(v).toMatchObject({ status: 'OPEN', canRegister: true, canCancel: false, canEdit: false });
  });

  it('nu permite înscrierea când evenimentul e plin, dar permite anularea celui înscris', () => {
    const full = ev({ registeredCount: 2 });
    expect(buildEventView(full, { id: 'u1', role: 'PARTICIPANT' }, false)).toMatchObject({ status: 'FULL', canRegister: false });
    expect(buildEventView(full, { id: 'u2', role: 'PARTICIPANT' }, true)).toMatchObject({ isRegistered: true, canCancel: true });
  });

  it('un eveniment trecut nu mai poate fi înscris sau anulat', () => {
    const past = ev({ startsAt: new Date(Date.now() - day) });
    expect(buildEventView(past, { id: 'u1', role: 'PARTICIPANT' }, true)).toMatchObject({ status: 'PAST', canRegister: false, canCancel: false });
  });

  it('participantul cu email neconfirmat nu se poate înscrie, dar primește mustVerifyEmail', () => {
    const v = buildEventView(ev(), { id: 'u1', role: 'PARTICIPANT', emailVerified: false }, false);
    expect(v).toMatchObject({ canRegister: false, mustVerifyEmail: true });
    const ok = buildEventView(ev(), { id: 'u1', role: 'PARTICIPANT', emailVerified: true }, false);
    expect(ok).toMatchObject({ canRegister: true, mustVerifyEmail: false });
    // plin: nu se poate înscrie, dar ar putea intra pe lista de așteptare după confirmare
    expect(buildEventView(ev({ registeredCount: 2 }), { id: 'u1', role: 'PARTICIPANT', emailVerified: false }, false))
      .toMatchObject({ canRegister: false, canJoinWaitlist: false, mustVerifyEmail: true });
  });

  describe('lista de așteptare', () => {
    const p = { id: 'u1', role: 'PARTICIPANT' as const, emailVerified: true };
    const full = (over: Partial<Event> = {}) => ev({ registeredCount: 2, waitlistCount: 4, ...over });

    it('eveniment plin: participantul poate intra pe listă și vede câți așteaptă', () => {
      expect(buildEventView(full(), p)).toMatchObject({
        status: 'FULL', canRegister: false, canJoinWaitlist: true, isWaitlisted: false, waitlistPosition: null, waitlistCount: 4,
      });
    });

    it('cu locuri libere nu există opțiunea de listă', () => {
      expect(buildEventView(ev(), p)).toMatchObject({ canRegister: true, canJoinWaitlist: false });
    });

    it('pe listă: își vede locul, poate ieși, nu poate intra din nou', () => {
      expect(buildEventView(full(), p, false, Date.now(), 3)).toMatchObject({
        isWaitlisted: true, waitlistPosition: 3, canLeaveWaitlist: true, canJoinWaitlist: false, canRegister: false, mustVerifyEmail: false,
      });
    });

    it('înscris: nicio acțiune de listă', () => {
      expect(buildEventView(full(), p, true)).toMatchObject({ canJoinWaitlist: false, canLeaveWaitlist: false, isWaitlisted: false });
    });

    it('eveniment trecut: nici intrare, nici ieșire', () => {
      expect(buildEventView(full({ startsAt: new Date(Date.now() - day) }), p, false, Date.now(), 1))
        .toMatchObject({ canJoinWaitlist: false, canLeaveWaitlist: false });
    });

    it('organizatorul și vizitatorul văd doar numărul celor care așteaptă', () => {
      for (const viewer of [{ id: 'org1', role: 'ORGANIZER' as const }, undefined]) {
        expect(buildEventView(full(), viewer, false, Date.now(), 2)).toMatchObject({
          waitlistCount: 4, canJoinWaitlist: false, isWaitlisted: false, waitlistPosition: null,
        });
      }
    });
  });

  it('doar organizatorul proprietar are canEdit; vizitatorul nu are nicio acțiune', () => {
    expect(buildEventView(ev(), { id: 'org1', role: 'ORGANIZER' }).canEdit).toBe(true);
    expect(buildEventView(ev(), { id: 'org2', role: 'ORGANIZER' }).canEdit).toBe(false);
    expect(buildEventView(ev())).toMatchObject({ canRegister: false, canCancel: false, canEdit: false });
  });
});
