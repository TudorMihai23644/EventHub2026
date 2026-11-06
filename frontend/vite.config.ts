import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  // teste: componente în jsdom; VITE_API_URL fix, ca config.ts să nu ceară .env
  test: { environment: 'jsdom', env: { VITE_API_URL: 'http://api.test/api' }, restoreMocks: true },
});
