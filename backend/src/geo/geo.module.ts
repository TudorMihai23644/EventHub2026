import { Module } from '@nestjs/common';
import { GEO_CONFIG, GeoConfig, Geocoder, NominatimGeocoder, geoConfig } from './geocoder';
import { GeocodingWorker } from './geocoding.worker';

// Locația evenimentelor pe hartă: Nominatim (OpenStreetMap), apelat doar din worker, în fundal.
@Module({
  providers: [
    { provide: GEO_CONFIG, useFactory: () => geoConfig() },
    { provide: Geocoder, useFactory: (cfg: GeoConfig) => new NominatimGeocoder(cfg), inject: [GEO_CONFIG] },
    GeocodingWorker,
  ],
})
export class GeoModule {}
