import { MigrationInterface, QueryRunner } from 'typeorm';

// Idee 10:
//  - registrations.reminderSentAt: memento-ul de cu o zi înainte, trimis o singură dată (golit la schimbarea datei);
//  - events.updatedAt: din el se calculează SEQUENCE în fișierul .ics. Evenimentele existente pornesc de la
//    data creării (nu de la momentul migrării, care ar arăta ca o modificare).
export class AddRemindersAndEventUpdatedAt1793907715897 implements MigrationInterface {
  name = 'AddRemindersAndEventUpdatedAt1793907715897';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "registrations" ADD "reminderSentAt" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(`ALTER TABLE "events" ADD "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()`);
    await queryRunner.query(`UPDATE "events" SET "updatedAt" = "createdAt"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "events" DROP COLUMN "updatedAt"`);
    await queryRunner.query(`ALTER TABLE "registrations" DROP COLUMN "reminderSentAt"`);
  }
}
