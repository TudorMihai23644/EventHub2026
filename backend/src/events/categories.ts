// Singura sursă pentru categoriile și formatele evenimentelor (valoare stabilă + eticheta în română).
// Frontend-ul le primește de la GET /events/categories; nu le scrie nicăieri de mână.

export const EVENT_CATEGORIES = [
  { value: 'CONCERT', label: 'Concert' },
  { value: 'CONFERINTA', label: 'Conferință' },
  { value: 'ATELIER', label: 'Atelier / Workshop' },
  { value: 'SPORT', label: 'Sport' },
  { value: 'TEATRU_FILM', label: 'Teatru și film' },
  { value: 'EXPOZITIE', label: 'Expoziție' },
  { value: 'COMUNITATE', label: 'Comunitate' },
  { value: 'ALTELE', label: 'Altele' },
] as const;

export type EventCategory = (typeof EVENT_CATEGORIES)[number]['value'];
export const CATEGORY_VALUES = EVENT_CATEGORIES.map((c) => c.value) as EventCategory[];
export const categoryLabel = (value: string) => EVENT_CATEGORIES.find((c) => c.value === value)?.label ?? 'Altele';

export const EVENT_FORMATS = [
  { value: 'PHYSICAL', label: 'Fizic' },
  { value: 'ONLINE', label: 'Online' },
  { value: 'HYBRID', label: 'Hibrid (fizic și online)' },
] as const;

export type EventFormat = (typeof EVENT_FORMATS)[number]['value'];
export const FORMAT_VALUES = EVENT_FORMATS.map((f) => f.value) as EventFormat[];

/** Unde are loc, așa cum se afișează (listă, calendar, emailuri). Linkul online NU apare aici. */
export function placeLabel(e: { format?: string | null; location: string }): string {
  if (e.format === 'ONLINE') return 'Online';
  if (e.format === 'HYBRID') return `${e.location} și online`;
  return e.location;
}

export const MAX_DURATION_DAYS = 14;
