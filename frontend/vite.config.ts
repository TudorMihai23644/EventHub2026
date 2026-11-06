import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Portul frontend-ului: 5100, sau FRONTEND_PORT (aceeași variabilă ca în docker-compose.yml). API-ul e pe 5200; adresa lui
// vine din VITE_API_URL (.env.development). backend/src/common/urls.spec.ts verifică că valorile implicite nu s-au despărțit.
const port = Number(process.env.FRONTEND_PORT) || 5100;

export default defineConfig({
  plugins: [react()],
  // strictPort: dacă portul e ocupat (ex. frontend-ul nginx din `docker compose --profile web`), Vite se oprește cu eroare
  // în loc să treacă pe alt port, unde API-ul ar respinge cererile (CORS acceptă doar APP_URL)
  server: { port, strictPort: true },
  preview: { port, strictPort: true },
  // teste: componente în jsdom; VITE_API_URL fix, ca config.ts să nu ceară .env
  test: { environment: 'jsdom', env: { VITE_API_URL: 'http://api.test/api' }, restoreMocks: true },
});
