import { readFileSync } from 'fs';

// Citește un secret din `NUME_FILE` (fișier montat de Docker în /run/secrets)
// sau, pentru dezvoltare locală, din variabila `NUME` (ex. din backend/.env).
export function secret(name: string, required = true): string | undefined {
  const file = process.env[`${name}_FILE`];
  const value = file ? readFileSync(file, 'utf8').trim() : process.env[name];
  if (!value && required) {
    throw new Error(`Lipsește secretul ${name}. Setează ${name} sau ${name}_FILE.`);
  }
  return value || undefined;
}
