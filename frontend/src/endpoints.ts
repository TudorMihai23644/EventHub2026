// Toate URI-urile API-ului, într-un singur loc. Calea se adaugă la API_URL
// (ex. http://localhost:3000/api) în api.ts.
export const ENDPOINTS = {
  health: '/health',
  auth: {
    register: '/auth/register',
    login: '/auth/login',
    logout: '/auth/logout',
    me: '/auth/me',
  },
  events: {
    list: (query = '') => `/events${query ? `?${query}` : ''}`,
    create: '/events',
    one: (id: string) => `/events/${id}`, // GET, PATCH, DELETE
    mine: '/events/mine',
    summary: '/events/mine/summary',
    registrations: (id: string) => `/events/${id}/registrations`, // POST/DELETE participant, GET organizator
  },
  registrations: { mine: '/registrations/me' },
} as const;
