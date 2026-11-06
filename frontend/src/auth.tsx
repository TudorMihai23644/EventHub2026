import { ReactNode, createContext, useContext, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Session, api, hasSession, onSessionChange, refreshSession, setSession } from './api';
import { ENDPOINTS } from './endpoints';
import { Role, User } from './types';
import { Loading } from './ui';

interface AuthCtx {
  user: User | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (data: { name: string; email: string; password: string; role: Role; inviteCode?: string }) => Promise<User>;
  logout: () => void;
  /** Recitește contul de la API (ex. după confirmarea emailului). */
  refresh: () => Promise<void>;
  /** Folosește o sesiune nouă primită de la API (ex. după schimbarea parolei). */
  adopt: (s: Session) => void;
  /** Utilizatorul s-a schimbat pe server (ex. numele): actualizează-l local. */
  setUserData: (u: User) => void;
  /** Contul a fost închis pe server (logout pe toate dispozitivele, ștergere): uită sesiunea în toate tab-urile. */
  endEverywhere: () => void;
}

const Ctx = createContext<AuthCtx>(null as unknown as AuthCtx);
export const useAuth = () => useContext(Ctx);

// Celelalte tab-uri află de autentificare / deconectare (logout într-un tab îl deconectează și pe celălalt).
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('eventhub-auth') : null;
type AuthMessage = 'login' | 'logout';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // reînnoirile automate (access token expirat) pot deconecta utilizatorul dacă sesiunea nu mai e validă
    onSessionChange((s) => setUser(s?.user ?? null));
    // La încărcarea paginii: sesiunea vine din cookie-ul httpOnly, nu din localStorage.
    // (În StrictMode efectul rulează de două ori; refreshSession împarte aceeași cerere, deci se trimite una singură.)
    refreshSession().catch(() => null).finally(() => setReady(true));

    const onMessage = (e: MessageEvent<AuthMessage>) => {
      if (e.data === 'logout') { setSession(null); setUser(null); }
      if (e.data === 'login') refreshSession().catch(() => null); // alt tab s-a autentificat: preluăm sesiunea din cookie
    };
    channel?.addEventListener('message', onMessage);
    return () => channel?.removeEventListener('message', onMessage);
  }, []);

  const start = (s: Session) => {
    setSession(s);
    setUser(s.user);
    channel?.postMessage('login' satisfies AuthMessage);
    return s.user;
  };

  const value: AuthCtx = {
    user,
    ready,
    login: async (email, password) =>
      start(await api<Session>(ENDPOINTS.auth.login, { method: 'POST', body: { email, password }, cookies: true, noRefresh: true })),
    register: async (data) =>
      start(await api<Session>(ENDPOINTS.auth.register, { method: 'POST', body: data, cookies: true, noRefresh: true })),
    logout: () => {
      // serverul revocă sesiunea și șterge cookie-ul; local uităm imediat access token-ul
      api(ENDPOINTS.auth.logout, { method: 'POST', cookies: true, noRefresh: true }).catch(() => {});
      setSession(null);
      setUser(null);
      channel?.postMessage('logout' satisfies AuthMessage);
    },
    adopt: (s) => { start(s); },
    setUserData: (u) => setUser(u),
    endEverywhere: () => {
      setSession(null);
      setUser(null);
      channel?.postMessage('logout' satisfies AuthMessage);
    },
    refresh: async () => {
      if (!hasSession()) return;
      try { setUser(await api<User>(ENDPOINTS.auth.me)); }
      catch { setSession(null); setUser(null); } // sesiune închisă (ex. parola a fost resetată)
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function RequireRole({ role, children }: { role: Role; children: JSX.Element }) {
  const { user, ready } = useAuth();
  if (!ready) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== role) return <Navigate to="/" replace />;
  return children;
}

/** Orice utilizator autentificat (ex. pagina de profil). */
export function RequireUser({ children }: { children: JSX.Element }) {
  const { user, ready } = useAuth();
  if (!ready) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}
