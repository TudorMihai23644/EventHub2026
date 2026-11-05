import { MAX_ATTEMPTS, markFailed, markSent, retryDelaySeconds } from './outbox-retry';
import { OutboxEmail } from './outbox.entity';

const now = new Date('2026-11-05T12:00:00Z');
const row = () => ({ status: 'PENDING', attempts: 0, lastError: null, sendAfter: now, sentAt: null }) as unknown as OutboxEmail;

describe('reîncercări', () => {
  it('așteaptă 1, 2, 4, 8 minute', () => {
    expect([1, 2, 3, 4].map((a) => retryDelaySeconds(a))).toEqual([60, 120, 240, 480]);
  });

  it('respectă retry-after dacă cere mai mult', () => {
    expect(retryDelaySeconds(1, 300)).toBe(300);
    expect(retryDelaySeconds(3, 5)).toBe(240);
  });

  it('un eșec temporar programează următoarea încercare', () => {
    const r = row();
    markFailed(r, 'rate_limit_exceeded', now);
    expect(r).toMatchObject({ status: 'PENDING', attempts: 1, lastError: 'rate_limit_exceeded' });
    expect(r.sendAfter.getTime() - now.getTime()).toBe(60_000);
  });

  it(`după ${MAX_ATTEMPTS} încercări eșuate, emailul devine FAILED`, () => {
    const r = row();
    for (let i = 0; i < MAX_ATTEMPTS - 1; i++) markFailed(r, 'down', now);
    expect(r.status).toBe('PENDING');
    markFailed(r, 'down', now);
    expect(r).toMatchObject({ status: 'FAILED', attempts: MAX_ATTEMPTS });
  });

  it('o eroare permanentă (adresă invalidă) nu se mai reîncearcă', () => {
    const r = row();
    markFailed(r, 'Invalid `to` field.', now, { permanent: true });
    expect(r).toMatchObject({ status: 'FAILED', attempts: 1 });
  });

  it('trimis: SENT, cu ora și fără eroare', () => {
    const r = row();
    markFailed(r, 'down', now);
    markSent(r, now);
    expect(r).toMatchObject({ status: 'SENT', sentAt: now, lastError: null });
  });

  it('eroarea salvată este scurtată la 2000 de caractere', () => {
    const r = row();
    markFailed(r, 'x'.repeat(5000), now);
    expect(r.lastError).toHaveLength(2000);
  });
});
