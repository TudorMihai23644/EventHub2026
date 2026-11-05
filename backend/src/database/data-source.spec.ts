import { dataSourceOptions, ENTITIES, MIGRATIONS_GLOB, migrationsRunEnabled } from './data-source';
import { User } from '../users/user.entity';
import { Event } from '../events/event.entity';
import { Registration } from '../registrations/registration.entity';

describe('dataSourceOptions', () => {
  const env = { DB_PASSWORD: 'x', DB_HOST: 'db', DB_PORT: '6543', DB_USER: 'u', DB_NAME: 'n' } as NodeJS.ProcessEnv;
  const OLD = process.env.DB_PASSWORD;
  beforeEach(() => { process.env.DB_PASSWORD = 'x'; }); // secret() citește din process.env
  afterEach(() => { process.env.DB_PASSWORD = OLD; });

  it('nu modifică niciodată schema automat', () => {
    expect(dataSourceOptions(env).synchronize).toBe(false);
  });

  it('încarcă migrările din database/migrations, ca .ts și ca .js', () => {
    expect(dataSourceOptions(env).migrations).toEqual([MIGRATIONS_GLOB]);
    expect(MIGRATIONS_GLOB.replace(/\\/g, '/')).toMatch(/database\/migrations\/\*\.\{ts,js\}$/);
  });

  it('listează toate entitățile', () => {
    expect(ENTITIES).toEqual(expect.arrayContaining([User, Event, Registration]));
    expect(dataSourceOptions(env).entities).toBe(ENTITIES);
  });

  it('folosește conexiunea din variabilele de mediu', () => {
    expect(dataSourceOptions(env)).toMatchObject({ type: 'postgres', host: 'db', port: 6543, username: 'u', database: 'n' });
  });
});

describe('migrationsRunEnabled', () => {
  it.each([
    [undefined, true],
    ['', true],
    ['true', true],
    ['false', false],
    [' FALSE ', false],
  ])('DB_MIGRATIONS_RUN=%j -> %s', (value, expected) => {
    expect(migrationsRunEnabled({ DB_MIGRATIONS_RUN: value } as NodeJS.ProcessEnv)).toBe(expected);
  });
});
