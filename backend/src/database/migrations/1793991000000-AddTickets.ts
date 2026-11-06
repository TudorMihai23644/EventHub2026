import { MigrationInterface, QueryRunner } from 'typeorm';

// Idee 15: bilete cu QR și validare la intrare.
//  - eventhub_ticket_code(): 10 caractere Crockford base32 din gen_random_bytes (pgcrypto, sigur criptografic);
//    valoarea implicită a coloanei, deci orice inserare primește un cod (înscriere, promovare de pe listă, teste);
//  - înscrierile existente primesc coduri acum;
//  - checkedInAt: când a fost validat biletul.
// Scrisă de mână: funcția și umplerea înscrierilor existente nu pot fi generate.
export class AddTickets1793991000000 implements MigrationInterface {
  name = 'AddTickets1793991000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION eventhub_ticket_code() RETURNS char(10) AS $$
      DECLARE
        alphabet text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
        b bytea := gen_random_bytes(10);
        code text := '';
      BEGIN
        FOR i IN 0..9 LOOP
          code := code || substr(alphabet, (get_byte(b, i) & 31) + 1, 1); -- 256 e multiplu de 32: uniform
        END LOOP;
        RETURN code;
      END
      $$ LANGUAGE plpgsql VOLATILE`);
    await queryRunner.query(`ALTER TABLE "registrations" ADD "ticketCode" character(10)`);
    await queryRunner.query(`UPDATE "registrations" SET "ticketCode" = eventhub_ticket_code()`);
    await queryRunner.query(`ALTER TABLE "registrations" ALTER COLUMN "ticketCode" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "registrations" ALTER COLUMN "ticketCode" SET DEFAULT eventhub_ticket_code()`);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_de425f11b5355324ea9942da7a" ON "registrations" ("ticketCode")`);
    await queryRunner.query(`ALTER TABLE "registrations" ADD "checkedInAt" TIMESTAMP WITH TIME ZONE`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "registrations" DROP COLUMN "checkedInAt"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_de425f11b5355324ea9942da7a"`);
    await queryRunner.query(`ALTER TABLE "registrations" DROP COLUMN "ticketCode"`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS eventhub_ticket_code()`);
  }
}
