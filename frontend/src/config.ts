// Singura sursă pentru adresa API-ului. Se setează în frontend/.env (VITE_API_URL).
const raw = import.meta.env.VITE_API_URL as string | undefined;

if (!raw) {
  throw new Error('VITE_API_URL nu este setat. Adaugă-l în frontend/.env, de exemplu VITE_API_URL=http://localhost:3000/api');
}

export const API_URL = raw.replace(/\/+$/, '');
