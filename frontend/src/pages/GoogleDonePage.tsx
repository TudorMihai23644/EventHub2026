import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { refreshSession } from '../api';
import { useAuth } from '../auth';
import { Loading, useToast } from '../ui';
import { safeNext } from './AuthPages';

/**
 * Întoarcerea de la Google: serverul a pus deja cookie-ul de sesiune (httpOnly). Aici cerem access token-ul
 * cu el, exact ca la reîncărcarea paginii, apoi mergem unde voia utilizatorul.
 */
export default function GoogleDonePage() {
  const { adopt } = useAuth();
  const { notify } = useToast();
  const nav = useNavigate();
  const next = safeNext(useSearchParams()[0].get('next'));
  const [failed, setFailed] = useState(false);
  const once = useRef(false);

  useEffect(() => {
    if (once.current) return; // StrictMode: un singur refresh (altfel al doilea ar folosi un cookie deja rotit)
    once.current = true;
    refreshSession()
      .then((s) => {
        if (!s) return setFailed(true);
        adopt(s);
        notify('ok', `Bine ai venit, ${s.user.name}.`);
        nav(next ?? (s.user.role === 'ORGANIZER' ? '/organizator' : '/'), { replace: true });
      })
      .catch(() => setFailed(true));
  }, [adopt, nav, next, notify]);

  if (!failed) return <Loading />;
  return (
    <div className="form">
      <h1>Conectarea nu a reușit</h1>
      <p>Browserul nu a păstrat sesiunea (cookie-urile pot fi blocate pentru acest site).</p>
      <Link className="btn" to="/login">Înapoi la autentificare</Link>
    </div>
  );
}
