// Export CSV pentru Excel / LibreOffice / Google Sheets.
//  - separator „;”: Excel cu setări regionale românești (și majoritatea europene) așteaptă „;”, nu „,”;
//  - BOM UTF-8 la început: altfel Excel citește fișierul ca Windows-1252 și afișează diacriticele stricate;
//  - protecție „CSV injection”: o celulă care începe cu = + - @ (sau tab / CR) ar fi interpretată ca formulă
//    (ex. un participant cu numele „=HYPERLINK(...)”); îi punem un apostrof în față, ca text.
export const CSV_SEPARATOR = ';';

export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[";\r\n,]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(rows: unknown[][]): string {
  return '﻿' + rows.map((r) => r.map(csvCell).join(CSV_SEPARATOR)).join('\r\n') + '\r\n';
}

/** „2026-11-05 14:30” în fusul orar dat ('sv-SE' formatează exact așa). */
export const csvDate = (d: Date, timeZone: string) =>
  new Intl.DateTimeFormat('sv-SE', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(d);
