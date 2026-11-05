import { MigrationInterface, QueryRunner } from 'typeorm';

// Idee 11, partea 2: imaginea de copertă. Se salvează doar cheile și adresele celor două variante WebP
// ({ storage, large: { key, url }, small: { key, url } }); fișierele sunt pe disc sau pe Cloudinary.
export class AddEventCover1793909598928 implements MigrationInterface {
  name = 'AddEventCover1793909598928';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "events" ADD "coverImage" jsonb`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "events" DROP COLUMN "coverImage"`);
  }
}
