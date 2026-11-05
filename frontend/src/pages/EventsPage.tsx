import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { ENDPOINTS } from '../endpoints';
import { EventItem, Paginated } from '../types';
import { DateTile, Loading, errMsg, seatsLabel } from '../ui';

const PAGE_SIZE = 20;
type PageInfo = Pick<Paginated<EventItem>, 'total' | 'page' | 'totalPages'>;

export default function EventsPage() {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'asc' | 'desc'>('asc');
  const [available, setAvailable] = useState(false);
  const [events, setEvents] = useState<EventItem[] | null>(null);
  const [info, setInfo] = useState<PageInfo | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  // Crește la fiecare schimbare de filtre. Un răspuns pentru filtre vechi (rețea lentă) este ignorat.
  const generation = useRef(0);

  const fetchPage = (page: number) => {
    const qs = new URLSearchParams({ sort, page: String(page), limit: String(PAGE_SIZE) });
    if (search.trim()) qs.set('search', search.trim());
    if (available) qs.set('available', 'true');
    return api<Paginated<EventItem>>(ENDPOINTS.events.list(qs.toString()));
  };

  // Filtre noi: se pornește din nou de la pagina 1.
  useEffect(() => {
    const gen = ++generation.current;
    const t = setTimeout(async () => {
      try {
        const res = await fetchPage(1);
        if (gen !== generation.current) return;
        setEvents(res.items);
        setInfo(res);
        setError('');
      } catch (e) {
        if (gen === generation.current) setError(errMsg(e));
      }
    }, 250);
    return () => clearTimeout(t);
  }, [search, sort, available]);

  async function loadMore() {
    if (!info) return;
    const gen = generation.current;
    setLoadingMore(true);
    try {
      const res = await fetchPage(info.page + 1);
      if (gen !== generation.current) return;
      // Dacă între timp lista s-a mutat (ex. un eveniment s-a umplut), nu afișăm același eveniment de două ori.
      setEvents((prev) => {
        const seen = new Set((prev ?? []).map((e) => e.id));
        return [...(prev ?? []), ...res.items.filter((e) => !seen.has(e.id))];
      });
      setInfo(res);
      setError('');
    } catch (e) {
      if (gen === generation.current) setError(errMsg(e));
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <>
      <h1>Evenimente viitoare</h1>
      <div className="filters">
        <label className="grow">
          Caută după titlu sau locație
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ex. conferință, Brașov" maxLength={100} />
        </label>
        <label>
          Sortare după dată
          <select value={sort} onChange={(e) => setSort(e.target.value as 'asc' | 'desc')}>
            <option value="asc">Cele mai apropiate întâi</option>
            <option value="desc">Cele mai îndepărtate întâi</option>
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={available} onChange={(e) => setAvailable(e.target.checked)} />
          Doar cu locuri libere
        </label>
      </div>

      {error && <p className="alert err">{error}</p>}
      {!events && !error && <Loading />}
      {events && events.length === 0 && (
        <p className="empty">Niciun eveniment nu corespunde căutării. Încearcă alt cuvânt sau elimină filtrele.</p>
      )}
      <ul className="list">
        {events?.map((e) => (
          <li key={e.id}>
            <Link to={`/events/${e.id}`} className="row">
              <DateTile iso={e.startsAt} />
              <div className="row-body">
                <h2>{e.title}</h2>
                <p className="muted">
                  {new Date(e.startsAt).toLocaleTimeString('ro-RO', { timeStyle: 'short' })}, {e.location}
                </p>
              </div>
              <span className={`pill ${e.status === 'FULL' ? 'full' : ''}`}>{seatsLabel(e)}</span>
            </Link>
          </li>
        ))}
      </ul>

      {events && info && info.total > 0 && (
        <div className="more">
          <p className="muted" aria-live="polite">Afișate {events.length} din {info.total} evenimente</p>
          {info.page < info.totalPages && (
            <button className="btn ghost" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? 'Se încarcă…' : 'Încarcă mai multe'}
            </button>
          )}
        </div>
      )}
    </>
  );
}
