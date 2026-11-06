import { MigrationInterface, QueryRunner } from 'typeorm';

// Coloanele `createdAt` din prima schemă erau TIMESTAMP fără fus orar. PostgreSQL le scria în UTC (fusul sesiunii),
// dar driverul `pg` din Node le citește ca oră LOCALĂ a calculatorului pe care rulează API-ul: pe un calculator
// setat pe București, orele de înscriere ieșeau cu 2 ore greșite (CSV, statistici pe zile, memento).
// Scrisă de mână, nu generată: TypeORM ar fi făcut DROP + ADD COLUMN și ar fi pierdut toate datele.
// USING ... AT TIME ZONE 'UTC': valorile existente sunt interpretate ca UTC (cum au fost scrise).
const TABLES = ['users', 'events', 'registrations'];

export class CreatedAtWithTimeZone1793990000000 implements MigrationInterface {
  name = 'CreatedAtWithTimeZone1793990000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const t of TABLES) {
      await queryRunner.query(`ALTER TABLE "${t}" ALTER COLUMN "createdAt" TYPE TIMESTAMP WITH TIME ZONE USING "createdAt" AT TIME ZONE 'UTC'`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const t of TABLES) {
      await queryRunner.query(`ALTER TABLE "${t}" ALTER COLUMN "createdAt" TYPE TIMESTAMP WITHOUT TIME ZONE USING "createdAt" AT TIME ZONE 'UTC'`);
    }
  }
}
