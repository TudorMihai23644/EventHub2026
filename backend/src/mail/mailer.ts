// Interfața de trimitere. Implementări: ResendMailer (real) și LogMailer (fără cheie: doar log).

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/** Cererea a fost acceptată; `failed` = emailurile respinse individual (ex. adresă invalidă), după index. */
export interface BatchResult {
  failed: { index: number; error: string }[];
}

/** Toată cererea a eșuat (rețea, 429, 5xx, cheie greșită): toate emailurile se reîncearcă mai târziu. */
export class MailerError extends Error {
  constructor(message: string, public readonly retryAfterSeconds?: number) {
    super(message);
  }
}

// Clasă abstractă (nu interfață) ca să poată fi folosită ca token de injecție în Nest.
export abstract class Mailer {
  abstract readonly name: string;
  /** `idempotencyKey`: aceeași cheie trimisă din nou nu produce emailuri duble. */
  abstract sendBatch(emails: OutgoingEmail[], idempotencyKey: string): Promise<BatchResult>;
}
