import { ReactNode, createContext, useCallback, useContext, useEffect, useState } from 'react';
import { ApiError, api } from './api';
import { ENDPOINTS } from './endpoints';
import { EventItem, EventOptions } from './types';

type Kind = 'ok' | 'err';
interface ToastItem { id: number; kind: Kind; text: string }

const ToastCtx = createContext<{ notify: (kind: Kind, text: string) => void }>({ notify: () => {} });
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const notify = useCallback((kind: Kind, text: string) => {
    const id = Date.now() + Math.random();
    setItems((i) => [...i, { id, kind, text }]);
    setTimeout(() => setItems((i) => i.filter((t) => t.id !== id)), 5000);
  }, []);
  return (
    <ToastCtx.Provider value={{ notify }}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'A apărut o eroare.');

// Erorile de validare vin de la API sub forma { câmp: mesaj }.
export function formError(e: unknown): { message: string; fields: Record<string, string> } {
  if (e instanceof ApiError && Object.keys(e.fields).length) {
    return { message: 'Corectează câmpurile marcate.', fields: e.fields };
  }
  return { message: errMsg(e), fields: {} };
}

export function FieldError({ error }: { error?: string }) {
  return error ? <span className="field-err" role="alert">{error}</span> : null;
}

export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString('ro-RO', { dateStyle: 'long', timeStyle: 'short' });

/** „1 decembrie 2026, 19:00–21:30” (aceeași zi) sau „1 decembrie 2026, 19:00 – 3 decembrie 2026, 18:00”. */
export function fmtWhen(startIso: string, endIso?: string | null) {
  if (!endIso) return fmtDate(startIso);
  const [s, e] = [new Date(startIso), new Date(endIso)];
  return s.toDateString() === e.toDateString()
    ? `${fmtDate(startIso)}–${e.toLocaleTimeString('ro-RO', { timeStyle: 'short' })}`
    : `${fmtDate(startIso)} – ${fmtDate(endIso)}`;
}

let optionsCache: Promise<EventOptions> | null = null;
/** Categoriile și formatele vin de la API o singură dată pe sesiune. */
export function useEventOptions(): EventOptions | null {
  const [options, setOptions] = useState<EventOptions | null>(null);
  useEffect(() => {
    optionsCache ??= api<EventOptions>(ENDPOINTS.events.categories).catch((e) => { optionsCache = null; throw e; });
    optionsCache.then(setOptions).catch(() => setOptions({ categories: [], formats: [] }));
  }, []);
  return options;
}

export const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

export function DateTile({ iso }: { iso: string }) {
  const d = new Date(iso);
  return (
    <div className="tile" aria-hidden="true">
      <span className="tile-day">{d.getDate()}</span>
      <span className="tile-month">{d.toLocaleDateString('ro-RO', { month: 'short' }).replace('.', '')}</span>
    </div>
  );
}

export function seatsLabel(e: Pick<EventItem, 'availableSeats' | 'capacity'> & { waitlistCount?: number }) {
  if (e.availableSeats === 0) return e.waitlistCount ? `Plin · ${e.waitlistCount} în așteptare` : 'Locuri epuizate';
  return `${e.availableSeats} din ${e.capacity} locuri libere`;
}

export function Loading() {
  return <p className="muted">Se încarcă…</p>;
}
