import { useState } from 'react';

export type Theme = 'light' | 'dark';
const KEY = 'eventhub-theme';

/** Tema curentă, pusă pe <html> de public/theme-init.js înainte de prima afișare. */
export const currentTheme = (): Theme => (document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark');

export function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f5f4f1' : '#050506');
  try { localStorage.setItem(KEY, theme); } catch { /* stocare indisponibilă: tema ține până la reîncărcare */ }
}

/** Butonul din antet: soare în tema întunecată (trece la deschisă), lună în cea deschisă. */
export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(currentTheme);
  const next: Theme = theme === 'dark' ? 'light' : 'dark';
  const label = next === 'light' ? 'Treci la tema deschisă' : 'Treci la tema întunecată';
  return (
    <button type="button" className="theme-toggle" aria-label={label} title={label}
      onClick={() => { applyTheme(next); setTheme(next); }}>
      {theme === 'dark' ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4.2" />
          <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
          <path d="M20.5 14.6A8.5 8.5 0 0 1 9.4 3.5a8.5 8.5 0 1 0 11.1 11.1Z" />
        </svg>
      )}
    </button>
  );
}
