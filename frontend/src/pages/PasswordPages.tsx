import { FormEvent, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError, api } from '../api';
import { ENDPOINTS } from '../endpoints';
import { useAuth } from '../auth';
import { FieldError, formError, useToast } from '../ui';
import { useHumanCheck } from '../signin-extras';

/** /parola-uitata: cere un link de resetare. API-ul răspunde la fel indiferent dacă adresa are cont. */
export function ForgotPasswordPage() {
  const human = useHumanCheck('forgot');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setFields({});
    try {
      const res = await api<{ message: string }>(ENDPOINTS.auth.forgotPassword, { method: 'POST', body: { email }, headers: human.headers });
      setDone(res.message);
    } catch (err) {
      const r = formError(err);
      setError(r.message);
      setFields(r.fields);
      human.reset();
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="form">
        <h1>Verifică-ți emailul</h1>
        <p className="alert ok" role="status">{done}</p>
        <p className="muted">Linkul este valabil 30 de minute. Nu ai primit nimic? Verifică și folderul Spam, apoi poți cere din nou.</p>
        <Link to="/login">Înapoi la autentificare</Link>
      </div>
    );
  }
  return (
    <form className="form" onSubmit={submit} noValidate>
      <h1>Ai uitat parola?</h1>
      <p className="muted">Introdu adresa contului și îți trimitem un link pentru a alege o parolă nouă.</p>
      {error && <p className="alert err" role="alert">{error}</p>}
      <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /><FieldError error={fields.email} /></label>
      {human.element}
      <button className="btn" disabled={busy || human.waiting}>Trimite linkul</button>
      <p className="muted"><Link to="/login">Înapoi la autentificare</Link></p>
    </form>
  );
}

/** /resetare-parola?token=… : linkul din emailul de resetare. */
export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const [token] = useState(() => params.get('token') ?? '');
  const { user, logout } = useAuth();
  const { notify } = useToast();
  const nav = useNavigate();
  const location = useLocation();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [linkInvalid, setLinkInvalid] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  // token-ul nu rămâne în bara de adrese / istoricul browserului
  useEffect(() => { nav(location.pathname, { replace: true }); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setFields({});
    // Confort în interfață, nu regulă de business: API-ul primește o singură parolă.
    if (password !== confirm) {
      setFields({ confirm: 'Parolele nu coincid.' });
      return;
    }
    setBusy(true);
    try {
      const res = await api<{ message: string }>(ENDPOINTS.auth.resetPassword, { method: 'POST', body: { token, password } });
      if (user) logout(); // sesiunea de pe acest dispozitiv a fost închisă de resetare
      notify('ok', res.message);
      nav('/login');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'TOKEN_INVALID') setLinkInvalid(true);
      const r = formError(err);
      setError(r.message);
      setFields(r.fields);
    } finally {
      setBusy(false);
    }
  }

  if (!token || linkInvalid) {
    return (
      <div className="form">
        <h1>Link nevalabil</h1>
        <p className="alert err" role="alert">{error || 'Linkul de resetare nu este complet. Deschide-l din nou din email.'}</p>
        <Link className="btn" to="/parola-uitata">Cere un link nou</Link>
      </div>
    );
  }
  return (
    <form className="form" onSubmit={submit} noValidate>
      <h1>Alege o parolă nouă</h1>
      {error && <p className="alert err" role="alert">{error}</p>}
      <label>Parola nouă (minimum 8 caractere)<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" /><FieldError error={fields.password} /></label>
      <label>Repetă parola<input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" /><FieldError error={fields.confirm} /></label>
      <button className="btn" disabled={busy}>Salvează parola</button>
      <p className="muted">După salvare, toate sesiunile deschise ale contului se închid.</p>
    </form>
  );
}
