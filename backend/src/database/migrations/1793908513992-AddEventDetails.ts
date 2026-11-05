import { MigrationInterface, QueryRunner } from 'typeorm';

// Idee 11, partea 1: ora de sfârșit (opțională), categoria, formatul (fizic / online / hibrid) și linkul online.
// Evenimentele existente devin „Altele”, „Fizic”, fără oră de sfârșit și fără link.
export class AddEventDetails1793908513992 implements MigrationInterface {
  name = 'AddEventDetails1793908513992';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "events" ADD "endsAt" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(`ALTER TABLE "events" ADD "category" character varying(20) NOT NULL DEFAULT 'ALTELE'`);
    await queryRunner.query(`ALTER TABLE "events" ADD "format" character varying(10) NOT NULL DEFAULT 'PHYSICAL'`);
    await queryRunner.query(`ALTER TABLE "events" ADD "onlineUrl" character varying(500)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "events" DROP COLUMN "onlineUrl"`);
    await queryRunner.query(`ALTER TABLE "events" DROP COLUMN "format"`);
    await queryRunner.query(`ALTER TABLE "events" DROP COLUMN "category"`);
    await queryRunner.query(`ALTER TABLE "events" DROP COLUMN "endsAt"`);
  }
}
