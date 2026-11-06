import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, assetUrl } from '../api';
import { ENDPOINTS } from '../endpoints';
import { EventItem, Paginated } from '../types';
import { DateTile, Loading, errMsg, fmtWhen } from '../ui';

const PAGE_SIZE = 20;

/** /evenimente-trecute: arhiva publică, cele mai recente întâi. */
export default function PastEventsPage() {
  const [items, setItems] = useState<EventItem[] | null>(null);
  const [info, setInfo] = useState<Pick<Paginated<EventItem>, 'page' | 'totalPages' | 'total'> | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async (page: number) => {
    setBusy(true);
    try {
      const res = await api<Paginated<EventItem>>(ENDPOINTS.events.past(new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) }).toString()));
      setItems((prev) => (page === 1 ? res.items : [...(prev ?? []), ...res.items.filter((e) => !(prev ?? []).some((p) => p.id === e.id))]));
      setInfo(res);
      setError('');
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => { load(1); }, []);

  return (
    <>
      <h1>Evenimente trecute</h1>
      {error && <p className="alert err">{error}</p>}
      {!items && !error && <Loading />}
      {items && items.length === 0 && <p className="empty">Încă nu există evenimente trecute. <Link to="/">Vezi evenimentele viitoare</Link></p>}
      <ul className="list">
        {items?.map((e) => (
          <li key={e.id}>
            <Link to={`/events/${e.id}`} className="row past">
              {e.cover ? <img className="row-cover" src={assetUrl(e.cover.small)} alt="" width={640} height={360} loading="lazy" /> : <DateTile iso={e.startsAt} />}
              <div className="row-body">
                <h2>{e.title}</h2>
                <p className="muted">{fmtWhen(e.startsAt, e.endsAt)}, {e.place}</p>
                <p className="small tag">{e.categoryLabel}</p>
              </div>
              <span className="pill full">{e.registeredCount} participanți</span>
            </Link>
          </li>
        ))}
      </ul>
      {items && info && info.page < info.totalPages && (
        <div className="more"><button className="btn ghost" onClick={() => load(info.page + 1)} disabled={busy}>{busy ? 'Se încarcă…' : 'Încarcă mai multe'}</button></div>
      )}
    </>
  );
}
