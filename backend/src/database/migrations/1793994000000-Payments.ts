import { MigrationInterface, QueryRunner } from "typeorm";

export class Payments1793994000000 implements MigrationInterface {
    name = 'Payments1793994000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "payments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid, "eventId" uuid, "eventTitle" character varying(120) NOT NULL, "email" character varying NOT NULL, "amountCents" integer NOT NULL, "currency" character(3) NOT NULL DEFAULT 'RON', "status" character varying(16) NOT NULL DEFAULT 'PENDING', "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, "stripeSessionId" character varying(255), "checkoutUrl" character varying(1000), "paymentIntentId" character varying(255), "refundAttempts" integer NOT NULL DEFAULT '0', "refundAfter" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "lastError" character varying(500), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_197ab7af18c93fbb0c9b28b4a59" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_32b41cdb985a296213e9a928b5" ON "payments" ("status") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_f0f08bd86868e57e4c9718228c" ON "payments" ("stripeSessionId") WHERE "stripeSessionId" IS NOT NULL`);
        await queryRunner.query(`CREATE INDEX "IDX_70f5a98e741decbe1be96aec5a" ON "payments" ("eventId", "status") `);
        await queryRunner.query(`ALTER TABLE "events" ADD "priceCents" integer`);
        await queryRunner.query(`ALTER TABLE "payments" ADD CONSTRAINT "FK_d35cb3c13a18e1ea1705b2817b1" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "payments" ADD CONSTRAINT "FK_5b901b19ed973dd447a275cddaa" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "payments" DROP CONSTRAINT "FK_5b901b19ed973dd447a275cddaa"`);
        await queryRunner.query(`ALTER TABLE "payments" DROP CONSTRAINT "FK_d35cb3c13a18e1ea1705b2817b1"`);
        await queryRunner.query(`ALTER TABLE "events" DROP COLUMN "priceCents"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_70f5a98e741decbe1be96aec5a"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_f0f08bd86868e57e4c9718228c"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_32b41cdb985a296213e9a928b5"`);
        await queryRunner.query(`DROP TABLE "payments"`);
    }

}
