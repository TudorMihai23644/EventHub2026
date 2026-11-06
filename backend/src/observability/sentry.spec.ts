import { scrubEvent, sentryOptions } from './sentry';

describe('Sentry', () => {
  it('oprit fără SENTRY_DSN', () => {
    expect(sentryOptions({})).toBeNull();
    expect(sentryOptions({ SENTRY_DSN: '  ' })).toBeNull();
  });

  it('cu DSN: doar erorile implicit, nimic personal colectat', () => {
    const o = sentryOptions({ SENTRY_DSN: 'https://k@o1.ingest.sentry.io/1', NODE_ENV: 'production', SENTRY_TRACES_SAMPLE_RATE: '5' })!;
    expect(o).toMatchObject({ environment: 'production', tracesSampleRate: 0, dataCollection: { userInfo: false, cookies: false, httpBodies: [], urlQueryParams: false } });
    expect(sentryOptions({ SENTRY_DSN: 'x', SENTRY_TRACES_SAMPLE_RATE: '0.1' })!.tracesSampleRate).toBe(0.1);
  });

  it('curăță cookie-uri, antete secrete, corpul, query string-ul și datele utilizatorului', () => {
    const e = scrubEvent({
      request: {
        url: 'https://api.eventhub.ro/api/auth/google/callback?code=SECRET&state=x',
        query_string: 'code=SECRET', cookies: { eh_refresh: 'r' }, data: { password: 'parola123' },
        headers: { Authorization: 'Bearer abc', Cookie: 'eh_refresh=r', 'X-Turnstile-Token': 't', 'user-agent': 'Firefox' },
      },
      user: { id: 'u1', email: 'ana@gmail.com', ip_address: '1.2.3.4' },
    });
    expect(e).toEqual({ request: { url: 'https://api.eventhub.ro/api/auth/google/callback', headers: { 'user-agent': 'Firefox' } }, user: { id: 'u1' } });
    expect(JSON.stringify(e)).not.toMatch(/SECRET|parola123|Bearer|eh_refresh|ana@gmail/);
  });
});
