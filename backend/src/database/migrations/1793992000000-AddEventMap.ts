import { MigrationInterface, QueryRunner } from "typeorm";

export class AddEventMap1793992000000 implements MigrationInterface {
    name = 'AddEventMap1793992000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "events" ADD "geocodeStatus" character varying(10) NOT NULL DEFAULT 'PENDING'`);
        await queryRunner.query(`ALTER TABLE "events" ADD "geocodeQuery" character varying(160)`);
        await queryRunner.query(`ALTER TABLE "events" ADD "latitude" double precision`);
        await queryRunner.query(`ALTER TABLE "events" ADD "longitude" double precision`);
        await queryRunner.query(`ALTER TABLE "events" ADD "geocodeLabel" character varying(300)`);
        await queryRunner.query(`ALTER TABLE "events" ADD "geocodeAttempts" integer NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "events" ADD "geocodeAfter" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()`);
        // Scris de mână: evenimentele existente. Online → fără hartă; restul intră în coada worker-ului, cu aceeași
        // cheie ca geocodeKey() din geo/geocode-state.ts (spații comprimate, litere mici).
        await queryRunner.query(`UPDATE "events" SET "geocodeStatus" = 'SKIPPED' WHERE "format" = 'ONLINE'`);
        await queryRunner.query(
            `UPDATE "events" SET "geocodeQuery" = lower(regexp_replace(btrim("location"), '\\s+', ' ', 'g')) WHERE "format" <> 'ONLINE'`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "events" DROP COLUMN "geocodeAfter"`);
        await queryRunner.query(`ALTER TABLE "events" DROP COLUMN "geocodeAttempts"`);
        await queryRunner.query(`ALTER TABLE "events" DROP COLUMN "geocodeLabel"`);
        await queryRunner.query(`ALTER TABLE "events" DROP COLUMN "longitude"`);
        await queryRunner.query(`ALTER TABLE "events" DROP COLUMN "latitude"`);
        await queryRunner.query(`ALTER TABLE "events" DROP COLUMN "geocodeQuery"`);
        await queryRunner.query(`ALTER TABLE "events" DROP COLUMN "geocodeStatus"`);
    }

}
