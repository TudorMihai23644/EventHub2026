import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError, api } from '../api';
import { ENDPOINTS } from '../endpoints';
import { EventItem } from '../types';
import { FieldError, Loading, errMsg, formError, toLocalInput, useToast } from '../ui';
import { ResendVerificationButton } from './VerifyEmailPage';

const empty = { title: '', description: '', startsAt: '', location: '', capacity: '50' };

// Nicio regulă de validare aici: formularul trimite datele, iar API-ul
// validează și întoarce câte un mesaj pentru fiecare câmp greșit.
export default function EventFormPage() {
  const { id } = useParams();
  const editing = Boolean(id);
  const nav = useNavigate();
  const { notify } = useToast();
  const [f, setF] = useState(empty);
  const [loading, setLoading] = useState(editing);
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [needsVerify, setNeedsVerify] = useState(false); // organizator cu email neconfirmat

  useEffect(() => {
    if (!id) return;
    api<EventItem>(ENDPOINTS.events.one(id))
      .then((e) => setF({
        title: e.title, description: e.description, location: e.location,
        startsAt: toLocalInput(e.startsAt), capacity: String(e.capacity),
      }))
      .catch((e) => setError(errMsg(e)))
      .finally(() => setLoading(false));
  }, [id]);

  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setFields({});
    try {
      const body = {
        title: f.title,
        description: f.description,
        location: f.location,
        startsAt: f.startsAt ? new Date(f.startsAt).toISOString() : '',
        capacity: f.capacity === '' ? null : Number(f.capacity),
      };
      await api(editing ? ENDPOINTS.events.one(id as string) : ENDPOINTS.events.create, { method: editing ? 'PATCH' : 'POST', body });
      notify('ok', editing ? 'Modificările au fost salvate.' : 'Evenimentul a fost creat.');
      nav('/organizator');
    } catch (err) {
      setNeedsVerify(err instanceof ApiError && err.code === 'EMAIL_NOT_VERIFIED');
      const r = formError(err);
      setError(r.message);
      setFields(r.fields);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Loading />;
  return (
    <form className="form wide" onSubmit={submit} noValidate>
      <h1>{editing ? 'Editează evenimentul' : 'Eveniment nou'}</h1>
      {error && <p className="alert err" role="alert">{error}</p>}
      {needsVerify && <ResendVerificationButton className="btn ghost" />}
      <label>Titlu<input value={f.title} onChange={set('title')} /><FieldError error={fields.title} /></label>
      <label>Descriere<textarea rows={6} value={f.description} onChange={set('description')} /><FieldError error={fields.description} /></label>
      <div className="two">
        <label>Data și ora<input type="datetime-local" value={f.startsAt} onChange={set('startsAt')} /><FieldError error={fields.startsAt} /></label>
        <label>Capacitate maximă<input type="number" value={f.capacity} onChange={set('capacity')} /><FieldError error={fields.capacity} /></label>
      </div>
      <label>Locație<input value={f.location} onChange={set('location')} /><FieldError error={fields.location} /></label>
      <div className="actions">
        <button className="btn" disabled={busy}>{editing ? 'Salvează modificările' : 'Creează evenimentul'}</button>
        <Link className="btn ghost" to="/organizator">Renunță</Link>
      </div>
    </form>
  );
}
