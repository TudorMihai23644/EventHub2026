import { readFileSync } from 'fs';
import { join } from 'path';
import { DEFAULT_API_PORT, DEFAULT_FRONTEND_PORT, appUrl, corsOrigins, listenPort, publicApiUrl } from './urls';

const root = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('porturile: aceleași valori în toate fișierele de configurare', () => {
  // Dacă cineva schimbă portul doar într-un loc, frontend-ul ar chema un API care nu e acolo (sau CORS l-ar respinge).
  it('docker-compose.yml', () => {
    const c = read('docker-compose.yml');
    expect(c).toContain(`\${API_PORT:-${DEFAULT_API_PORT}}:\${API_PORT:-${DEFAULT_API_PORT}}`);
    expect(c).toContain(`\${FRONTEND_PORT:-${DEFAULT_FRONTEND_PORT}}:80`);
    expect(c).toContain(`APP_URL: \${APP_URL:-http://localhost:\${FRONTEND_PORT:-${DEFAULT_FRONTEND_PORT}}}`);
    expect(c).toContain(`PUBLIC_API_URL: \${PUBLIC_API_URL:-http://localhost:\${API_PORT:-${DEFAULT_API_PORT}}/api}`);
  });

  it('frontend: vite.config.ts, .env.development, .env.example, Dockerfile', () => {
    expect(read('frontend/vite.config.ts')).toContain(`Number(process.env.FRONTEND_PORT) || ${DEFAULT_FRONTEND_PORT}`);
    expect(read('frontend/vite.config.ts')).toContain('strictPort: true');
    expect(read('frontend/.env.development').trim()).toBe(`VITE_API_URL=http://localhost:${DEFAULT_API_PORT}/api`);
    expect(read('frontend/.env.example')).toContain(`VITE_API_URL=http://localhost:${DEFAULT_API_PORT}/api`);
    expect(read('frontend/Dockerfile')).toContain(`ARG VITE_API_URL=http://localhost:${DEFAULT_API_PORT}/api`);
  });

  it('backend: .env.example și Dockerfile', () => {
    const env = read('backend/.env.example');
    expect(env).toContain(`PORT=${DEFAULT_API_PORT}`);
    expect(env).toContain(`APP_URL=http://localhost:${DEFAULT_FRONTEND_PORT}`);
    expect(env).toContain(`PUBLIC_API_URL=http://localhost:${DEFAULT_API_PORT}/api`);
    expect(read('backend/Dockerfile')).toContain(`EXPOSE ${DEFAULT_API_PORT}`);
  });

  it('niciun fișier de configurare nu mai folosește porturile vechi (3000 / 5173)', () => {
    for (const f of ['docker-compose.yml', 'frontend/vite.config.ts', 'frontend/.env.development', 'frontend/.env.example', 'frontend/Dockerfile', 'backend/.env.example', 'backend/Dockerfile', '.github/workflows/ci.yml']) {
      expect({ f, old: /localhost:(3000|5173)\b/.test(read(f)) }).toEqual({ f, old: false });
    }
  });
});

describe('adresele derivate', () => {
  it('implicit: frontend pe 5100, API pe 5200', () => {
    expect([appUrl({}), publicApiUrl({}), listenPort({})]).toEqual(['http://localhost:5100', 'http://localhost:5200/api', 5200]);
  });
  it('variabilele au prioritate; slash-ul final dispare; un port invalid revine la implicit', () => {
    expect(appUrl({ APP_URL: 'https://eventhub.ro/' })).toBe('https://eventhub.ro');
    expect(publicApiUrl({ PUBLIC_API_URL: 'https://api.eventhub.ro/api/' })).toBe('https://api.eventhub.ro/api');
    expect(listenPort({ PORT: '5300' })).toBe(5300);
    expect(listenPort({ PORT: 'abc' })).toBe(5200);
  });
  it('CORS: originea APP_URL + geamăna localhost / 127.0.0.1; CORS_ORIGIN explicit are prioritate', () => {
    expect(corsOrigins({})).toEqual(['http://localhost:5100', 'http://127.0.0.1:5100']);
    expect(corsOrigins({ APP_URL: 'http://127.0.0.1:5100/' })).toEqual(['http://127.0.0.1:5100', 'http://localhost:5100']);
    expect(corsOrigins({ APP_URL: 'https://eventhub.ro' })).toEqual(['https://eventhub.ro']);
    expect(corsOrigins({ CORS_ORIGIN: 'https://a.ro, https://b.ro/' })).toEqual(['https://a.ro', 'https://b.ro']);
    expect(corsOrigins({ CORS_ORIGIN: '' })).toEqual(['http://localhost:5100', 'http://127.0.0.1:5100']); // compose: gol = implicit
  });
});
