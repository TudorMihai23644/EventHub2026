import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { ENDPOINTS } from '../endpoints';
import { useAuth } from '../auth';
import { EventItem } from '../types';
import { DateTile, Loading, errMsg, fmtWhen, seatsLabel, useToast } from '../ui';
import { ResendVerificationButton } from './VerifyEmailPage';
import { API_URL } from '../config';

export default function EventDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const { notify } = useToast();
  const [ev, setEv] = useState<EventItem | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

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
      <div className="detail-head">
        <DateTile iso={ev.startsAt} />
        <div>
          <p className="small tag">{ev.categoryLabel}</p>
          <h1>{ev.title}</h1>
          <p className="muted">{fmtWhen(ev.startsAt, ev.endsAt)}, {ev.place}</p>
          {ev.organizer && <p className="muted">Organizator: {ev.organizer.name}</p>}
        </div>
      </div>

      <p className="desc">{ev.description}</p>

      <div className="panel">
        <strong>{ev.status === 'PAST' ? 'Eveniment încheiat' : ev.status === 'ONGOING' ? 'În desfășurare' : seatsLabel(ev)}</strong>
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
      </div>

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
