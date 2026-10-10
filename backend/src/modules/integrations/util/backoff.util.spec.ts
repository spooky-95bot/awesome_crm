// src/modules/integrations/util/backoff.util.spec.ts
import {
  BACKOFF_SCHEDULE_SEC,
  computeNextRetry,
  MAX_ATTEMPTS,
} from './backoff.util';

describe('computeNextRetry (U-5.4)', () => {
  const now = 1_000_000_000;

  it('premier échec → premier backoff (60s)', () => {
    const next = computeNextRetry(1, now);
    expect(next).not.toBeNull();
    expect((next as Date).getTime()).toBe(now + BACKOFF_SCHEDULE_SEC[1] * 1000);
  });

  it('artan denemelerde artan gecikme', () => {
    const a = computeNextRetry(1, now)!.getTime();
    const b = computeNextRetry(2, now)!.getTime();
    expect(b).toBeGreaterThan(a);
  });

  it('denemeler tükenince null (→ DEAD)', () => {
    expect(computeNextRetry(MAX_ATTEMPTS, now)).toBeNull();
    expect(computeNextRetry(MAX_ATTEMPTS + 1, now)).toBeNull();
  });
});
