import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { ENDPOINTS } from '../endpoints';
import { RegistrationItem } from '../types';
import { DateTile, Loading, errMsg, fmtDate, useToast } from '../ui';

export default function MyRegistrationsPage() {
  const { notify } = useToast();
  const [items, setItems] = useState<RegistrationItem[] | null>(null);

  const load = useCallback(async () => {
    try { setItems(await api<RegistrationItem[]>(ENDPOINTS.registrations.mine)); }
    catch (e) { notify('err', errMsg(e)); }
  }, [notify]);
  useEffect(() => { load(); }, [load]);

  async function cancel(eventId: string) {
    try {
      await api(ENDPOINTS.events.registrations(eventId), { method: 'DELETE' });
      notify('ok', 'Înscrierea a fost anulată.');
      load();
    } catch (e) { notify('err', errMsg(e)); }
  }

  if (!items) return <Loading />;
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
    </>
  );
}
