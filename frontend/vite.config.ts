import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // strictPort: dacă 5173 e ocupat (ex. containerul frontend din Docker), Vite se oprește cu eroare în loc să treacă pe
  // 5174, unde API-ul ar respinge cererile (CORS permite doar APP_URL, implicit http://localhost:5173)
  server: { port: 5173, strictPort: true },
  // teste: componente în jsdom; VITE_API_URL fix, ca config.ts să nu ceară .env
  test: { environment: 'jsdom', env: { VITE_API_URL: 'http://api.test/api' }, restoreMocks: true },
});
