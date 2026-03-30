import { describe, it, expect } from 'vitest';
import { getPlanLimits, PLAN_LIMITS } from '../lib/limits';

describe('getPlanLimits', () => {
  it('returns free plan limits', () => {
    const limits = getPlanLimits('free');
    expect(limits.maxJobs).toBe(10);
    expect(limits.minIntervalMinutes).toBe(60);
  });

  it('returns indie plan limits', () => {
    const limits = getPlanLimits('indie');
    expect(limits.maxJobs).toBe(100);
    expect(limits.minIntervalMinutes).toBe(1);
  });

  it('returns pro plan limits', () => {
    const limits = getPlanLimits('pro');
    expect(limits.maxJobs).toBe(Infinity);
    expect(limits.minIntervalMinutes).toBe(1);
  });

  it('falls back to free plan for unknown plan', () => {
    const limits = getPlanLimits('unknown' as any);
    expect(limits).toEqual(PLAN_LIMITS.free);
  });

  it('free plan maxJobs is less than indie plan maxJobs', () => {
    expect(getPlanLimits('free').maxJobs).toBeLessThan(getPlanLimits('indie').maxJobs);
  });

  it('free plan has stricter interval than indie and pro', () => {
    expect(getPlanLimits('free').minIntervalMinutes).toBeGreaterThan(getPlanLimits('indie').minIntervalMinutes);
  });
});
