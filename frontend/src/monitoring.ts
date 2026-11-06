// Sentry în browser, doar dacă VITE_SENTRY_DSN e setat. SDK-ul se încarcă separat (import dinamic):
// fără DSN, nu ajunge deloc în aplicație.
type SentryModule = typeof import('@sentry/react');

const dsn = (import.meta.env.VITE_SENTRY_DSN as string | undefined)?.trim();
let sentry: Promise<SentryModule> | null = null;

/** Linkurile de resetare / confirmare au token-ul în adresă (?token=…): nicio adresă nu pleacă cu query string. */
export const stripQuery = (url: string) => url.split(/[?#]/)[0];

export function startMonitoring() {
  if (!dsn || sentry) return;
  sentry = import('@sentry/react').then((S) => {
    S.init({
      dsn,
      environment: import.meta.env.MODE,
      release: (import.meta.env.VITE_SENTRY_RELEASE as string | undefined) || undefined,
      tracesSampleRate: 0, // doar erori
      dataCollection: { userInfo: false, cookies: false, httpBodies: [], urlQueryParams: false },
      beforeSend(event) {
        if (event.request?.url) event.request.url = stripQuery(event.request.url);
        if (event.request) { delete event.request.query_string; delete event.request.cookies; delete event.request.headers; }
        delete event.user;
        return event;
      },
      beforeBreadcrumb(b) {
        // navigări și cereri: adresele fără query string; cererile către API n-au corpul în breadcrumb oricum
        if (b.data) {
          for (const k of ['from', 'to', 'url']) if (typeof b.data[k] === 'string') b.data[k] = stripQuery(b.data[k]);
        }
        return b;
      },
    });
    return S;
  });
}

export function reportError(error: unknown) {
  sentry?.then((S) => S.captureException(error)).catch(() => undefined);
}
