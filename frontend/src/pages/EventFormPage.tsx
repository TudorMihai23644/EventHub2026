import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError, api, assetUrl } from '../api';
import { ENDPOINTS } from '../endpoints';
import { EventFormat, EventItem } from '../types';
import { FieldError, Loading, errMsg, formError, toLocalInput, useEventOptions, useToast } from '../ui';
import { ResendVerificationButton } from './VerifyEmailPage';

const empty = {
  title: '', description: '', startsAt: '', endsAt: '', location: '', capacity: '50',
  category: '', format: 'PHYSICAL' as EventFormat, onlineUrl: '',
};

// Nicio regulă de validare aici: formularul trimite datele, iar API-ul
// validează și întoarce câte un mesaj pentru fiecare câmp greșit (inclusiv regulile pe format).
export default function EventFormPage() {
  const { id } = useParams();
  const editing = Boolean(id);
  const nav = useNavigate();
  const { notify } = useToast();
  const options = useEventOptions();
  const [f, setF] = useState(empty);
  const [loading, setLoading] = useState(editing);
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [needsVerify, setNeedsVerify] = useState(false); // organizator cu email neconfirmat
  // imaginea de copertă: cea salvată, fișierul ales acum (cu previzualizare) și „elimină”
  const [savedCover, setSavedCover] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [removeCover, setRemoveCover] = useState(false);
  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (!id) return;
    api<EventItem>(ENDPOINTS.events.one(id))
      .then((e) => {
        setF({
          title: e.title, description: e.description, startsAt: toLocalInput(e.startsAt), endsAt: e.endsAt ? toLocalInput(e.endsAt) : '',
          capacity: String(e.capacity), category: e.category, format: e.format,
          location: e.format === 'ONLINE' ? '' : e.location, onlineUrl: e.onlineUrl ?? '',
        });
        setSavedCover(e.cover ? assetUrl(e.cover.small) : null);
      })
      .catch((e) => setError(errMsg(e)))
      .finally(() => setLoading(false));
  }, [id]);

  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const online = f.format === 'ONLINE' || f.format === 'HYBRID';
  const physical = f.format !== 'ONLINE';

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setFields({});
    try {
      const body = {
        title: f.title,
        description: f.description,
        startsAt: f.startsAt ? new Date(f.startsAt).toISOString() : '',
        endsAt: f.endsAt ? new Date(f.endsAt).toISOString() : null, // gol = fără oră de sfârșit
        capacity: f.capacity === '' ? null : Number(f.capacity),
        category: f.category || null,
        format: f.format,
        // câmpurile care nu se aplică formatului ales nu se trimit; API-ul decide ce e obligatoriu
        ...(physical ? { location: f.location } : {}),
        ...(online ? { onlineUrl: f.onlineUrl.trim() || null } : {}),
      };
      const saved = await api<EventItem>(editing ? ENDPOINTS.events.one(id as string) : ENDPOINTS.events.create, { method: editing ? 'PATCH' : 'POST', body });
      // imaginea, după ce evenimentul există (la creare abia acum avem id-ul)
      try {
        if (file) {
          const form = new FormData();
          form.append('file', file);
          await api(ENDPOINTS.events.cover(saved.id), { method: 'POST', body: form });
        } else if (removeCover) {
          await api(ENDPOINTS.events.cover(saved.id), { method: 'DELETE' });
        }
      } catch (err) {
        // evenimentul e salvat; doar imaginea nu: rămânem în formularul de editare, cu mesajul API-ului
        notify('err', `Evenimentul a fost salvat, dar imaginea nu: ${errMsg(err)}`);
        nav(`/organizator/${saved.id}/editare`, { replace: true });
        return;
      }
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

  if (loading || !options) return <Loading />;
  return (
    <form className="form wide" onSubmit={submit} noValidate>
      <h1>{editing ? 'Editează evenimentul' : 'Eveniment nou'}</h1>
      {error && <p className="alert err" role="alert">{error}</p>}
      {needsVerify && <ResendVerificationButton className="btn ghost" />}
      <label>Titlu<input value={f.title} onChange={set('title')} /><FieldError error={fields.title} /></label>
      <label>Descriere<textarea rows={6} value={f.description} onChange={set('description')} /><FieldError error={fields.description} /></label>
      <div className="two">
        <label>Categorie
          <select value={f.category} onChange={set('category')}>
            <option value="">Alege…</option>
            {options.categories.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          <FieldError error={fields.category} />
        </label>
        <label>Capacitate maximă<input type="number" value={f.capacity} onChange={set('capacity')} /><FieldError error={fields.capacity} /></label>
      </div>
      <div className="two">
        <label>Începe<input type="datetime-local" value={f.startsAt} onChange={set('startsAt')} /><FieldError error={fields.startsAt} /></label>
        <label>Se termină (opțional)<input type="datetime-local" value={f.endsAt} onChange={set('endsAt')} /><FieldError error={fields.endsAt} /></label>
      </div>
      <fieldset>
        <legend>Unde are loc</legend>
        {options.formats.map((o) => (
          <label key={o.value} className="check">
            <input type="radio" name="format" checked={f.format === o.value} onChange={() => setF({ ...f, format: o.value })} />
            {o.label}
          </label>
        ))}
        <FieldError error={fields.format} />
      </fieldset>
      {physical && <label>Locație<input value={f.location} onChange={set('location')} /><FieldError error={fields.location} /></label>}
      {online && (
        <label>Link pentru participare online (https://…)
          <input type="url" value={f.onlineUrl} onChange={set('onlineUrl')} placeholder="https://meet.example.ro/…" />
          <span className="muted small">Îl văd doar participanții înscriși; apare în emailurile lor de confirmare și memento.</span>
          <FieldError error={fields.onlineUrl} />
        </label>
      )}
      <div className="cover-field">
        <span className="cover-label">Imagine de copertă (opțional)</span>
        {(preview || (savedCover && !removeCover)) && (
          <img className="cover-preview" src={preview ?? savedCover!} alt="Previzualizarea imaginii de copertă" />
        )}
        <label className="btn ghost file-btn">
          {preview || (savedCover && !removeCover) ? 'Alege altă imagine' : 'Alege o imagine'}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => { setFile(e.target.files?.[0] ?? null); setRemoveCover(false); }}
          />
        </label>
        {(file || (savedCover && !removeCover)) && (
          <button type="button" className="link" onClick={() => { setFile(null); setRemoveCover(Boolean(savedCover)); }}>
            Elimină imaginea
          </button>
        )}
        <span className="muted small">JPEG, PNG sau WebP, cel mult 5 MB. Se decupează la 16:9; datele din fișier (ex. locația GPS) se elimină.</span>
        <FieldError error={fields.cover} />
      </div>
      <div className="actions">
        <button className="btn" disabled={busy}>{editing ? 'Salvează modificările' : 'Creează evenimentul'}</button>
        <Link className="btn ghost" to="/organizator">Renunță</Link>
      </div>
    </form>
  );
}
