// ESLint: regulile recomandate pentru JS și TypeScript. Excepțiile de mai jos sunt alegeri ale proiectului, nu scurtături.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  // migrările sunt generate de TypeORM (stilul lor), dist e compilat
  { ignores: ['dist/**', 'node_modules/**', 'src/database/migrations/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node, ...globals.jest } },
    rules: {
      // testele simulează EntityManager / Request cu `any`; în cod, tipurile vin din TypeORM / Express
      '@typescript-eslint/no-explicit-any': 'off',
      // `_parametru`: necesar pentru semnătură (ex. callback-uri class-validator), nefolosit intenționat
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
);
