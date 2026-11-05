import { secret } from '../common/secrets';

export const MAIL_CONFIG = Symbol('MAIL_CONFIG');

export interface MailConfig {
  /** Cheia Resend. Lipsă → emailurile sunt doar scrise în log (LogMailer). */
  apiKey?: string;
  /** Expeditorul. `onboarding@resend.dev` livrează doar către adresa contului Resend. */
  from: string;
  /** Adresa frontend-ului, pentru linkurile din emailuri. */
  appUrl: string;
  /** Fusul orar al datelor din emailuri (containerul API rulează în UTC). */
  timeZone: string;
  /** Doar pentru teste: un server Resend fals, local. */
  resendBaseUrl?: string;
}

export function mailConfig(env: NodeJS.ProcessEnv = process.env): MailConfig {
  return {
    apiKey: secret('RESEND_API_KEY', false),
    from: env.MAIL_FROM?.trim() || 'EventHub <onboarding@resend.dev>',
    appUrl: (env.APP_URL?.trim() || 'http://localhost:5173').replace(/\/+$/, ''),
    timeZone: env.APP_TIMEZONE?.trim() || 'Europe/Bucharest',
    resendBaseUrl: env.RESEND_BASE_URL?.trim() || undefined,
  };
}
