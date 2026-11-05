import { DataSource } from 'typeorm';
import { dataSourceOptions } from '../database/data-source';

// Conexiune la baza de test pentru testele de integrare (*.int-spec.ts).
// Implicit: containerul din `npm run test:db:up` (127.0.0.1:55432, postgres/test, eventhub_test).
// Se poate schimba cu TEST_DB_HOST / TEST_DB_PORT / TEST_DB_USER / TEST_DB_PASSWORD / TEST_DB_NAME.
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

  const ds = new DataSource({ ...dataSourceOptions(env), migrationsRun: false });
  try {
    await ds.initialize();
  } catch (e) {
    throw new Error(`Baza de test nu răspunde (${env.DB_HOST}:${env.DB_PORT}). Pornește-o cu: npm run test:db:up\n${e}`);
  }
  await ds.dropDatabase(); // schemă curată la fiecare rulare...
  await ds.runMigrations(); // ...creată exact ca în producție: prin migrări
  return ds;
}

export async function clearTables(ds: DataSource) {
  await ds.query('TRUNCATE email_outbox, waitlist_entries, registrations, events, users CASCADE');
}
