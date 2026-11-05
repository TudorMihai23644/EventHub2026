// Registrul tuturor URI-urilor API-ului. Controllerele le folosesc de aici;
// nicio rută nu este scrisă direct într-un decorator.
export const API_PREFIX = 'api';

export const ROUTES = {
  health: 'health',
  auth: {
    base: 'auth', register: 'register', login: 'login', logout: 'logout', me: 'me',
    refresh: 'refresh', logoutAll: 'logout-all',
    forgotPassword: 'password/forgot', resetPassword: 'password/reset',
    verifyEmail: 'email/verify', resendVerification: 'email/resend',
  },
  events: {
    base: 'events',
    mine: 'mine',
    summary: 'mine/summary',
    one: ':id',
    registrations: ':id/registrations',
    waitlist: ':id/waitlist',
    calendar: ':id/calendar.ics',
  },
  registrations: { base: 'registrations', mine: 'me' },
  waitlist: { base: 'waitlist', mine: 'me' },
} as const;
