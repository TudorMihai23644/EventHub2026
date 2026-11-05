// Pentru LIKE / ILIKE în PostgreSQL: `%` și `_` sunt caractere speciale, iar `\` este caracterul de escape implicit.
// Cu escape, căutarea „100%” găsește textul „100%”, nu orice începe cu „100”.
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}
