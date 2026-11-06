import { secret } from '../common/secrets';
import { appUrl, publicApiUrl } from '../common/urls';

export const MAIL_CONFIG = Symbol('MAIL_CONFIG');

export interface MailConfig {
  /** Cheia Resend. Lipsă → emailurile sunt doar scrise în log (LogMailer). */
  apiKey?: string;
  /** Expeditorul. `onboarding@resend.dev` livrează doar către adresa contului Resend. */
  from: string;
  /** Adresa frontend-ului, pentru linkurile din emailuri. */
  appUrl: string;
  /** Adresa publică a API-ului (cu /api), pentru linkurile .ics din emailuri. Lipsă = fără link .ics. */
  apiUrl?: string;
  /** Fusul orar al datelor din emailuri (containerul API rulează în UTC). */
  timeZone: string;
  /** Doar pentru teste: un server Resend fals, local. */
  resendBaseUrl?: string;
}

export function mailConfig(env: NodeJS.ProcessEnv = process.env): MailConfig {
  return {
    apiKey: secret('RESEND_API_KEY', false),
    from: env.MAIL_FROM?.trim() || 'EventHub <onboarding@resend.dev>',
    appUrl: appUrl(env),
    apiUrl: publicApiUrl(env),
    timeZone: env.APP_TIMEZONE?.trim() || 'Europe/Bucharest',
    resendBaseUrl: env.RESEND_BASE_URL?.trim() || undefined,
  };
}
