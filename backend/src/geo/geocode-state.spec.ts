import { Event } from '../events/event.entity';
import { geocodeKey, mapView, refreshGeocodeState } from './geocode-state';

const ev = (over: Partial<Event> = {}) => ({ format: 'PHYSICAL', location: 'Sala Mare, Brașov', ...over }) as Event;

describe('starea hărții', () => {
  it('cheia: spații comprimate, litere mici (diacriticele rămân)', () => {
    expect(geocodeKey('  Str.  Lungă 1,\t BRAȘOV ')).toBe('str. lungă 1, brașov');
  });

  it('eveniment nou: PENDING, cu cheia locației', () => {
    const e = ev();
    refreshGeocodeState(e);
    expect(e).toMatchObject({ geocodeStatus: 'PENDING', geocodeQuery: 'sala mare, brașov', latitude: null, geocodeAttempts: 0 });
  });

  it('aceeași locație (altă scriere): rezultatul rămâne, fără o căutare nouă', () => {
    const e = ev({ location: 'sala  mare,  BRAȘOV', geocodeStatus: 'FOUND', geocodeQuery: 'sala mare, brașov', latitude: 45.6, longitude: 25.6 });
    refreshGeocodeState(e);
    expect(e).toMatchObject({ geocodeStatus: 'FOUND', latitude: 45.6 });
  });

  it('locație schimbată (și după FAILED): se caută din nou, punctul vechi dispare', () => {
    const e = ev({ location: 'Teatrul Sică Alexandrescu', geocodeStatus: 'FOUND', geocodeQuery: 'sala mare, brașov', latitude: 45.6, longitude: 25.6 });
    refreshGeocodeState(e);
    expect(e).toMatchObject({ geocodeStatus: 'PENDING', latitude: null, longitude: null });
  });

  it('online: SKIPPED; înapoi la fizic: PENDING', () => {
    const e = ev({ format: 'ONLINE', location: 'Online', geocodeStatus: 'FOUND', geocodeQuery: 'x', latitude: 1, longitude: 1 });
    refreshGeocodeState(e);
    expect(e).toMatchObject({ geocodeStatus: 'SKIPPED', geocodeQuery: null, latitude: null });
    Object.assign(e, { format: 'HYBRID', location: 'Cluj' });
    refreshGeocodeState(e);
    expect(e).toMatchObject({ geocodeStatus: 'PENDING', geocodeQuery: 'cluj' });
  });

  it('harta publică doar pentru un punct găsit, nu pentru online', () => {
    expect(mapView(ev({ geocodeStatus: 'FOUND', latitude: 45.65, longitude: 25.6 }))).toEqual({
      lat: 45.65, lng: 25.6,
      osmUrl: 'https://www.openstreetmap.org/?mlat=45.65&mlon=25.6#map=17/45.65/25.6',
      directionsUrl: 'https://www.google.com/maps/dir/?api=1&destination=45.65,25.6',
    });
    expect(mapView(ev({ geocodeStatus: 'NOT_FOUND', latitude: null, longitude: null }))).toBeNull();
    expect(mapView(ev({ geocodeStatus: 'PENDING', latitude: null, longitude: null }))).toBeNull();
    expect(mapView(ev({ format: 'ONLINE', geocodeStatus: 'FOUND', latitude: 1, longitude: 1 }))).toBeNull();
  });
});
