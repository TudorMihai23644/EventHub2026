import { FormEvent, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { ENDPOINTS } from '../endpoints';
import { useAuth } from '../auth';
import { CheckInResponse } from '../types';
import { Loading, errMsg } from '../ui';

const time = (iso: string) => new Date(iso).toLocaleTimeString('ro-RO', { timeStyle: 'short' });

type Outcome = { ok: CheckInResponse } | { error: string };

/**
 * Validarea biletelor la intrare. Organizatorul scanează QR-ul cu camera telefonului: linkul deschide
 * /check-in/COD, iar pagina validează imediat. Codul se poate și tasta (bilet tipărit, ecran crăpat).
 */
export default function CheckInPage() {
  const { code } = useParams();
  const { user, ready } = useAuth();
  const location = useLocation();
  const nav = useNavigate();
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [busy, setBusy] = useState(false);
  const [typed, setTyped] = useState('');
  // StrictMode rulează efectele de două ori în dezvoltare; serverul e oricum idempotent, dar nu trimitem de două ori.
  const sent = useRef<string | null>(null);

  async function check(c: string) {
    setBusy(true);
    try {
      setOutcome({ ok: await api<CheckInResponse>(ENDPOINTS.checkIn, { method: 'POST', body: { code: c } }) });
    } catch (err) {
      setOutcome({ error: errMsg(err) });
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!code || user?.role !== 'ORGANIZER' || sent.current === code) return;
    sent.current = code;
    setOutcome(null);
    check(code);
  }, [code, user]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const c = typed.trim();
    if (!c) return;
    setTyped('');
    if (c === code) { sent.current = null; check(c); } else nav(`/check-in/${encodeURIComponent(c)}`);
  }

  if (!ready) return <Loading />;

  if (!user) {
    return (
      <section className="checkin">
        <h1>Validare bilet</h1>
        <p>Biletele se validează de organizatorul evenimentului.</p>
        <Link className="btn" to={`/login?next=${encodeURIComponent(location.pathname)}`}>Autentifică-te ca organizator</Link>
      </section>
    );
  }
  if (user.role !== 'ORGANIZER') {
    return (
      <section className="checkin">
        <h1>Acesta este un bilet</h1>
        <p>Arată codul QR organizatorului la intrare; el îl scanează și te validează.</p>
        <Link to="/inscrierile-mele">Înscrierile mele</Link>
      </section>
    );
  }

  return (
    <section className="checkin">
      <h1>Validare bilete</h1>
      <div className="checkin-result" aria-live="assertive">
        {busy && <p className="muted">Se verifică…</p>}
        {!busy && outcome && 'ok' in outcome && (
          <div className={`verdict ${outcome.ok.result === 'CHECKED_IN' ? 'good' : 'warn'}`}>
            <span className="verdict-mark" aria-hidden="true">{outcome.ok.result === 'CHECKED_IN' ? '✓' : '!'}</span>
            <div>
              <strong>{outcome.ok.result === 'CHECKED_IN' ? 'Bilet valid' : `Deja validat la ${time(outcome.ok.checkedInAt)}`}</strong>
              <p className="verdict-name">{outcome.ok.participant.name}</p>
              <p className="muted small">{outcome.ok.event.title} · {outcome.ok.ticket}</p>
            </div>
          </div>
        )}
        {!busy && outcome && 'error' in outcome && (
          <div className="verdict bad">
            <span className="verdict-mark" aria-hidden="true">×</span>
            <div><strong>Nu intră</strong><p>{outcome.error}</p></div>
          </div>
        )}
        {!outcome && !busy && <p className="muted">Scanează codul QR al participantului cu camera telefonului sau tastează codul de pe bilet.</p>}
      </div>
      <form className="checkin-form" onSubmit={submit}>
        <label>
          Cod bilet
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="7KQ2M-9XH4T" autoCapitalize="characters" autoComplete="off" spellCheck={false} />
        </label>
        <button className="btn" disabled={busy}>Validează</button>
      </form>
    </section>
  );
}
