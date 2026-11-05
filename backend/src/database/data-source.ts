import { join } from 'path';
import { DataSourceOptions } from 'typeorm';
import { secret } from '../common/secrets';
import { User } from '../users/user.entity';
import { Event } from '../events/event.entity';
import { Registration } from '../registrations/registration.entity';
import { OutboxEmail } from '../mail/outbox.entity';

// Lista explicită de entități: CLI-ul TypeORM rulează în afara Nest, deci autoLoadEntities nu funcționează acolo.
export const ENTITIES = [User, Event, Registration, OutboxEmail];

// Același tipar funcționează cu ts-node (*.ts în src/) și în imaginea Docker (*.js în dist/).
export const MIGRATIONS_GLOB = join(__dirname, 'migrations', '*.{ts,js}');

// Migrările rulează la pornirea API-ului, dacă DB_MIGRATIONS_RUN nu este "false".
export function migrationsRunEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.DB_MIGRATIONS_RUN?.trim().toLowerCase() !== 'false';
}

// Singura sursă pentru setările bazei de date, folosită de AppModule și de CLI.
// Schema se schimbă doar prin migrări (src/database/migrations), niciodată automat.
export function dataSourceOptions(env: NodeJS.ProcessEnv = process.env): DataSourceOptions {
  return {
    type: 'postgres',
    host: env.DB_HOST ?? 'localhost',
    port: Number(env.DB_PORT ?? 5432),
    username: env.DB_USER ?? 'eventhub',
    password: secret('DB_PASSWORD'),
    database: env.DB_NAME ?? 'eventhub',
    entities: ENTITIES,
    migrations: [MIGRATIONS_GLOB],
    synchronize: false,
    migrationsRun: migrationsRunEnabled(env),
  };
}
