// Prețul din formular: organizatorul scrie lei, API-ul primește bani (4990 = 49,90 lei).

/** „49,90” sau „49.90” lei → 4990; gol → null (gratuit); text care nu e număr → NaN. */
export const toCents = (lei: string) => (lei.trim() === '' ? null : Math.round(Number(lei.trim().replace(',', '.')) * 100));

/** 4990 → „49,90”; 4900 → „49”; null → „” (pentru câmpul de editare). */
export const toLei = (cents: number | null) => (cents ? (cents / 100).toFixed(2).replace('.', ',').replace(',00', '') : '');
