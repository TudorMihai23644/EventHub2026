import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api, assetUrl } from '../api';
import { ENDPOINTS } from '../endpoints';
import { useAuth } from '../auth';
import { EventItem } from '../types';
import { DateTile, Loading, errMsg, fmtWhen, seatsLabel, useToast } from '../ui';
import { ResendVerificationButton } from './VerifyEmailPage';
import { API_URL } from '../config';
import TicketCard from '../TicketCard';

const EventMap = lazy(() => import('../EventMap'));

export default function EventDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const { notify } = useToast();
  const [ev, setEv] = useState<EventItem | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [params, setParams] = useSearchParams();
  const payment = params.get('plata'); // întoarcerea de la Stripe: succes / anulata

  // API-ul întoarce și starea utilizatorului curent (isRegistered, canRegister, ...),
  // deci se reîncarcă la autentificare / deconectare.
  const load = useCallback(async () => {
    try {
      setEv(await api<EventItem>(ENDPOINTS.events.one(id as string)));
      setError('');
    } catch (err) {
      setError(errMsg(err));
    }
  }, [id, user]);

  useEffect(() => { load(); }, [load]);

  // După plată, Stripe ne anunță printr-un webhook, de obicei în câteva secunde: reîncărcăm până apare înscrierea.
  const confirmed = !!ev?.isRegistered;
  useEffect(() => {
    if (payment !== 'succes' || confirmed) return;
    let tries = 0;
    const t = setInterval(() => { if (++tries > 15) clearInterval(t); else load(); }, 2000);
    return () => clearInterval(t);
  }, [payment, confirmed, load]);

  async function buy() {
    setBusy(true);
    try {
      const { url } = await api<{ url: string }>(ENDPOINTS.events.checkout(id as string), { method: 'POST' });
      window.location.assign(url); // pagina de plată Stripe
    } catch (err) {
      notify('err', errMsg(err));
      await load();
      setBusy(false);
    }
  }

  async function act(method: 'POST' | 'DELETE') {
    setBusy(true);
    try {
      await api(ENDPOINTS.events.registrations(id as string), { method });
      notify('ok', method === 'POST' ? 'Te-ai înscris cu succes.' : 'Înscrierea a fost anulată.');
    } catch (err) {
      notify('err', errMsg(err));
    } finally {
      await load();
      setBusy(false);
    }
  }

  async function waitlistAct(method: 'POST' | 'DELETE') {
    setBusy(true);
    try {
      const res = await api<{ position: number } | undefined>(ENDPOINTS.events.waitlist(id as string), { method });
      notify('ok', method === 'POST'
        ? `Ești pe lista de așteptare, pe locul ${res?.position}. Te înscriem automat dacă se eliberează un loc.`
        : 'Ai ieșit de pe lista de așteptare.');
    } catch (err) {
      notify('err', errMsg(err)); // ex. tocmai s-a eliberat un loc: pagina reîncărcată arată „Înscrie-te”
    } finally {
      await load();
      setBusy(false);
    }
  }

  if (error) return <p className="alert err">{error} <Link to="/">Înapoi la evenimente</Link></p>;
  if (!ev) return <Loading />;

  return (
    <article className="detail">
      <Link to="/" className="back">Toate evenimentele</Link>
      {ev.cover && <img className="detail-cover" src={assetUrl(ev.cover.large)} alt={ev.title} width={1600} height={900} />}
      <div className="detail-head">
        <DateTile iso={ev.startsAt} />
        <div>
          <p className="small tag">{ev.categoryLabel}</p>
          <h1>{ev.title}</h1>
          <p className="muted">{fmtWhen(ev.startsAt, ev.endsAt)}, {ev.place}</p>
          {ev.organizer && <p className="muted">Organizator: {ev.organizer.name}</p>}
        </div>
      </div>

      {ev.ticket && <TicketCard ticket={ev.ticket} title={ev.title} />}

      <p className="desc">{ev.description}</p>

      {payment === 'succes' && (
        <p className={`alert ${ev.isRegistered ? 'ok' : ''}`} role="status">
          {ev.isRegistered ? 'Plata a fost primită. Biletul tău este mai jos și pe email.' : 'Plata a fost trimisă; confirmăm înscrierea…'}
          {' '}<button className="link" onClick={() => setParams({}, { replace: true })}>Închide</button>
        </p>
      )}
      {payment === 'anulata' && !ev.isRegistered && (
        <p className="alert" role="status">Plata a fost anulată; nu s-a încasat nimic. {ev.checkout ? 'Locul îți rămâne rezervat câteva minute.' : ''}</p>
      )}

      <div className="panel">
        <strong>{ev.status === 'PAST' ? 'Eveniment încheiat' : ev.status === 'ONGOING' ? 'În desfășurare' : seatsLabel(ev)}</strong>
        {ev.price && <p className="price">{ev.price.label}<span className="muted"> / bilet</span></p>}
        {ev.onlineUrl && (
          <p>Link pentru participare online: <a href={ev.onlineUrl} target="_blank" rel="noopener noreferrer">{ev.onlineUrl}</a></p>
        )}
        {!ev.onlineUrl && ev.hasOnlineLink && ev.status !== 'PAST' && (
          <p className="muted">Online · linkul se afișează după înscriere.</p>
        )}
        {!user && ev.status !== 'PAST' && (
          <p>Pentru a te înscrie, <Link to="/login">autentifică-te</Link> sau <Link to="/register">creează un cont</Link>.</p>
        )}
        {user?.role === 'ORGANIZER' && !ev.isOwner && ev.status !== 'PAST' && (
          <p className="muted">Conturile de organizator nu se pot înscrie la evenimente.</p>
        )}
        {ev.canRegister && <button className="btn" onClick={() => act('POST')} disabled={busy}>Înscrie-te</button>}
        {ev.canBuy && <button className="btn" onClick={buy} disabled={busy}>Cumpără bilet · {ev.price?.label}</button>}
        {ev.checkout && (
          <>
            <p>Ai început plata: locul îți este rezervat până la {new Date(ev.checkout.expiresAt).toLocaleTimeString('ro-RO', { timeStyle: 'short' })}.</p>
            <a className="btn" href={ev.checkout.url}>Continuă plata</a>
          </>
        )}
        {ev.salesClosed && <p className="muted">Vânzarea biletelor este oprită momentan.</p>}
        {ev.price && ev.status === 'FULL' && !ev.isRegistered && !ev.checkout && (
          <p className="muted">Toate biletele sunt vândute sau rezervate. Rezervările neplătite expiră în cel mult 36 de minute.</p>
        )}
        {ev.mustVerifyEmail && (
          <>
            <p>
              Mai e un pas: confirmă-ți adresa de email ca să {ev.status === 'FULL' ? 'intri pe lista de așteptare' : 'te poți înscrie'}.
              Linkul este în emailul primit la înregistrare.
            </p>
            <ResendVerificationButton className="btn ghost" />
          </>
        )}
        {ev.canCancel && <button className="btn ghost" onClick={() => act('DELETE')} disabled={busy}>Anulează înscrierea</button>}
        {ev.canJoinWaitlist && (
          <>
            <p>
              Evenimentul este plin.{' '}
              {ev.waitlistCount > 0 ? `${ev.waitlistCount} ${ev.waitlistCount === 1 ? 'persoană așteaptă' : 'persoane așteaptă'} deja. ` : ''}
              Dacă se eliberează un loc, primul de pe listă este înscris automat și primește un email.
            </p>
            <button className="btn" onClick={() => waitlistAct('POST')} disabled={busy}>Intră pe lista de așteptare</button>
          </>
        )}
        {ev.isWaitlisted && (
          <>
            <p>
              Ești pe locul <strong>{ev.waitlistPosition}</strong> din {ev.waitlistCount} pe lista de așteptare.
              {ev.waitlistPosition === 1 ? ' Primul loc eliberat este al tău.' : ''}
            </p>
            {ev.canLeaveWaitlist && (
              <button className="btn ghost" onClick={() => waitlistAct('DELETE')} disabled={busy}>Ieși de pe lista de așteptare</button>
            )}
          </>
        )}
        {ev.canEdit && <Link className="btn" to={`/organizator/${ev.id}/editare`}>Editează evenimentul</Link>}
        {ev.checkIn?.canScan && <Link className="btn ghost" to="/check-in">Validează bilete</Link>}
      </div>

      {ev.map && (
        <div className="panel place">
          <strong>Unde</strong>
          <p className="muted">{ev.location}</p>
          <Suspense fallback={<div className="event-map" />}>
            <EventMap lat={ev.map.lat} lng={ev.map.lng} label={ev.location} />
          </Suspense>
          <div className="actions">
            <a className="btn ghost" href={ev.map.directionsUrl} target="_blank" rel="noopener noreferrer">Indicații de orientare</a>
            <a className="btn ghost" href={ev.map.osmUrl} target="_blank" rel="noopener noreferrer">Deschide în OpenStreetMap</a>
          </div>
        </div>
      )}
      {ev.geocode && <GeocodeHint g={ev.geocode} />}

      {ev.calendar && ev.status !== 'PAST' && (
        <div className="panel calendar">
          <strong>Adaugă în calendar</strong>
          <div className="actions">
            <a className="btn ghost" href={ev.calendar.google} target="_blank" rel="noopener noreferrer">Google Calendar</a>
            <a className="btn ghost" href={`${API_URL}${ev.calendar.icsPath}`} download>Apple / Outlook (.ics)</a>
          </div>
          <p className="muted small">Fișierul .ics se deschide în aplicația de calendar a telefonului sau a calculatorului.</p>
        </div>
      )}
    </article>
  );
}

/** Pentru organizator: confirmă ce adresă a găsit harta sau explică de ce nu există hartă. */
function GeocodeHint({ g }: { g: NonNullable<EventItem['geocode']> }) {
  if (g.status === 'FOUND') return <p className="muted small">Pe hartă: {g.label}. Dacă punctul nu e cel bun, scrie adresa mai exact (stradă, număr, oraș).</p>;
  if (g.status === 'PENDING') return <p className="muted small">Căutăm adresa pe hartă; reîncarcă pagina peste câteva secunde.</p>;
  if (g.status === 'NOT_FOUND') return <p className="alert err small">Adresa nu a fost găsită pe hartă, deci participanții nu văd o hartă. Scrie strada, numărul și orașul.</p>;
  if (g.status === 'FAILED') return <p className="muted small">Serviciul de hărți nu a răspuns. Harta apare după următoarea modificare a locației.</p>;
  return null;
}
