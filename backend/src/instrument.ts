// Importat primul în main.ts (după .env): Sentry trebuie pornit înaintea modulelor pe care le urmărește (http, express).
import * as Sentry from '@sentry/nestjs';
import { sentryOptions } from './observability/sentry';

const options = sentryOptions();
if (options) Sentry.init(options);
