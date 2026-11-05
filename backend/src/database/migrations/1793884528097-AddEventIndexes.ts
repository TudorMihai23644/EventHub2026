import { MigrationInterface, QueryRunner } from 'typeorm';

// Indexuri pentru lista de evenimente (idee 5):
//  - registrations.eventId: numărarea înscrierilor pe eveniment și filtrul „doar cu locuri libere”;
//  - events.startsAt: „evenimente viitoare, sortate după dată”.
export class AddEventIndexes1793884528097 implements MigrationInterface {
  name = 'AddEventIndexes1793884528097';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE INDEX "IDX_06a49e76b60cac63e04b81eb1a" ON "registrations" ("eventId")`);
    await queryRunner.query(`CREATE INDEX "IDX_e0da647c004a695b1d55a073e8" ON "events" ("startsAt")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_e0da647c004a695b1d55a073e8"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_06a49e76b60cac63e04b81eb1a"`);
  }
}
