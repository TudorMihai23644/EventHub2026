import { describe, expect, it } from 'vitest';
import { toCents, toLei } from './money';
import { safeNext } from './pages/AuthPages';
import { stripQuery } from './monitoring';
import { googleError } from './signin-extras';
import { seatsLabel } from './ui';

describe('prețul: lei ↔ bani', () => {
  it.each([
    ['49,90', 4990], ['49.90', 4990], [' 50 ', 5000], ['0,1', 10], ['', null], ['  ', null],
  ])('toCents(%j) = %j', (lei, cents) => expect(toCents(lei)).toBe(cents));

  it('text care nu e număr → NaN (formularul arată o eroare)', () => {
    expect(toCents('cincizeci')).toBeNaN();
  });

  it.each([[4990, '49,90'], [4900, '49'], [5, '0,05'], [null, ''], [0, '']])('toLei(%j) = %j', (cents, lei) => {
    expect(toLei(cents)).toBe(lei);
  });

  it('dus-întors', () => {
    for (const c of [200, 4990, 123456]) expect(toCents(toLei(c))).toBe(c);
  });
});

describe('safeNext: după autentificare, doar pagini din aplicație', () => {
  it.each([
    ['/check-in/ABC', '/check-in/ABC'],
    ['/evenimente?x=1', '/evenimente?x=1'],
    ['//evil.ro', null],
    ['/\\evil.ro', null],
    ['https://evil.ro', null],
    ['javascript:alert(1)', null],
    [null, null],
  ])('%j → %j', (input, out) => expect(safeNext(input)).toBe(out));
});

describe('Sentry: adresele pleacă fără query string', () => {
  it('token-ul din linkul de resetare nu iese', () => {
    expect(stripQuery('https://eventhub.ro/resetare-parola?token=SECRET#x')).toBe('https://eventhub.ro/resetare-parola');
    expect(stripQuery('/confirmare-email?token=SECRET')).toBe('/confirmare-email');
  });
});

describe('mesajele întoarcerii de la Google', () => {
  it('fiecare motiv are un mesaj; fără motiv, nimic', () => {
    expect(googleError(null)).toBeNull();
    for (const r of ['cancelled', 'expired', 'unverified', 'error', 'altceva']) expect(googleError(r)).toMatch(/\S/);
    expect(googleError('cancelled')).toContain('anulat');
  });
});

describe('seatsLabel', () => {
  it('locuri libere / plin cu listă / epuizat', () => {
    expect(seatsLabel({ availableSeats: 3, capacity: 10 })).toBe('3 din 10 locuri libere');
    expect(seatsLabel({ availableSeats: 0, capacity: 10, waitlistCount: 2 })).toBe('Plin · 2 în așteptare');
    expect(seatsLabel({ availableSeats: 0, capacity: 10 })).toBe('Locuri epuizate');
  });
});
