import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, apiDownload } from '../api';
import { ENDPOINTS } from '../endpoints';
import { Attendee, EventItem, EventStats, OrganizerSummary, WaitlistPerson } from '../types';
import { DateTile, Loading, errMsg, fmtWhen, useToast } from '../ui';

export default function DashboardPage() {
  const { notify } = useToast();
  const [events, setEvents] = useState<EventItem[] | null>(null);
  const [summary, setSummary] = useState<OrganizerSummary | null>(null);
  const [attendees, setAttendees] = useState<Record<string, Attendee[]>>({});
  const [waiting, setWaiting] = useState<Record<string, WaitlistPerson[]>>({});
  const [stats, setStats] = useState<Record<string, EventStats>>({});

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
    const who = e.waitlistCount > 0 ? 'Înscrierile și lista de așteptare vor fi șterse' : 'Înscrierile existente vor fi șterse';
    if (!window.confirm(`Ștergi evenimentul „${e.title}”? ${who}, iar toți cei afectați primesc un email.`)) return;
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

  async function toggleStats(e: EventItem) {
    if (stats[e.id]) {
      setStats((s) => { const next = { ...s }; delete next[e.id]; return next; });
      return;
    }
    try {
      const data = await api<EventStats>(ENDPOINTS.events.stats(e.id));
      setStats((s) => ({ ...s, [e.id]: data }));
    } catch (err) { notify('err', errMsg(err)); }
  }

  /** Marcare manuală (ex. participant fără telefon); se poate corecta și după eveniment. */
  async function markAttendance(e: EventItem, a: Attendee, present: boolean) {
    try {
      const res = await api<{ id: string; checkedInAt: string | null }>(ENDPOINTS.events.attendance(e.id, a.id), { method: 'PUT', body: { present } });
      setAttendees((all) => ({ ...all, [e.id]: all[e.id].map((x) => (x.id === a.id ? { ...x, checkedInAt: res.checkedInAt } : x)) }));
      if (stats[e.id]) setStats((s) => { const next = { ...s }; delete next[e.id]; return next; }); // cifrele s-au schimbat
    } catch (err) { notify('err', errMsg(err)); }
  }

  async function exportCsv(e: EventItem) {
    try { await apiDownload(ENDPOINTS.events.attendeesCsv(e.id), 'participanti.csv'); }
    catch (err) { notify('err', errMsg(err)); }
  }

  async function toggleWaiting(e: EventItem) {
    if (waiting[e.id]) {
      setWaiting((w) => { const next = { ...w }; delete next[e.id]; return next; });
      return;
    }
    try {
      const list = await api<WaitlistPerson[]>(ENDPOINTS.events.waitlist(e.id));
      setWaiting((w) => ({ ...w, [e.id]: list }));
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
            {summary.totalWaiting > 0 && `, ${summary.totalWaiting} pe liste de așteptare`}
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
              <h2>
                <Link to={`/events/${e.id}`}>{e.title}</Link>
                {e.status === 'ONGOING' && <span className="pill">În desfășurare</span>}
                {e.status === 'PAST' && <span className="pill full">Încheiat</span>}
              </h2>
              <p className="muted">{fmtWhen(e.startsAt, e.endsAt)}, {e.place} · {e.categoryLabel}</p>
              <div className="meter" role="img" aria-label={`${e.registeredCount} din ${e.capacity} locuri ocupate`}>
                <span style={{ width: `${e.occupancyPercent}%` }} />
              </div>
              <p className="small">
                <strong>{e.registeredCount}</strong> înscriși din {e.capacity} locuri
                {e.waitlistCount > 0 && <> · <strong>{e.waitlistCount}</strong> în așteptare</>}
              </p>
              {attendees[e.id] && (
                attendees[e.id].length === 0
                  ? <p className="muted small">Încă nu există înscriși.</p>
                  : <ul className="attendees">
                      {attendees[e.id].map((a) => (
                        <li key={a.id} className={a.checkedInAt ? 'present' : undefined}>
                          {e.checkIn?.canMarkAttendance && (
                            <input type="checkbox" checked={!!a.checkedInAt} onChange={(ch) => markAttendance(e, a, ch.target.checked)}
                              aria-label={`${a.user.name} este prezent`} />
                          )}
                          {a.user.name} <span className="muted">({a.user.email})</span>
                          {a.checkedInAt && <span className="pill ok">prezent {new Date(a.checkedInAt).toLocaleTimeString('ro-RO', { timeStyle: 'short' })}</span>}
                        </li>
                      ))}
                    </ul>
              )}
              {stats[e.id] && <StatsPanel s={stats[e.id]} />}
              {waiting[e.id] && (
                <>
                  <p className="small"><strong>Lista de așteptare</strong> (în ordine; primul primește următorul loc liber)</p>
                  <ol className="attendees">
                    {waiting[e.id].map((w) => <li key={w.id}>{w.user.name} <span className="muted">({w.user.email})</span></li>)}
                  </ol>
                </>
              )}
            </div>
            <div className="actions">
              {e.checkIn?.canScan && <Link className="btn" to="/check-in">Validează bilete</Link>}
              <button className="btn ghost" onClick={() => toggleAttendees(e)}>{attendees[e.id] ? 'Ascunde înscrișii' : 'Vezi înscrișii'}</button>
              <button className="btn ghost" onClick={() => toggleStats(e)}>{stats[e.id] ? 'Ascunde statisticile' : 'Statistici'}</button>
              <button className="btn ghost" onClick={() => exportCsv(e)} title="Înscrișii și lista de așteptare, pentru Excel">Export CSV</button>
              {e.waitlistCount > 0 && (
                <button className="btn ghost" onClick={() => toggleWaiting(e)}>{waiting[e.id] ? 'Ascunde lista de așteptare' : 'Vezi lista de așteptare'}</button>
              )}
              {e.canEdit && <Link className="btn ghost" to={`/organizator/${e.id}/editare`}>Editează</Link>}
              {e.canEdit && <button className="btn danger" onClick={() => remove(e)}>Șterge</button>}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

/** Înscrierile pe zile: bare simple, proporționale cu ziua cea mai aglomerată. */
function StatsPanel({ s }: { s: EventStats }) {
  const max = Math.max(1, ...s.byDay.map((d) => d.count));
  const label = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('ro-RO', { day: 'numeric', month: 'short' });
  return (
    <div className="stats" aria-label="Statistici înscrieri">
      <div className="stat-row">
        <div><strong>{s.registered}</strong><span>înscriși</span></div>
        <div><strong>{s.availableSeats}</strong><span>locuri libere</span></div>
        <div><strong>{s.waiting}</strong><span>în așteptare</span></div>
        <div><strong>{s.occupancyPercent}%</strong><span>ocupare</span></div>
        {s.revenue && <div><strong>{s.revenue.label}</strong><span>încasări ({s.revenue.ticketsSold} bilete{s.revenue.refunds ? `, ${s.revenue.refunds} returnate` : ''})</span></div>}
        {s.noShow !== null && <div><strong>{s.checkedIn}</strong><span>prezenți</span></div>}
        {s.noShow !== null && <div><strong>{s.noShowPercent ?? 0}%</strong><span>absenți ({s.noShow})</span></div>}
      </div>
      {s.byDay.length === 0
        ? <p className="muted small">Încă nu există înscrieri.</p>
        : (
          <ol className="bars">
            {s.byDay.map((d) => (
              <li key={d.date} title={`${label(d.date)}: ${d.count} înscrieri (total ${d.cumulative})`}>
                <span className="bar-fill" style={{ height: `${Math.round((d.count / max) * 100)}%` }} />
                <span className="bar-label">{label(d.date)}</span>
              </li>
            ))}
          </ol>
        )}
      <p className="muted small">Înscrierile actuale, după ziua în care s-au făcut (cele anulate nu apar).</p>
    </div>
  );
}
