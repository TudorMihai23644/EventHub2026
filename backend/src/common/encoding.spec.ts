import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

// Protecție împotriva textului „dublu codificat”: un fișier UTF-8 citit ca Windows-1252 și salvat din nou
// transformă „ă” în „Äƒ”, „ț” în „È›”, „î” în „Ã®”. S-a întâmplat o dată (events.service.ts, idee 5)
// și mesajele de eroare ale API-ului au ajuns stricate la utilizatori.
const MOJIBAKE = /Ã[\u0080-¿]|È[\u0080-¿Œ-™]|Ä[\u0080-¿ƒ]|â€/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : /\.(ts|js|json)$/.test(name) ? [path] : [];
  });
}

describe('Codificarea fișierelor sursă', () => {
  const root = join(__dirname, '..');

  it('niciun fișier din src/ nu conține text dublu codificat', () => {
    const bad = sourceFiles(root)
      .filter((f) => f !== __filename)
      .flatMap((f) =>
        readFileSync(f, 'utf8')
          .split('\n')
          .map((line, i) => ({ f, i, line }))
          .filter(({ line }) => MOJIBAKE.test(line))
          .map(({ f, i, line }) => `${relative(root, f)}:${i + 1}: ${line.trim().slice(0, 80)}`),
      );
    expect(bad).toEqual([]);
  });

  it('detectează exemplele cunoscute', () => {
    for (const s of ['TranzacÈ›ie', 'gÄƒsit', 'Ã®nscriere', 'â€žtitluâ€']) expect(MOJIBAKE.test(s)).toBe(true);
    for (const s of ['Tranzacție', 'găsit', 'înscriere', '„titlu”', 'Brașov', 'ÎȘȚĂÂ']) expect(MOJIBAKE.test(s)).toBe(false);
  });
});
