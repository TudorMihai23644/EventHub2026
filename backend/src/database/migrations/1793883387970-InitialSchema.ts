import { MigrationInterface, QueryRunner } from 'typeorm';

// Schema inițială: users, events, registrations.
// Generată cu `npm run migration:generate` pe o bază goală, apoi completată cu:
//  - extensia uuid-ossp (pentru uuid_generate_v4());
//  - BASELINE: bazele create înainte de migrări (cu `synchronize: true`) au deja aceste tabele,
//    cu aceleași nume de constrângeri. Pentru ele migrarea nu creează nimic, doar se înregistrează ca aplicată.
export class InitialSchema1793883387970 implements MigrationInterface {
  name = 'InitialSchema1793883387970';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Verificări una după alta: queryRunner folosește o singură conexiune.
    let existing = 0;
    for (const table of ['users', 'events', 'registrations']) {
      if (await queryRunner.hasTable(table)) existing++;
    }
    if (existing === 3) return; // BASELINE: schema există deja
    // Dacă există doar o parte din tabele, CREATE TABLE de mai jos eșuează intenționat: baza trebuie verificată manual.

    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(`CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(100) NOT NULL, "email" character varying NOT NULL, "passwordHash" character varying NOT NULL, "role" character varying(20) NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE TABLE "registrations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "eventId" uuid NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_133db113646ed250e71d661bc3e" UNIQUE ("userId", "eventId"), CONSTRAINT "PK_6013e724d7b22929da9cd7282d1" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE TABLE "events" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "title" character varying(120) NOT NULL, "description" text NOT NULL, "startsAt" TIMESTAMP WITH TIME ZONE NOT NULL, "location" character varying(160) NOT NULL, "capacity" integer NOT NULL, "organizerId" uuid NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_40731c7151fe4be3116e45ddf73" PRIMARY KEY ("id"))`);
    await queryRunner.query(`ALTER TABLE "registrations" ADD CONSTRAINT "FK_7e5ae7aa55bb98b8b9dcbe32ca3" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "registrations" ADD CONSTRAINT "FK_06a49e76b60cac63e04b81eb1a9" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "events" ADD CONSTRAINT "FK_1024d476207981d1c72232cf3ca" FOREIGN KEY ("organizerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
  }

  // Atenție: șterge toate tabelele și datele. Doar pentru dezvoltare.
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "events" DROP CONSTRAINT "FK_1024d476207981d1c72232cf3ca"`);
    await queryRunner.query(`ALTER TABLE "registrations" DROP CONSTRAINT "FK_06a49e76b60cac63e04b81eb1a9"`);
    await queryRunner.query(`ALTER TABLE "registrations" DROP CONSTRAINT "FK_7e5ae7aa55bb98b8b9dcbe32ca3"`);
    await queryRunner.query(`DROP TABLE "events"`);
    await queryRunner.query(`DROP TABLE "registrations"`);
    await queryRunner.query(`DROP TABLE "users"`);
  }
}
