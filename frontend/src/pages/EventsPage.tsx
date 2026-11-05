import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { ENDPOINTS } from '../endpoints';
import { EventItem } from '../types';
import { DateTile, Loading, errMsg, seatsLabel } from '../ui';

export default function EventsPage() {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'asc' | 'desc'>('asc');
  const [available, setAvailable] = useState(false);
  const [events, setEvents] = useState<EventItem[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const t = setTimeout(async () => {
      const qs = new URLSearchParams({ sort });
      if (search.trim()) qs.set('search', search.trim());
      if (available) qs.set('available', 'true');
      try {
        setEvents(await api<EventItem[]>(ENDPOINTS.events.list(qs.toString())));
        setError('');
      } catch (e) {
        setError(errMsg(e));
      }
    }, 250);
    return () => clearTimeout(t);
  }, [search, sort, available]);

  return (
    <>
      <h1>Evenimente viitoare</h1>
      <div className="filters">
        <label className="grow">
          Caută după titlu sau locație
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ex. conferință, Brașov" />
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
    </>
  );
}
