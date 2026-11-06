import { MigrationInterface, QueryRunner } from "typeorm";

export class GoogleSignIn1793993000000 implements MigrationInterface {
    name = 'GoogleSignIn1793993000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" ADD "googleId" character varying(255)`);
        await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "UQ_f382af58ab36057334fb262efd5" UNIQUE ("googleId")`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "passwordHash" DROP NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Scris de mână: conturile create cu Google n-au parolă. „!” nu e un hash bcrypt valid, deci nu se poate ghici;
        // după revenire, acești utilizatori își setează o parolă cu „Ai uitat parola?”.
        await queryRunner.query(`UPDATE "users" SET "passwordHash" = '!' WHERE "passwordHash" IS NULL`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "passwordHash" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "UQ_f382af58ab36057334fb262efd5"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "googleId"`);
    }

}
