import { Resend } from 'resend';
import { MailConfig } from './mail.config';
import { BatchResult, Mailer, MailerError, OutgoingEmail } from './mailer';

// Trimite prin API-ul Resend, endpointul batch (până la 100 de emailuri = o singură cerere).
export class ResendMailer extends Mailer {
  readonly name = 'resend';
  private readonly client: Resend;

  constructor(private readonly cfg: MailConfig) {
    super();
    this.client = new Resend(cfg.apiKey, cfg.resendBaseUrl ? { baseUrl: cfg.resendBaseUrl } : undefined);
  }

  async sendBatch(emails: OutgoingEmail[], idempotencyKey: string): Promise<BatchResult> {
    const payload = emails.map((e) => ({ from: this.cfg.from, to: e.to, subject: e.subject, html: e.html, text: e.text }));
    // „permissive”: o adresă invalidă nu blochează restul lotului; erorile vin pe index.
    // SDK-ul nu aruncă la erori HTTP, le întoarce în `error`.
    const res = await this.client.batch.send(payload, { idempotencyKey, batchValidation: 'permissive' });
    if (res.error) {
      const retryAfter = Number(res.headers?.['retry-after']);
      const status = res.error.statusCode ? ` (${res.error.statusCode})` : '';
      throw new MailerError(`${res.error.name}${status}: ${res.error.message}`, retryAfter > 0 ? retryAfter : undefined);
    }
    const errors = (res.data as { errors?: { index: number; message: string }[] }).errors ?? [];
    return { failed: errors.map((e) => ({ index: e.index, error: e.message })) };
  }
}
