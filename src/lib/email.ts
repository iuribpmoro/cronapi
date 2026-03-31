/**
 * Email sending via Resend REST API.
 * Set RESEND_API_KEY env var to enable. If missing, emails are silently skipped.
 * FROM_EMAIL defaults to "CronAPI <noreply@cronapi.io>" (update once domain is verified).
 */

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL ?? 'CronAPI <noreply@cronapi.io>';

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  if (!RESEND_API_KEY) return;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error('email_send_failed', { status: res.status, body });
  }
}

export function usageAlertEmail(opts: {
  email: string;
  plan: string;
  jobCount: number;
  jobLimit: number;
  pct: number;
}): { subject: string; html: string } {
  const isAtLimit = opts.pct >= 100;
  const subject = isAtLimit
    ? `You've reached your CronAPI job limit`
    : `You're using ${opts.pct}% of your CronAPI job limit`;

  const html = `
<!DOCTYPE html>
<html>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f5f5;margin:0;padding:24px;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:8px;padding:32px;border:1px solid #e5e5e5;">
    <h2 style="color:#1a1a2e;margin-top:0;">
      ${isAtLimit ? '🚫 Job limit reached' : '⚠️ Approaching job limit'}
    </h2>
    <p style="color:#374151;">
      ${isAtLimit
        ? `You've used all <strong>${opts.jobLimit} jobs</strong> on your <strong>${opts.plan}</strong> plan. New jobs cannot be created until you upgrade.`
        : `You're using <strong>${opts.jobCount} of ${opts.jobLimit} jobs</strong> (${opts.pct}%) on your <strong>${opts.plan}</strong> plan.`
      }
    </p>
    <p style="color:#374151;">Upgrade your plan to add more jobs and unlock higher rate limits.</p>
    <a href="https://cronapi-7b98.onrender.com/dashboard/billing"
       style="display:inline-block;background:#4f6ef7;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;margin-top:8px;">
      Upgrade now →
    </a>
    <p style="color:#9ca3af;font-size:12px;margin-top:24px;">
      You're receiving this because you have a CronAPI account. Manage your account at
      <a href="https://cronapi-7b98.onrender.com/dashboard" style="color:#4f6ef7;">cronapi-7b98.onrender.com</a>.
    </p>
  </div>
</body>
</html>`;

  return { subject, html };
}
