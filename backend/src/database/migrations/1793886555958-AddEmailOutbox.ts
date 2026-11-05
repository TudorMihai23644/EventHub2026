import { MigrationInterface, QueryRunner } from 'typeorm';

// Coada de emailuri (idee 6). Rândurile se scriu în tranzacția acțiunii și sunt trimise de OutboxWorker.
// Indexul (status, sendAfter) servește căutarea „emailuri PENDING scadente”.
export class AddEmailOutbox1793886555958 implements MigrationInterface {
  name = 'AddEmailOutbox1793886555958';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "email_outbox" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "to" character varying(320) NOT NULL, "subject" character varying(300) NOT NULL, "html" text NOT NULL, "text" text NOT NULL, "kind" character varying(40) NOT NULL, "status" character varying(10) NOT NULL DEFAULT 'PENDING', "attempts" integer NOT NULL DEFAULT '0', "lastError" text, "sendAfter" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "sentAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_b6fbfc201f705fbf1ac87bd7197" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE INDEX "IDX_460f859d665d4c1d1586d45b14" ON "email_outbox" ("status", "sendAfter")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_460f859d665d4c1d1586d45b14"`);
    await queryRunner.query(`DROP TABLE "email_outbox"`);
  }
}
