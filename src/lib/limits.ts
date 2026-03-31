export const PLAN_LIMITS = {
  free: {
    maxJobs: 10,
    minIntervalMinutes: 60,
    rateLimit: 10, // requests per minute
  },
  indie: {
    maxJobs: 100,
    minIntervalMinutes: 1,
    rateLimit: 60,
  },
  pro: {
    maxJobs: Infinity,
    minIntervalMinutes: 1,
    rateLimit: 300,
  },
} as const;

export type Plan = keyof typeof PLAN_LIMITS;

export function getPlanLimits(plan: Plan) {
  return PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;
}
