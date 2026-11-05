import { Logger } from '@nestjs/common';
import { BatchResult, Mailer, OutgoingEmail } from './mailer';

// Folosit automat când nu există RESEND_API_KEY: nu trimite nimic, doar scrie în log.
// Astfel dezvoltarea locală și testele nu pot trimite emailuri reale din greșeală.
export class LogMailer extends Mailer {
  readonly name = 'log';
  private readonly logger = new Logger('LogMailer');

  async sendBatch(emails: OutgoingEmail[]): Promise<BatchResult> {
    for (const e of emails) this.logger.log(`[nu se trimite] către ${e.to}: ${e.subject}`);
    return { failed: [] };
  }
}
