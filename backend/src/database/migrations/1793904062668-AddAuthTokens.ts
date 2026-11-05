import { MigrationInterface, QueryRunner } from 'typeorm';

// Idee 7: resetare parolă, confirmare email, închiderea sesiunilor după resetare.
//  - auth_tokens: linkuri de unică folosință (doar hash-ul token-ului);
//  - users.emailVerifiedAt: null = adresă neconfirmată;
//  - users.tokenVersion: intră în JWT ca `tv`; crește la resetarea parolei;
//  - email_outbox.sensitive: conținutul (cu link secret) se șterge după trimitere.
// Conturile existente sunt marcate confirmate (decizia 2): nimeni nu rămâne blocat după actualizare.
export class AddAuthTokens1793904062668 implements MigrationInterface {
  name = 'AddAuthTokens1793904062668';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "auth_tokens" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "kind" character varying(20) NOT NULL, "tokenHash" character(64) NOT NULL, "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, "usedAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_41e9ddfbb32da18c4e85e45c2fd" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE INDEX "IDX_c25fb956ebada4b256501585cc" ON "auth_tokens" ("userId")`);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_323c4ca6708c6a8b81af2b4ee0" ON "auth_tokens" ("tokenHash")`);
    await queryRunner.query(`ALTER TABLE "users" ADD "emailVerifiedAt" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(`ALTER TABLE "users" ADD "tokenVersion" integer NOT NULL DEFAULT '0'`);
    await queryRunner.query(`ALTER TABLE "email_outbox" ADD "sensitive" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`ALTER TABLE "auth_tokens" ADD CONSTRAINT "FK_c25fb956ebada4b256501585cca" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    // conturile create înainte de această migrare: considerate confirmate
    await queryRunner.query(`UPDATE "users" SET "emailVerifiedAt" = "createdAt" WHERE "emailVerifiedAt" IS NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "auth_tokens" DROP CONSTRAINT "FK_c25fb956ebada4b256501585cca"`);
    await queryRunner.query(`ALTER TABLE "email_outbox" DROP COLUMN "sensitive"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "tokenVersion"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "emailVerifiedAt"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_323c4ca6708c6a8b81af2b4ee0"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_c25fb956ebada4b256501585cc"`);
    await queryRunner.query(`DROP TABLE "auth_tokens"`);
  }
}
