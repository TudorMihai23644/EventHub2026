import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError, api } from '../api';
import { ENDPOINTS } from '../endpoints';
import { useAuth } from '../auth';
import { Loading, errMsg, useToast } from '../ui';

/** Buton „Retrimite emailul de confirmare”. Folosit în banner, pe pagina de confirmare și la erorile EMAIL_NOT_VERIFIED. */
export function ResendVerificationButton({ className = 'link' }: { className?: string }) {
  const { refresh } = useAuth();
  const { notify } = useToast();
  const [busy, setBusy] = useState(false);
  async function resend() {
    setBusy(true);
    try {
      const res = await api<{ message: string }>(ENDPOINTS.auth.resendVerification, { method: 'POST' });
      notify('ok', res.message);
    } catch (e) {
      notify('err', errMsg(e));
      if (e instanceof ApiError && e.status === 400) await refresh(); // deja confirmată (ex. din alt tab)
    } finally {
      setBusy(false);
    }
  }
  return (
    <button type="button" className={className} onClick={resend} disabled={busy}>
      {busy ? 'Se trimite…' : 'Retrimite emailul de confirmare'}
    </button>
  );
}

/** Banda de sub antet, cât timp adresa nu este confirmată. */
export function VerifyBanner() {
  const { user } = useAuth();
  if (!user || user.emailVerified) return null;
  const what = user.role === 'ORGANIZER' ? 'să poți crea evenimente' : 'să te poți înscrie la evenimente';
  return (
    <div className="verify-banner" role="status">
      <p>
        Confirmă-ți adresa de email (<strong>{user.email}</strong>) ca {what}. Linkul este în emailul primit la înregistrare.
      </p>
      <ResendVerificationButton />
    </div>
  );
}

/** /confirmare-email?token=… : linkul din emailul de confirmare. */
export default function VerifyEmailPage() {
  const [params] = useSearchParams();
  const [token] = useState(() => params.get('token') ?? '');
  const { user, refresh } = useAuth();
  const nav = useNavigate();
  const location = useLocation();
  const [state, setState] = useState<{ status: 'loading' | 'ok' | 'error'; message: string }>({ status: 'loading', message: '' });
  // În dezvoltare, React StrictMode rulează efectele de două ori. Linkul se poate folosi o singură dată,
  // deci a doua cerere ar raporta „link invalid” după ce prima a reușit. Trimitem o singură dată.
  const sent = useRef(false);

  useEffect(() => {
    nav(location.pathname, { replace: true }); // token-ul nu rămâne în bara de adrese / istoric
    if (sent.current) return;
    sent.current = true;
    if (!token) {
      setState({ status: 'error', message: 'Linkul de confirmare nu este complet. Deschide-l din nou din email.' });
      return;
    }
    api<{ message: string }>(ENDPOINTS.auth.verifyEmail, { method: 'POST', body: { token } })
      .then(async (res) => {
        setState({ status: 'ok', message: res.message });
        await refresh();
      })
      .catch((e) => setState({ status: 'error', message: errMsg(e) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state.status === 'loading') return <Loading />;
  return (
    <div className="form">
      <h1>{state.status === 'ok' ? 'Adresă confirmată' : 'Confirmarea nu a reușit'}</h1>
      <p className={`alert ${state.status === 'ok' ? 'ok' : 'err'}`} role="status">{state.message}</p>
      {state.status === 'ok' ? (
        <Link className="btn" to="/">Vezi evenimentele</Link>
      ) : user && !user.emailVerified ? (
        <ResendVerificationButton className="btn" />
      ) : !user ? (
        <p className="muted">Autentifică-te, apoi cere un link nou din banda de sus. <Link to="/login">Autentificare</Link></p>
      ) : (
        <Link className="btn" to="/">Vezi evenimentele</Link>
      )}
    </div>
  );
}
