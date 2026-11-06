import { csvCell, csvDate, toCsv } from './csv';

describe('CSV', () => {
  it('BOM UTF-8, separator „;”, rânduri CRLF', () => {
    const csv = toCsv([['Nume', 'Oraș'], ['Ana', 'Brașov']]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toBe('﻿Nume;Oraș\r\nAna;Brașov\r\n');
  });

  it('ghilimele când celula conține ; , ghilimele sau rând nou', () => {
    expect(csvCell('a;b')).toBe('"a;b"');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('spune "da"')).toBe('"spune ""da"""');
    expect(csvCell('rând\nnou')).toBe('"rând\nnou"');
  });

  it.each([
    ['=HYPERLINK("http://rău.ro","click")', `"'=HYPERLINK(""http://rău.ro"",""click"")"`],
    ['+40722', "'+40722"],
    ['-1+1', "'-1+1"],
    ['@SUM(A1)', "'@SUM(A1)"],
  ])('formulă %j → text, nu formulă', (input, expected) => {
    expect(csvCell(input)).toBe(expected);
  });

  it('null / undefined → celulă goală; numere ca text', () => {
    expect(toCsv([[null, undefined, 3]])).toBe('﻿;;3\r\n');
  });

  it('data în fusul orar al aplicației', () => {
    expect(csvDate(new Date('2026-12-01T17:00:00Z'), 'Europe/Bucharest')).toBe('2026-12-01 19:00');
  });
});
