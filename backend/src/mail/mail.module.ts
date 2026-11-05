import { Logger, Module } from '@nestjs/common';
import { MAIL_CONFIG, MailConfig, mailConfig } from './mail.config';
import { Mailer } from './mailer';
import { ResendMailer } from './resend.mailer';
import { LogMailer } from './log.mailer';
import { Notifications } from './notifications.service';
import { OutboxWorker } from './outbox.worker';

export function createMailer(cfg: MailConfig): Mailer {
  if (cfg.apiKey) return new ResendMailer(cfg);
  new Logger('Mail').warn('RESEND_API_KEY lipsește: emailurile sunt doar scrise în log, nu se trimit.');
  return new LogMailer();
}

@Module({
  providers: [
    { provide: MAIL_CONFIG, useFactory: () => mailConfig() },
    { provide: Mailer, useFactory: createMailer, inject: [MAIL_CONFIG] },
    Notifications,
    OutboxWorker,
  ],
  exports: [Notifications],
})
export class MailModule {}
