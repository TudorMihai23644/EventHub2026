import { BadRequestException, ValidationError, ValidationPipe } from '@nestjs/common';

// Când un câmp încalcă mai multe reguli, se afișează un singur mesaj. Ordinea decoratorilor nu e un criteriu
// sigur (class-validator le raportează de jos în sus), deci întâi vin regulile „lipsește / tip greșit”:
// pentru o capacitate goală, utilizatorul vede „este obligatorie”, nu „maximul este 100.000”.
const REPORT_FIRST = ['isDefined', 'isString', 'isInt', 'isNumber', 'isBoolean', 'isEmail', 'isIso8601', 'isIn', 'isUuid'];

export function firstMessage(constraints: Record<string, string> = {}): string | undefined {
  const key = REPORT_FIRST.find((k) => k in constraints) ?? Object.keys(constraints)[0];
  return key ? constraints[key] : undefined;
}

// Erorile de validare returnează și un obiect `fields` ({ câmp: mesaj }),
// ca frontend-ul să le afișeze lângă fiecare câmp, fără reguli proprii.
export function validationErrors(errors: ValidationError[]) {
  const fields: Record<string, string> = {};
  for (const e of errors) {
    const msg = firstMessage(e.constraints);
    if (msg) fields[e.property] = msg;
  }
  return new BadRequestException({
    statusCode: 400,
    error: 'Bad Request',
    message: Object.values(fields),
    fields,
  });
}

// Același pipe în aplicație (main.ts) și în teste.
export function createValidationPipe() {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: validationErrors,
  });
}
