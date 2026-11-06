import type { Event } from '../events/event.entity';

/**
 * Starea localizării pe hartă a unui eveniment:
 *  - PENDING: de căutat (worker-ul o ia la următorul ciclu, după `geocodeAfter`);
 *  - FOUND / NOT_FOUND: rezultatul căutării (NOT_FOUND = adresa nu există în OpenStreetMap);
 *  - FAILED: serverul n-a răspuns de prea multe ori; se reia la următoarea modificare a locației;
 *  - SKIPPED: eveniment doar online, nu are hartă.
 */
export type GeocodeStatus = 'PENDING' | 'FOUND' | 'NOT_FOUND' | 'FAILED' | 'SKIPPED';

/** Cheia de căutare și de cache: „  Str. Lungă 1,  Brașov ” și „str. lungă 1, brașov” sunt aceeași adresă. */
export const geocodeKey = (location: string) => location.trim().replace(/\s+/g, ' ').toLowerCase();

/** La creare / editare: se caută din nou doar dacă s-a schimbat locația (sau formatul). */
export function refreshGeocodeState(e: Event) {
  if (e.format === 'ONLINE') {
    Object.assign(e, { geocodeStatus: 'SKIPPED', geocodeQuery: null, latitude: null, longitude: null, geocodeLabel: null, geocodeAttempts: 0 });
    return;
  }
  const key = geocodeKey(e.location);
  if (e.geocodeQuery === key && e.geocodeStatus && e.geocodeStatus !== 'SKIPPED') return;
  Object.assign(e, {
    geocodeStatus: 'PENDING', geocodeQuery: key, latitude: null, longitude: null, geocodeLabel: null, geocodeAttempts: 0, geocodeAfter: new Date(),
  });
}

/** Ce vede publicul: punctul pe hartă și linkuri externe (OpenStreetMap, indicații Google Maps). */
export function mapView(e: Pick<Event, 'format' | 'geocodeStatus' | 'latitude' | 'longitude'>) {
  if (e.format === 'ONLINE' || e.geocodeStatus !== 'FOUND' || e.latitude == null || e.longitude == null) return null;
  const [lat, lng] = [Number(e.latitude), Number(e.longitude)];
  return {
    lat,
    lng,
    osmUrl: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`,
    directionsUrl: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
  };
}
