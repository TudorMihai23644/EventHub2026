import { DataSource } from 'typeorm';
import { dataSourceOptions } from '../database/data-source';

// Conexiune la baza de test pentru testele de integrare (*.int-spec.ts).
// Implicit: containerul din `npm run test:db:up` (127.0.0.1:55432, postgres/test, eventhub_test).
// Se poate schimba cu TEST_DB_HOST / TEST_DB_PORT / TEST_DB_USER / TEST_DB_PASSWORD / TEST_DB_NAME.
const TEST_APP = 'eventhub-int-test';

export async function openTestDb(): Promise<DataSource> {
  const env = {
    ...process.env,
    DB_HOST: process.env.TEST_DB_HOST ?? '127.0.0.1',
    DB_PORT: process.env.TEST_DB_PORT ?? '55432',
    DB_USER: process.env.TEST_DB_USER ?? 'postgres',
    DB_NAME: process.env.TEST_DB_NAME ?? 'eventhub_test',
  };
  // Protecție: testele șterg toate tabelele. Refuză orice bază al cărei nume nu conține „test”.
  if (!/test/i.test(env.DB_NAME)) {
    throw new Error(`Refuz să rulez testele de integrare pe baza „${env.DB_NAME}”: numele trebuie să conțină „test”.`);
  }
  process.env.DB_PASSWORD = process.env.TEST_DB_PASSWORD ?? 'test'; // secret() citește din process.env
  delete process.env.DB_PASSWORD_FILE;

  const base = dataSourceOptions(env);
  const ds = new DataSource({ ...base, migrationsRun: false, extra: { ...(base as { extra?: object }).extra, application_name: TEST_APP } } as typeof base);
  try {
    await ds.initialize();
  } catch (e) {
    throw new Error(`Baza de test nu răspunde (${env.DB_HOST}:${env.DB_PORT}). Pornește-o cu: npm run test:db:up\n${e}`);
  }
  // Un API pornit pe aceeași bază (ex. rămas de la un test manual) are worker-e care trimit emailuri și caută adrese
  // chiar în timpul testelor: rezultate care „uneori” pică. Mai bine o eroare clară.
  const [{ others }] = await ds.query(
    `SELECT count(*)::int AS others FROM pg_stat_activity
     WHERE datname = current_database() AND pid <> pg_backend_pid() AND backend_type = 'client backend' AND application_name <> $1`,
    [TEST_APP],
  );
  if (others > 0) {
    await ds.destroy();
    throw new Error(`Alte ${others} conexiuni folosesc baza de test (un API pornit pe ea?). Oprește-le înainte de testele de integrare.`);
  }
  await ds.dropDatabase(); // schemă curată la fiecare rulare...
  await ds.runMigrations(); // ...creată exact ca în producție: prin migrări
  return ds;
}

export async function clearTables(ds: DataSource) {
  await ds.query('TRUNCATE email_outbox, payments, waitlist_entries, registrations, events, users CASCADE');
}
