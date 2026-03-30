export const PLAN_LIMITS = {
  free: {
    maxJobs: 10,
    minIntervalMinutes: 60,
  },
  indie: {
    maxJobs: 100,
    minIntervalMinutes: 1,
  },
  pro: {
    maxJobs: Infinity,
    minIntervalMinutes: 1,
  },
} as const;

export type Plan = keyof typeof PLAN_LIMITS;

export function getPlanLimits(plan: Plan) {
  return PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;
}
