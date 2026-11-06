import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import { BadRequestException, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TurnstileConfig, TurnstileGuard, turnstileConfig, verifyTurnstile } from './turnstile';

describe('Cloudflare Turnstile', () => {
  let server: Server;
  let cfg: TurnstileConfig;
  let reply: { status: number; body: unknown };
  let lastForm: URLSearchParams | null = null;

  beforeAll(async () => {
    server = createServer((req, res) => {
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => {
        lastForm = new URLSearchParams(raw);
        res.writeHead(reply.status, { 'Content-Type': 'application/json' }).end(JSON.stringify(reply.body));
      });
    });
    await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
    cfg = { enabled: true, siteKey: 'site', secretKey: 'secret-key', verifyUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}/siteverify` };
  });
  afterAll(() => new Promise((ok) => server.close(ok)));

  it('config: activ doar cu ambele chei; cheia site-ului e publică doar atunci', () => {
    expect(turnstileConfig({ TURNSTILE_SITE_KEY: 'a' })).toMatchObject({ enabled: false, siteKey: null });
    expect(turnstileConfig({ TURNSTILE_SITE_KEY: 'a', TURNSTILE_SECRET_KEY: 'b' })).toMatchObject({ enabled: true, siteKey: 'a' });
  });

  it('trimite secretul, token-ul și IP-ul; succes → ok', async () => {
    reply = { status: 200, body: { success: true, action: 'login' } };
    expect(await verifyTurnstile(cfg, 'tok', '1.2.3.4', 'login')).toBe('ok');
    expect(Object.fromEntries(lastForm!)).toEqual({ secret: 'secret-key', response: 'tok', remoteip: '1.2.3.4' });
  });

  it.each([
    ['token respins', 200, { success: false, 'error-codes': ['invalid-input-response'] }, 'rejected'],
    ['token din alt formular', 200, { success: true, action: 'register' }, 'rejected'],
    ['cheile de test (fără action)', 200, { success: true }, 'ok'],
    ['Cloudflare 500', 500, {}, 'unavailable'],
    ['răspuns ciudat', 200, 'x', 'rejected'],
  ])('%s → %s', async (_l, status, body, verdict) => {
    reply = { status, body };
    expect(await verifyTurnstile(cfg, 'tok', undefined, 'login')).toBe(verdict);
  });

  it('Cloudflare nu răspunde → unavailable (cererea trece)', async () => {
    expect(await verifyTurnstile({ ...cfg, verifyUrl: 'http://127.0.0.1:9/x' }, 'tok', undefined, 'login')).toBe('unavailable');
  });

  describe('guard', () => {
    const ctx = (headers: Record<string, string>) => ({
      getHandler: () => ({}),
      switchToHttp: () => ({ getRequest: () => ({ headers, ip: '1.2.3.4' }) }),
    }) as unknown as ExecutionContext;
    const reflector = (action: string | undefined) => ({ get: () => action }) as unknown as Reflector;

    it('oprit sau rută nemarcată → trece fără nicio cerere', async () => {
      expect(await new TurnstileGuard({ ...cfg, enabled: false }, reflector('login')).canActivate(ctx({}))).toBe(true);
      expect(await new TurnstileGuard(cfg, reflector(undefined)).canActivate(ctx({}))).toBe(true);
    });
    it('fără token → 400 CAPTCHA_REQUIRED; respins → 400 CAPTCHA_FAILED; bun → trece', async () => {
      const g = new TurnstileGuard(cfg, reflector('login'));
      await expect(g.canActivate(ctx({}))).rejects.toMatchObject({ response: { code: 'CAPTCHA_REQUIRED' } });
      reply = { status: 200, body: { success: false } };
      await expect(g.canActivate(ctx({ 'x-turnstile-token': 't' }))).rejects.toThrow(BadRequestException);
      reply = { status: 200, body: { success: true } };
      expect(await g.canActivate(ctx({ 'x-turnstile-token': 't' }))).toBe(true);
    });
  });
});
