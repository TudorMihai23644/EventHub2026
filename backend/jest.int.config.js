// Teste de integrare: rulează pe un PostgreSQL real (npm run test:db:up), cu schema creată de migrări.
// Rulare: npm run test:int. `npm test` nu le include și nu are nevoie de bază de date.
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.int-spec\\.ts$',
  transform: { '^.+\\.ts$': 'ts-jest' },
  testEnvironment: 'node',
  testTimeout: 30000,
};
