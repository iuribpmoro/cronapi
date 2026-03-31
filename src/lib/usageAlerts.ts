import { db } from '../db/client';
import { getPlanLimits } from './limits';
import { sendEmail, usageAlertEmail } from './email';

/**
 * After a job is created, check if the user has crossed 80% or 100% of their
 * job quota and send a one-per-month alert email for each threshold.
 * Fire-and-forget — never throws.
 */
export function checkUsageAndAlert(userId: string, userEmail: string, plan: string): void {
  _check(userId, userEmail, plan).catch(() => {});
}

async function _check(userId: string, userEmail: string, plan: string): Promise<void> {
  const limits = getPlanLimits(plan as any);
  if (limits.maxJobs === Infinity) return; // pro plan has no cap

  const countResult = await db.query<{ count: string }>(
    'SELECT COUNT(*) as count FROM jobs WHERE user_id = $1',
    [userId]
  );
  const jobCount = parseInt(countResult.rows[0]?.count ?? '0');
  const pct = Math.round((jobCount / limits.maxJobs) * 100);

  if (pct < 80) return;

  const currentMonth = new Date().toISOString().slice(0, 7); // "2026-03"

  const userRow = await db.query<{ alert_80_sent_month: string | null; alert_100_sent_month: string | null }>(
    'SELECT alert_80_sent_month, alert_100_sent_month FROM users WHERE id = $1',
    [userId]
  );
  const row = userRow.rows[0];
  if (!row) return;

  if (pct >= 100 && row.alert_100_sent_month !== currentMonth) {
    const { subject, html } = usageAlertEmail({ email: userEmail, plan, jobCount, jobLimit: limits.maxJobs, pct: 100 });
    await sendEmail({ to: userEmail, subject, html });
    await db.query('UPDATE users SET alert_100_sent_month=$1 WHERE id=$2', [currentMonth, userId]);
  } else if (pct >= 80 && row.alert_80_sent_month !== currentMonth) {
    const { subject, html } = usageAlertEmail({ email: userEmail, plan, jobCount, jobLimit: limits.maxJobs, pct });
    await sendEmail({ to: userEmail, subject, html });
    await db.query('UPDATE users SET alert_80_sent_month=$1 WHERE id=$2', [currentMonth, userId]);
  }
}
