import type { ErrorEvent, NodeOptions } from '@sentry/nestjs';

// Antete care nu pleacă niciodată la Sentry: sesiunea, token-urile, CAPTCHA.
const SECRET_HEADERS = ['authorization', 'cookie', 'set-cookie', 'x-turnstile-token', 'x-eventhub-client'];

/**
 * Ce ajunge la Sentry dintr-o eroare: fără cookie-uri, fără antete de autentificare, fără corpul cererii
 * (parole, token-uri de resetare) și fără query string (codul OAuth Google e acolo). Doar metoda și calea.
 */
export function scrubEvent<E extends Pick<ErrorEvent, 'request' | 'user'>>(event: E): E {
  if (event.request) {
    delete event.request.cookies;
    delete event.request.data;
    delete event.request.query_string;
    if (event.request.url) event.request.url = event.request.url.split('?')[0];
    if (event.request.headers) {
      for (const h of Object.keys(event.request.headers)) {
        if (SECRET_HEADERS.includes(h.toLowerCase())) delete event.request.headers[h];
      }
    }
  }
  if (event.user) event.user = { id: event.user.id }; // fără email / IP
  return event;
}

/** null = Sentry oprit (fără SENTRY_DSN): SDK-ul nu e inițializat, nu se trimite nimic. */
export function sentryOptions(env: NodeJS.ProcessEnv = process.env): NodeOptions | null {
  const dsn = env.SENTRY_DSN?.trim();
  if (!dsn) return null;
  const rate = Number(env.SENTRY_TRACES_SAMPLE_RATE);
  return {
    dsn,
    environment: env.SENTRY_ENVIRONMENT?.trim() || env.NODE_ENV || 'development',
    release: env.SENTRY_RELEASE?.trim() || undefined,
    // nimic personal colectat de la sursă (SDK v11: dataCollection); beforeSend curăță oricum, a doua linie de apărare
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpBodies: [],
      urlQueryParams: false,
      httpHeaders: { request: { deny: SECRET_HEADERS }, response: false },
    },
    // implicit doar erorile; performanța (trace-uri) doar la cerere, ex. 0.1
    tracesSampleRate: Number.isFinite(rate) && rate >= 0 && rate <= 1 ? rate : 0,
    beforeSend: (event) => scrubEvent(event),
  };
}
