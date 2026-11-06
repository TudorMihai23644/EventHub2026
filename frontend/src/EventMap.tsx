import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MAP_ATTRIBUTION, MAP_TILES_URL } from './config';

/**
 * Harta locului (Leaflet + plăci OpenStreetMap). Se încarcă separat (React.lazy), doar pe pagina unui eveniment cu hartă.
 * Marcajul e desenat în CSS (fără imaginile implicite Leaflet, care se pierd la build). Rotița nu mărește harta
 * decât după un clic, ca derularea paginii să nu fie „prinsă” de hartă.
 */
export default function EventMap({ lat, lng, label }: { lat: number; lng: number; label: string }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!box.current) return;
    const map = L.map(box.current, { center: [lat, lng], zoom: 16, scrollWheelZoom: false, attributionControl: true });
    L.tileLayer(MAP_TILES_URL, { maxZoom: 19, attribution: MAP_ATTRIBUTION }).addTo(map);
    const pin = L.divIcon({ className: 'map-pin', html: '<span></span>', iconSize: [28, 28], iconAnchor: [14, 14] });
    L.marker([lat, lng], { icon: pin, title: label, keyboard: false }).addTo(map);
    map.on('click', () => map.scrollWheelZoom.enable());
    map.on('mouseout', () => map.scrollWheelZoom.disable());
    return () => { map.remove(); };
  }, [lat, lng, label]);
  return <div ref={box} className="event-map" role="region" aria-label={`Hartă: ${label}`} />;
}
