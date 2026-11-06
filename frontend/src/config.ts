// Singura sursă pentru adresa API-ului. Se setează în frontend/.env (VITE_API_URL).
const raw = import.meta.env.VITE_API_URL as string | undefined;

if (!raw) {
  throw new Error('VITE_API_URL nu este setat. Adaugă-l în frontend/.env, de exemplu VITE_API_URL=http://localhost:3000/api');
}

export const API_URL = raw.replace(/\/+$/, '');

// Plăcile hărții. Implicit OpenStreetMap: potrivit pentru trafic mic; pentru producție cu trafic mare, un furnizor
// de plăci (MapTiler, Stadia, Carto...) prin VITE_MAP_TILES_URL și VITE_MAP_ATTRIBUTION. Vezi README, „Harta”.
export const MAP_TILES_URL = (import.meta.env.VITE_MAP_TILES_URL as string | undefined) || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const MAP_ATTRIBUTION = (import.meta.env.VITE_MAP_ATTRIBUTION as string | undefined)
  || '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>';
