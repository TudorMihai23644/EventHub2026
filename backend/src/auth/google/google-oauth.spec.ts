import { createHash } from 'crypto';
import { GoogleAuthError, GoogleConfig, authorizationUrl, decodeState, encodeState, googleConfig, newOAuthState, safeNext, verifyIdToken } from './google-oauth';

const cfg: GoogleConfig = {
  enabled: true, clientId: 'client-1.apps.googleusercontent.com', clientSecret: 's', redirectUri: 'http://api.test/api/auth/google/callback',
  appUrl: 'http://app.test', authUrl: 'https://accounts.google.com/o/oauth2/v2/auth', tokenUrl: 'https://oauth2.googleapis.com/token',
};
const now = Date.parse('2026-11-06T12:00:00Z');
/** ID token nesemnat (semnătura nu se verifică: vine direct de la Google pe HTTPS). */
const idToken = (claims: Record<string, unknown>) =>
  ['e30', Buffer.from(JSON.stringify(claims)).toString('base64url'), 'sig'].join('.');
const good = {
  iss: 'https://accounts.google.com', aud: cfg.clientId, exp: now / 1000 + 3600, nonce: 'n-123',
  sub: '1098', email: 'Ana@Gmail.com', email_verified: true, name: 'Ana Pop',
};

describe('Google OAuth', () => {
  it('config: activ doar cu ID și secret; redirect URI din PUBLIC_API_URL', () => {
    expect(googleConfig({ GOOGLE_CLIENT_ID: 'x' }).enabled).toBe(false);
    const c = googleConfig({ GOOGLE_CLIENT_ID: 'x', GOOGLE_CLIENT_SECRET: 'y', PUBLIC_API_URL: 'https://api.eventhub.ro/api/' });
    expect(c).toMatchObject({ enabled: true, redirectUri: 'https://api.eventhub.ro/api/auth/google/callback' });
  });

  it('adresa de autentificare: cod, PKCE S256 din verifier, state, nonce, scope openid email profile', () => {
    const s = newOAuthState(null);
    const u = new URL(authorizationUrl(cfg, s));
    expect(Object.fromEntries(u.searchParams)).toMatchObject({
      client_id: cfg.clientId, redirect_uri: cfg.redirectUri, response_type: 'code', scope: 'openid email profile',
      state: s.state, nonce: s.nonce, code_challenge_method: 'S256',
      code_challenge: createHash('sha256').update(s.verifier).digest('base64url'),
    });
    expect(u.searchParams.has('client_secret')).toBe(false);
  });

  it('state-ul: valori diferite de fiecare dată; cookie modificat → null; next doar intern', () => {
    expect(newOAuthState(null).state).not.toBe(newOAuthState(null).state);
    const s = newOAuthState('/check-in/ABC');
    expect(decodeState(encodeState(s))).toEqual(s);
    expect(decodeState('nu-e-base64-json')).toBeNull();
    expect(decodeState(undefined)).toBeNull();
    expect(decodeState(encodeState({ ...s, next: '//evil.ro' }))?.next).toBeNull();
  });

  it.each([['/evenimente', '/evenimente'], ['//evil.ro', null], ['/\\evil.ro', null], ['https://evil.ro', null], [42, null]])('safeNext(%j) → %j', (v, r) => {
    expect(safeNext(v)).toBe(r);
  });

  it('ID token valid → identitatea (email cu litere mici)', () => {
    expect(verifyIdToken(cfg, idToken(good), 'n-123', now)).toEqual({ sub: '1098', email: 'ana@gmail.com', name: 'Ana Pop' });
    expect(verifyIdToken(cfg, idToken({ ...good, iss: 'accounts.google.com', name: undefined }), 'n-123', now).name).toBe('Ana');
  });

  it.each([
    ['alt emitent', { iss: 'https://evil.example' }, 'token'],
    ['alt destinatar (token pentru altă aplicație)', { aud: 'other-app' }, 'token'],
    ['expirat', { exp: now / 1000 - 120 }, 'token'],
    ['alt nonce (token reutilizat)', { nonce: 'n-999' }, 'token'],
    ['fără sub', { sub: '' }, 'token'],
    ['email neconfirmat de Google', { email_verified: false }, 'email'],
    ['email_verified ca text', { email_verified: 'true' }, 'email'],
  ])('respins: %s', (_l, over, reason) => {
    expect(() => verifyIdToken(cfg, idToken({ ...good, ...over }), 'n-123', now)).toThrow(new GoogleAuthError(reason));
  });

  it('token stricat → respins', () => {
    expect(() => verifyIdToken(cfg, 'abc', 'n-123', now)).toThrow(GoogleAuthError);
  });
});
