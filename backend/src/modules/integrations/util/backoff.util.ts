// src/modules/integrations/util/backoff.util.ts
// Üstel geri çekilme (backoff): 1m, 5m, 30m, 2h, 6h. Tükenince null → DEAD.
// Pur : now (ms) passé en paramètre (testabilité).
export const BACKOFF_SCHEDULE_SEC = [60, 300, 1800, 7200, 21600];
export const MAX_ATTEMPTS = BACKOFF_SCHEDULE_SEC.length;

// attemptsMade : nombre de tentatives échouées jusqu'ici (1 = première tentative échouée).
// Renvoie l'heure de la prochaine tentative ; null si épuisé (→ DEAD).
export function computeNextRetry(
  attemptsMade: number,
  nowMs: number,
): Date | null {
  if (attemptsMade >= MAX_ATTEMPTS) {
    return null;
  }
  const delaySec = BACKOFF_SCHEDULE_SEC[attemptsMade];
  return new Date(nowMs + delaySec * 1000);
}
