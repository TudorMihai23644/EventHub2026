import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Session, api } from '../api';
import { ENDPOINTS } from '../endpoints';
import { useAuth } from '../auth';
import { User } from '../types';
import { FieldError, formError, useToast } from '../ui';

type Fields = Record<string, string>;

/** /cont: profilul utilizatorului autentificat. */
export default function ProfilePage() {
  const { user } = useAuth();
  if (!user) return null;
  return (
    <div className="stack">
      <h1>Contul meu</h1>
      <p className="muted">{user.email} · {user.role === 'ORGANIZER' ? 'Organizator' : 'Participant'}</p>
      <NameForm user={user} />
      <PasswordForm />
      <SessionsBox />
      <DeleteAccount role={user.role} />
    </div>
  );
}

function NameForm({ user }: { user: User }) {
  const { setUserData } = useAuth();
  const { notify } = useToast();
  const [name, setName] = useState(user.name);
  const [fields, setFields] = useState<Fields>({});
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFields({});
    try {
      setUserData(await api<User>(ENDPOINTS.account.profile, { method: 'PATCH', body: { name } }));
      notify('ok', 'Numele a fost salvat.');
    } catch (err) {
      const r = formError(err);
      setFields(r.fields);
      if (!Object.keys(r.fields).length) notify('err', r.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="form card" onSubmit={submit} noValidate>
      <h2>Nume</h2>
      <label>Numele afișat<input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /><FieldError error={fields.name} /></label>
      <button className="btn" disabled={busy || name.trim() === user.name}>Salvează</button>
    </form>
  );
}

function PasswordForm() {
  const { adopt } = useAuth();
  const { notify } = useToast();
  const [f, setF] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [fields, setFields] = useState<Fields>({});
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  async function submit(e: FormEvent) {
    e.preventDefault();
    setFields({});
    if (f.newPassword !== f.confirm) { setFields({ confirm: 'Parolele nu coincid.' }); return; } // confort în interfață
    setBusy(true);
    try {
      const res = await api<Session & { message: string }>(ENDPOINTS.account.password, {
        method: 'POST', body: { currentPassword: f.currentPassword, newPassword: f.newPassword }, cookies: true,
      });
      adopt(res); // sesiune nouă pentru acest dispozitiv; celelalte au fost închise
      setF({ currentPassword: '', newPassword: '', confirm: '' });
      notify('ok', res.message);
    } catch (err) {
      const r = formError(err);
      setFields(r.fields);
      if (!Object.keys(r.fields).length) notify('err', r.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="form card" onSubmit={submit} noValidate>
      <h2>Parolă</h2>
      <label>Parola curentă<input type="password" value={f.currentPassword} onChange={set('currentPassword')} autoComplete="current-password" /><FieldError error={fields.currentPassword} /></label>
      <label>Parola nouă (minimum 8 caractere)<input type="password" value={f.newPassword} onChange={set('newPassword')} autoComplete="new-password" /><FieldError error={fields.newPassword} /></label>
      <label>Repetă parola nouă<input type="password" value={f.confirm} onChange={set('confirm')} autoComplete="new-password" /><FieldError error={fields.confirm} /></label>
      <button className="btn" disabled={busy}>Schimbă parola</button>
      <p className="muted small">Celelalte dispozitive vor fi deconectate; acesta rămâne autentificat.</p>
    </form>
  );
}

function SessionsBox() {
  const { endEverywhere } = useAuth();
  const { notify } = useToast();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  async function logoutAll() {
    if (!window.confirm('Te deconectezi de pe toate dispozitivele, inclusiv de pe acesta?')) return;
    setBusy(true);
    try {
      await api(ENDPOINTS.auth.logoutAll, { method: 'POST', cookies: true });
      endEverywhere();
      notify('ok', 'Te-ai deconectat de pe toate dispozitivele.');
      nav('/login');
    } catch (err) {
      notify('err', formError(err).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card">
      <h2>Sesiuni</h2>
      <p className="muted">Ai uitat contul deschis pe alt calculator sau telefon? Închide toate sesiunile dintr-un singur loc.</p>
      <button className="btn ghost" onClick={logoutAll} disabled={busy}>Deconectează-mă de pe toate dispozitivele</button>
    </section>
  );
}

function DeleteAccount({ role }: { role: User['role'] }) {
  const { endEverywhere } = useAuth();
  const { notify } = useToast();
  const nav = useNavigate();
  const [password, setPassword] = useState('');
  const [sure, setSure] = useState(false);
  const [fields, setFields] = useState<Fields>({});
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFields({});
    try {
      await api(ENDPOINTS.account.profile, { method: 'DELETE', body: { password }, cookies: true });
      endEverywhere();
      notify('ok', 'Contul a fost șters.');
      nav('/');
    } catch (err) {
      const r = formError(err);
      setFields(r.fields);
      if (!Object.keys(r.fields).length) notify('err', r.message);
    } finally {
      setBusy(false);
    }
  }
  const consequence = role === 'ORGANIZER'
    ? 'Toate evenimentele tale se șterg; participanții la cele viitoare primesc un email că evenimentul a fost anulat.'
    : 'Înscrierile tale la evenimentele viitoare se anulează (locurile ajung la cei de pe lista de așteptare) și ieși de pe listele de așteptare.';
  return (
    <form className="form card danger-zone" onSubmit={submit} noValidate>
      <h2>Șterge contul</h2>
      <p className="muted">{consequence} Ștergerea nu poate fi anulată.</p>
      <label>Parola contului<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /><FieldError error={fields.password} /></label>
      <label className="check"><input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} />Înțeleg că ștergerea este definitivă</label>
      <button className="btn danger" disabled={busy || !sure || !password}>Șterge contul definitiv</button>
    </form>
  );
}
