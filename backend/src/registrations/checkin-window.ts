import { Event } from '../events/event.entity';

// Fereastra în care se pot valida bilete: de cu 3 ore înainte de început până la 6 ore după sfârșit
// (fără oră de sfârșit: 12 ore după început). În afara ei, un bilet scanat din greșeală nu marchează pe nimeni.
export const CHECKIN_OPENS_HOURS_BEFORE = 3;
export const CHECKIN_CLOSES_HOURS_AFTER_END = 6;
export const DEFAULT_LENGTH_HOURS = 12;

const H = 3_600_000;
export function checkInWindow(e: Pick<Event, 'startsAt' | 'endsAt'>) {
  const start = new Date(e.startsAt).getTime();
  const end = e.endsAt ? new Date(e.endsAt).getTime() : start + DEFAULT_LENGTH_HOURS * H;
  return { opens: new Date(start - CHECKIN_OPENS_HOURS_BEFORE * H), closes: new Date(end + CHECKIN_CLOSES_HOURS_AFTER_END * H) };
}
