// Toate URI-urile API-ului, într-un singur loc. Calea se adaugă la API_URL
// (ex. http://localhost:5200/api) în api.ts.
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
    options: '/auth/options', // { google, turnstileSiteKey }
    google: '/auth/google', // navigare (nu fetch): pleacă la Google și se întoarce în /autentificare-google
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
    past: (query = '') => `/events/past${query ? `?${query}` : ''}`,
    attendeesCsv: (id: string) => `/events/${id}/registrations.csv`,
    stats: (id: string) => `/events/${id}/stats`,
    checkout: (id: string) => `/events/${id}/checkout`, // POST → { url } (pagina de plată Stripe)
    attendance: (id: string, registrationId: string) => `/events/${id}/attendance/${registrationId}`, // PUT { present }
  },
  checkIn: '/check-in', // POST { code }, organizatorul
  registrations: { mine: '/registrations/me' },
  waitlist: { mine: '/waitlist/me' },
  account: { profile: '/account', password: '/account/password' }, // PATCH profil, POST parolă, DELETE cont
} as const;
