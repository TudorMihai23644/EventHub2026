import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { ENDPOINTS } from '../endpoints';
import { RegistrationItem, WaitlistItem } from '../types';
import { DateTile, Loading, errMsg, fmtDate, useToast } from '../ui';

export default function MyRegistrationsPage() {
  const { notify } = useToast();
  const [items, setItems] = useState<RegistrationItem[] | null>(null);
  const [waiting, setWaiting] = useState<WaitlistItem[] | null>(null);

  const load = useCallback(async () => {
    try {
      const [regs, wait] = await Promise.all([
        api<RegistrationItem[]>(ENDPOINTS.registrations.mine),
        api<WaitlistItem[]>(ENDPOINTS.waitlist.mine),
      ]);
      setItems(regs);
      setWaiting(wait);
    } catch (e) { notify('err', errMsg(e)); }
  }, [notify]);
  useEffect(() => { load(); }, [load]);

  async function cancel(eventId: string) {
    try {
      await api(ENDPOINTS.events.registrations(eventId), { method: 'DELETE' });
      notify('ok', 'Înscrierea a fost anulată.');
      load();
    } catch (e) { notify('err', errMsg(e)); }
  }

  async function leave(eventId: string) {
    try {
      await api(ENDPOINTS.events.waitlist(eventId), { method: 'DELETE' });
      notify('ok', 'Ai ieșit de pe lista de așteptare.');
      load();
    } catch (e) { notify('err', errMsg(e)); }
  }

  if (!items || !waiting) return <Loading />;
  return (
    <>
      <h1>Înscrierile mele</h1>
      {items.length === 0 && <p className="empty">Nu ești înscris la niciun eveniment. <Link to="/">Vezi evenimentele viitoare</Link></p>}
      <ul className="list">
        {items.map((r) => (
          <li key={r.id} className="row static">
            <DateTile iso={r.event.startsAt} />
            <div className="row-body">
              <h2><Link to={`/events/${r.event.id}`}>{r.event.title}</Link></h2>
              <p className="muted">{fmtDate(r.event.startsAt)}, {r.event.location}</p>
            </div>
            {r.canCancel
              ? <button className="btn ghost" onClick={() => cancel(r.event.id)}>Anulează</button>
              : r.isPast && <span className="pill full">Încheiat</span>}
          </li>
        ))}
      </ul>

      {waiting.length > 0 && (
        <section className="section">
          <h2 className="section-title">Liste de așteptare</h2>
          <p className="muted">Dacă se eliberează un loc, primul de pe listă este înscris automat și primește un email.</p>
          <ul className="list">
            {waiting.map((w) => (
              <li key={w.id} className="row static">
                <DateTile iso={w.event.startsAt} />
                <div className="row-body">
                  <h2><Link to={`/events/${w.event.id}`}>{w.event.title}</Link></h2>
                  <p className="muted">{fmtDate(w.event.startsAt)}, {w.event.location}</p>
                  {w.position !== null && <p className="small">Locul <strong>{w.position}</strong> din {w.waitlistCount}</p>}
                </div>
                {w.canLeave
                  ? <button className="btn ghost" onClick={() => leave(w.event.id)}>Ieși de pe listă</button>
                  : w.isPast && <span className="pill full">Încheiat</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
