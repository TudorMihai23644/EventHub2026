import { FormEvent, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth';
import { Role } from '../types';
import { FieldError, formError, useToast } from '../ui';

/// Validarea se face în API; formularele afișează mesajele primite, câmp cu câmp.

/** Doar căi din aplicație („/…”); „//evil.ro” sau „https://…” ar trimite utilizatorul pe alt site după autentificare. */
export function safeNext(next: string | null): string | null {
  return next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : null;
}

export function LoginPage() {
  const { login } = useAuth();
  const { notify } = useToast();
  const nav = useNavigate();
  const next = safeNext(useSearchParams()[0].get('next'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setFields({});
    try {
      const u = await login(email, password);
      notify('ok', `Bine ai revenit, ${u.name}.`);
      nav(next ?? (u.role === 'ORGANIZER' ? '/organizator' : '/'), { replace: !!next });
    } catch (err) {
      const r = formError(err);
      setError(r.message);
      setFields(r.fields);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={submit} noValidate>
      <h1>Autentificare</h1>
      {error && <p className="alert err" role="alert">{error}</p>}
      <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /><FieldError error={fields.email} /></label>
      <label>Parolă<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /><FieldError error={fields.password} /></label>
      <p className="small"><Link to="/parola-uitata">Ai uitat parola?</Link></p>
      <button className="btn" disabled={busy}>Autentifică-te</button>
      <p className="muted">Nu ai cont? <Link to="/register">Creează unul</Link></p>
    </form>
  );
}

export function RegisterPage() {
  const { register } = useAuth();
  const { notify } = useToast();
  const nav = useNavigate();
  const [f, setF] = useState({ name: '', email: '', password: '', role: 'PARTICIPANT' as Role, inviteCode: '' });
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setFields({});
    try {
      const u = await register({
        name: f.name, email: f.email, password: f.password, role: f.role,
        inviteCode: f.role === 'ORGANIZER' ? f.inviteCode : undefined,
      });
      notify('ok', `Contul a fost creat. Ți-am trimis un email de confirmare la ${u.email}.`);
      nav(u.role === 'ORGANIZER' ? '/organizator' : '/');
    } catch (err) {
      const r = formError(err);
      setError(r.message);
      setFields(r.fields);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={submit} noValidate>
      <h1>Creează cont</h1>
      {error && <p className="alert err" role="alert">{error}</p>}
      <label>Nume<input value={f.name} onChange={set('name')} autoComplete="name" /><FieldError error={fields.name} /></label>
      <label>Email<input type="email" value={f.email} onChange={set('email')} autoComplete="email" /><FieldError error={fields.email} /></label>
      <label>Parolă (minimum 8 caractere)<input type="password" value={f.password} onChange={set('password')} autoComplete="new-password" /><FieldError error={fields.password} /></label>
      <fieldset>
        <legend>Tipul contului</legend>
        <label className="check"><input type="radio" name="role" checked={f.role === 'PARTICIPANT'} onChange={() => setF({ ...f, role: 'PARTICIPANT' })} />Participant: mă înscriu la evenimente</label>
        <label className="check"><input type="radio" name="role" checked={f.role === 'ORGANIZER'} onChange={() => setF({ ...f, role: 'ORGANIZER' })} />Organizator: creez și administrez evenimente (doar pe bază de invitație)</label>
        <FieldError error={fields.role} />
      </fieldset>
      {f.role === 'ORGANIZER' && (
        <label>Cod de invitație<input value={f.inviteCode} onChange={set('inviteCode')} autoComplete="off" /><FieldError error={fields.inviteCode} /></label>
      )}
      <button className="btn" disabled={busy}>Creează cont</button>
      <p className="muted">Ai deja cont? <Link to="/login">Autentifică-te</Link></p>
    </form>
  );
}
