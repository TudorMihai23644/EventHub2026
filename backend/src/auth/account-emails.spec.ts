import { hashToken } from './tokens.service';
import { TOO_MANY_REQUESTS, tooManyRequests } from '../common/security';
import * as T from '../mail/templates';
import { SCRUBBED, markFailed, markSent } from '../mail/outbox-retry';
import { OutboxEmail } from '../mail/outbox.entity';

const cfg = { appUrl: 'https://eventhub.test', timeZone: 'Europe/Bucharest' };

describe('hashToken', () => {
  it('SHA-256 hex, determinist, diferit de token', () => {
    const h = hashToken('abc');
    expect(h).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(hashToken('abc')).toBe(h);
    expect(hashToken('abd')).not.toBe(h);
  });
});

describe('mesajul 429 spune cât mai e de așteptat', () => {
  it.each([
    [60, 'un minut'],
    [30, 'un minut'],
    [61, '2 minute'],
    [19 * 60, '19 minute'],
    [20 * 60, '20 de minute'],
    [45 * 60, '45 de minute'],
    [60 * 60, '60 de minute'],
    [101 * 60, '101 minute'],
  ])('%d secunde → „%s”', (seconds, text) => {
    expect(tooManyRequests(seconds)).toBe(`Prea multe încercări. Încearcă din nou peste ${text}.`);
  });

  it('mesajul pentru limitele de un minut a rămas cel dinainte', () => {
    expect(TOO_MANY_REQUESTS).toBe('Prea multe încercări. Încearcă din nou peste un minut.');
  });
});

describe('emailurile de cont', () => {
  it('resetare: link cu token codificat, valabilitate, nume escapat', () => {
    const c = T.passwordReset(cfg, { name: '<b>Ana</b>', token: 'a+b/c' });
    expect(c.subject).toBe('Resetează-ți parola EventHub');
    expect(c.html).toContain('https://eventhub.test/resetare-parola?token=a%2Bb%2Fc');
    expect(c.text).toContain('https://eventhub.test/resetare-parola?token=a%2Bb%2Fc');
    expect(c.text).toContain('30 de minute');
    expect(c.html).not.toContain('<b>Ana</b>');
  });

  it('confirmare: link către /confirmare-email, valabil 24 de ore', () => {
    const c = T.emailVerification(cfg, { name: 'Ana', token: 'tok' });
    expect(c.text).toContain('https://eventhub.test/confirmare-email?token=tok');
    expect(c.text).toContain('24 de ore');
  });

  it('parola schimbată: fără niciun link secret, cu sfat dacă nu a fost el', () => {
    const c = T.passwordChanged(cfg, { name: 'Ana' });
    expect(c.text).not.toContain('token=');
    expect(c.text).toContain('Ai uitat parola?');
    expect(c.text).toContain('https://eventhub.test/login');
  });
});

describe('ștergerea conținutului sensibil din coadă', () => {
  const now = new Date();
  const row = (sensitive: boolean) =>
    ({ status: 'PENDING', attempts: 0, sensitive, html: '<p>token=secret</p>', text: 'token=secret', sendAfter: now }) as unknown as OutboxEmail;

  it('după trimitere: golit dacă e sensibil, păstrat altfel', () => {
    const s = row(true);
    const n = row(false);
    markSent(s, now);
    markSent(n, now);
    expect([s.html, s.text]).toEqual([SCRUBBED, SCRUBBED]);
    expect(n.text).toBe('token=secret');
  });

  it('eșec temporar: rămâne întreg (trebuie retrimis); eșec definitiv: golit', () => {
    const r = row(true);
    markFailed(r, 'timeout', now);
    expect(r.text).toBe('token=secret');
    markFailed(r, 'Invalid `to` field.', now, { permanent: true });
    expect([r.status, r.text]).toEqual(['FAILED', SCRUBBED]);
  });
});
