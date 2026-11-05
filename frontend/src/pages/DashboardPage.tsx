import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { ENDPOINTS } from '../endpoints';
import { Attendee, EventItem, OrganizerSummary } from '../types';
import { DateTile, Loading, errMsg, fmtDate, useToast } from '../ui';

export default function DashboardPage() {
  const { notify } = useToast();
  const [events, setEvents] = useState<EventItem[] | null>(null);
  const [summary, setSummary] = useState<OrganizerSummary | null>(null);
  const [attendees, setAttendees] = useState<Record<string, Attendee[]>>({});

  const load = useCallback(async () => {
    try {
      const [list, sum] = await Promise.all([
        api<EventItem[]>(ENDPOINTS.events.mine),
        api<OrganizerSummary>(ENDPOINTS.events.summary),
      ]);
      setEvents(list);
      setSummary(sum);
    } catch (e) { notify('err', errMsg(e)); }
  }, [notify]);
  useEffect(() => { load(); }, [load]);

  async function remove(e: EventItem) {
    if (!window.confirm(`Ștergi evenimentul „${e.title}”? Înscrierile existente vor fi șterse.`)) return;
    try {
      await api(ENDPOINTS.events.one(e.id), { method: 'DELETE' });
      notify('ok', 'Evenimentul a fost șters.');
      load();
    } catch (err) { notify('err', errMsg(err)); }
  }

  async function toggleAttendees(e: EventItem) {
    if (attendees[e.id]) {
      setAttendees((a) => { const next = { ...a }; delete next[e.id]; return next; });
      return;
    }
    try {
      const list = await api<Attendee[]>(ENDPOINTS.events.registrations(e.id));
      setAttendees((a) => ({ ...a, [e.id]: list }));
    } catch (err) { notify('err', errMsg(err)); }
  }

  if (!events || !summary) return <Loading />;

  return (
    <>
      <div className="head-row">
        <div>
          <h1>Evenimentele mele</h1>
          <p className="muted">
            {summary.eventsCount} evenimente ({summary.upcomingCount} viitoare), {summary.totalRegistrations} înscrieri în total
          </p>
        </div>
        <Link className="btn" to="/organizator/nou">Eveniment nou</Link>
      </div>
      {events.length === 0 && <p className="empty">Nu ai creat încă niciun eveniment. Începe cu butonul „Eveniment nou”.</p>}
      <ul className="list">
        {events.map((e) => (
          <li key={e.id} className="row static">
            <DateTile iso={e.startsAt} />
            <div className="row-body">
              <h2><Link to={`/events/${e.id}`}>{e.title}</Link>{e.isPast && <span className="pill full">Încheiat</span>}</h2>
              <p className="muted">{fmtDate(e.startsAt)}, {e.location}</p>
              <div className="meter" role="img" aria-label={`${e.registeredCount} din ${e.capacity} locuri ocupate`}>
                <span style={{ width: `${e.occupancyPercent}%` }} />
              </div>
              <p className="small"><strong>{e.registeredCount}</strong> înscriși din {e.capacity} locuri</p>
              {attendees[e.id] && (
                attendees[e.id].length === 0
                  ? <p className="muted small">Încă nu există înscriși.</p>
                  : <ul className="attendees">
                      {attendees[e.id].map((a) => <li key={a.id}>{a.user.name} <span className="muted">({a.user.email})</span></li>)}
                    </ul>
              )}
            </div>
            <div className="actions">
              <button className="btn ghost" onClick={() => toggleAttendees(e)}>{attendees[e.id] ? 'Ascunde înscrișii' : 'Vezi înscrișii'}</button>
              {e.canEdit && <Link className="btn ghost" to={`/organizator/${e.id}/editare`}>Editează</Link>}
              {e.canEdit && <button className="btn danger" onClick={() => remove(e)}>Șterge</button>}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
