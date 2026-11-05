import { MigrationInterface, QueryRunner } from 'typeorm';

// Idee 9: lista de așteptare. Tabel separat de `registrations` (nimic din ce numără locurile nu se schimbă).
// UNIQUE(userId, eventId): cel mult o dată pe listă; index (eventId, createdAt): „primul de pe listă”.
export class AddWaitlist1793906588653 implements MigrationInterface {
  name = 'AddWaitlist1793906588653';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "waitlist_entries" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "eventId" uuid NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_49324b9cf0d4c536b2962bfe37d" UNIQUE ("userId", "eventId"), CONSTRAINT "PK_bd0ef66fff81d3be7b7a1568a4d" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE INDEX "IDX_661a0ab4cd9db5a7df43580d2c" ON "waitlist_entries" ("eventId", "createdAt")`);
    await queryRunner.query(`ALTER TABLE "waitlist_entries" ADD CONSTRAINT "FK_57642f3d0efcd6958d2a689a79b" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "waitlist_entries" ADD CONSTRAINT "FK_cc5689522e3be0198d8b3af1af7" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "waitlist_entries" DROP CONSTRAINT "FK_cc5689522e3be0198d8b3af1af7"`);
    await queryRunner.query(`ALTER TABLE "waitlist_entries" DROP CONSTRAINT "FK_57642f3d0efcd6958d2a689a79b"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_661a0ab4cd9db5a7df43580d2c"`);
    await queryRunner.query(`DROP TABLE "waitlist_entries"`);
  }
}
