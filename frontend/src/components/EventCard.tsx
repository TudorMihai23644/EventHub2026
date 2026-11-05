export interface EventItem {
  id: string | number;
  title: string;
  description: string;
  date: string;
  location: string;
  capacity?: number;
  registeredCount?: number;
}

interface EventCardProps {
  event: EventItem;
  onRegister?: (eventId: string | number) => void;
  isRegistered?: boolean;
}

export function EventCard({ event, onRegister, isRegistered }: EventCardProps) {
  const isFull =
    event.capacity !== undefined &&
    event.registeredCount !== undefined &&
    event.registeredCount >= event.capacity;

  return (
    <article className="neon-card">
      <div>
        <div className="card-meta">
          <span className="badge-status">
            {isFull ? 'Sold Out' : 'Înscrieri Deschise'}
          </span>
          <span>#{event.id}</span>
        </div>

        <h3 className="card-title">{event.title}</h3>
        <p className="card-description">{event.description}</p>
      </div>

      <div>
        <ul className="card-info-list">
          <li>
            <strong>Data: </strong>
            {new Date(event.date).toLocaleString('ro-RO')}
          </li>
          <li>
            <strong>Locație: </strong>
            {event.location}
          </li>
          {event.capacity !== undefined && (
            <li>
              <strong>Locuri: </strong>
              {event.registeredCount ?? 0} / {event.capacity}
            </li>
          )}
        </ul>

        {onRegister && (
          <button
            className={`btn-neon ${isRegistered ? 'btn-neon-outline' : ''}`}
            style={{ width: '100%' }}
            disabled={isFull || isRegistered}
            onClick={() => onRegister(event.id)}
          >
            {isRegistered
              ? 'Deja Înscris'
              : isFull
              ? 'Locuri Epuizate'
              : 'Rezervă Loc Acum'}
          </button>
        )}
      </div>
    </article>
  );
}
