import { formatTicketCode, normalizeTicketCode } from './ticket-code';
import { checkInWindow } from './checkin-window';

describe('codul biletului', () => {
  it.each([
    ['7KQ2M9XH4T', '7KQ2M9XH4T'],
    ['7kq2m-9xh4t', '7KQ2M9XH4T'], // litere mici, cratimă
    [' 7KQ2M 9XH4T ', '7KQ2M9XH4T'], // spații
    ['7KQ2MOXH4T', '7KQ2M0XH4T'], // O citit ca 0
    ['7KQ2MLXH4T', '7KQ2M1XH4T'], // L citit ca 1
    ['7KQ2MIXH4T', '7KQ2M1XH4T'], // I citit ca 1
  ])('%j → %j', (input, expected) => expect(normalizeTicketCode(input)).toBe(expected));

  it.each(['', 'SCURT', '7KQ2M9XH4T9', '7KQ2M9XH4U', 'https://evil.ro/x', '<script>'])('%j → nu e un cod', (input) => {
    expect(normalizeTicketCode(input)).toBeNull();
  });

  it('afișare cu cratimă', () => expect(formatTicketCode('7KQ2M9XH4T')).toBe('7KQ2M-9XH4T'));
});

describe('fereastra de validare', () => {
  const start = new Date('2026-12-01T17:00:00Z');
  it('de cu 3 ore înainte până la 6 ore după sfârșit', () => {
    expect(checkInWindow({ startsAt: start, endsAt: new Date('2026-12-01T20:00:00Z') })).toEqual({
      opens: new Date('2026-12-01T14:00:00Z'), closes: new Date('2026-12-02T02:00:00Z'),
    });
  });
  it('fără oră de sfârșit: 12 ore + 6', () => {
    expect(checkInWindow({ startsAt: start, endsAt: null }).closes).toEqual(new Date('2026-12-02T11:00:00Z'));
  });
});
