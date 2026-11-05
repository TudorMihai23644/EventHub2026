import { ReactNode, createContext, useContext, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api, tokenStore } from './api';
import { ENDPOINTS } from './endpoints';
import { Role, User } from './types';
import { Loading } from './ui';

interface Session { accessToken: string; user: User }
interface AuthCtx {
  user: User | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (data: { name: string; email: string; password: string; role: Role; inviteCode?: string }) => Promise<User>;
  logout: () => void;
  /** Recitește contul de la API (ex. după confirmarea emailului). */
  refresh: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>(null as unknown as AuthCtx);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!tokenStore.get()) { setReady(true); return; }
    api<User>(ENDPOINTS.auth.me)
      .then(setUser)
      .catch(() => tokenStore.clear())
      .finally(() => setReady(true));
  }, []);

  const start = (s: Session) => { tokenStore.set(s.accessToken); setUser(s.user); return s.user; };

  const value: AuthCtx = {
    user,
    ready,
    login: async (email, password) => start(await api<Session>(ENDPOINTS.auth.login, { method: 'POST', body: { email, password } })),
    register: async (data) => start(await api<Session>(ENDPOINTS.auth.register, { method: 'POST', body: data })),
    logout: () => {
      api(ENDPOINTS.auth.logout, { method: 'POST' }).catch(() => {}); // cererea pornește cu token-ul încă setat
      tokenStore.clear();
      setUser(null);
    },
    refresh: async () => {
      if (!tokenStore.get()) return;
      try { setUser(await api<User>(ENDPOINTS.auth.me)); }
      catch { tokenStore.clear(); setUser(null); } // sesiune închisă (ex. parola a fost resetată)
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
