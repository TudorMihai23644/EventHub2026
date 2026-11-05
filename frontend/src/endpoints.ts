// Toate URI-urile API-ului, într-un singur loc. Calea se adaugă la API_URL
// (ex. http://localhost:3000/api) în api.ts.
export const ENDPOINTS = {
  health: '/health',
  auth: {
    register: '/auth/register',
    login: '/auth/login',
    logout: '/auth/logout',
    logoutAll: '/auth/logout-all',
    refresh: '/auth/refresh',
    me: '/auth/me',
    forgotPassword: '/auth/password/forgot',
    resetPassword: '/auth/password/reset',
    verifyEmail: '/auth/email/verify',
    resendVerification: '/auth/email/resend',
  },
  events: {
    list: (query = '') => `/events${query ? `?${query}` : ''}`,
    create: '/events',
    categories: '/events/categories',
    one: (id: string) => `/events/${id}`, // GET, PATCH, DELETE
    mine: '/events/mine',
    summary: '/events/mine/summary',
    registrations: (id: string) => `/events/${id}/registrations`, // POST/DELETE participant, GET organizator
    waitlist: (id: string) => `/events/${id}/waitlist`, // POST/DELETE participant, GET organizator
    cover: (id: string) => `/events/${id}/cover`, // POST (multipart, câmpul „file”) / DELETE, organizatorul
  },
  registrations: { mine: '/registrations/me' },
  waitlist: { mine: '/waitlist/me' },
} as const;
