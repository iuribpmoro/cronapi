import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { validateApiKey } from '../lib/apiKeys';
import { db } from '../db/client';
import { runJob } from '../lib/executeJob';
import { getPlanLimits } from '../lib/limits';
import { logConversionEvent } from '../lib/usageTracking';
import { checkUsageAndAlert } from '../lib/usageAlerts';
import Stripe from 'stripe';
import cronParser from 'cron-parser';

// ── helpers ──────────────────────────────────────────────────────────────────

const COOKIE_NAME = 'dashboard_key';
const COOKIE_OPTS = { path: '/', httpOnly: true, sameSite: 'lax' as const, maxAge: 60 * 60 * 24 * 7 };

async function getSessionUser(request: FastifyRequest) {
  const raw = request.cookies?.[COOKIE_NAME];
  if (!raw) return null;
  const validated = await validateApiKey(raw).catch(() => null);
  if (!validated) return null;
  const row = await db.query<{ email: string; plan: string; onboarding_completed: boolean }>(
    'SELECT email, plan, onboarding_completed FROM users WHERE id = $1',
    [validated.userId]
  ).then(r => r.rows[0]).catch(() => null);
  if (!row) return null;
  return { userId: validated.userId, keyId: validated.keyId, email: row.email, plan: row.plan, onboardingCompleted: row.onboarding_completed };
}

function requireAuth(handler: (request: FastifyRequest, reply: FastifyReply, user: NonNullable<Awaited<ReturnType<typeof getSessionUser>>>) => Promise<void>) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await getSessionUser(request);
    if (!user) {
      return reply.redirect('/dashboard/login');
    }
    return handler(request, reply, user);
  };
}

function nextRunAt(expr: string): Date {
  const interval = cronParser.parseExpression(expr);
  return interval.next().toDate();
}

function fmt(d: Date | string | null) {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function statusBadge(enabled: boolean) {
  return enabled
    ? `<span class="badge badge-active">Active</span>`
    : `<span class="badge badge-paused">Paused</span>`;
}

function execStatusBadge(status: string) {
  const cls = status === 'success' ? 'badge-active' : status === 'running' ? 'badge-warning' : 'badge-error';
  return `<span class="badge ${cls}">${status}</span>`;
}

// ── layout ───────────────────────────────────────────────────────────────────

function layout(title: string, body: string, user?: { email: string; plan: string }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} — CronAPI Dashboard</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; color: #222; font-size: 14px; }
    a { color: #4f6ef7; text-decoration: none; }
    a:hover { text-decoration: underline; }
    nav { background: #1a1a2e; color: #fff; display: flex; align-items: center; justify-content: space-between; padding: 0 24px; height: 52px; }
    nav .brand { font-weight: 700; font-size: 16px; color: #fff; letter-spacing: 0.5px; }
    nav .brand span { color: #818cf8; }
    nav .nav-right { display: flex; align-items: center; gap: 16px; font-size: 13px; color: #aaa; }
    nav .nav-right a { color: #818cf8; }
    .container { max-width: 1100px; margin: 0 auto; padding: 24px 16px; }
    h1 { font-size: 20px; font-weight: 600; margin-bottom: 20px; }
    h2 { font-size: 16px; font-weight: 600; margin-bottom: 12px; }
    .card { background: #fff; border: 1px solid #e5e5e5; border-radius: 8px; padding: 20px; margin-bottom: 16px; }
    .btn { display: inline-flex; align-items: center; gap: 6px; padding: 7px 14px; border-radius: 6px; font-size: 13px; font-weight: 500; cursor: pointer; border: none; text-decoration: none; }
    .btn-primary { background: #4f6ef7; color: #fff; }
    .btn-primary:hover { background: #3a55d4; text-decoration: none; }
    .btn-danger { background: #ef4444; color: #fff; }
    .btn-danger:hover { background: #dc2626; text-decoration: none; }
    .btn-secondary { background: #e5e7eb; color: #374151; }
    .btn-secondary:hover { background: #d1d5db; text-decoration: none; }
    .btn-sm { padding: 4px 10px; font-size: 12px; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; padding: 10px 12px; font-size: 12px; text-transform: uppercase; color: #666; border-bottom: 1px solid #e5e5e5; }
    td { padding: 11px 12px; border-bottom: 1px solid #f0f0f0; vertical-align: top; }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: #fafafa; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; text-transform: uppercase; }
    .badge-active { background: #dcfce7; color: #16a34a; }
    .badge-paused { background: #f3f4f6; color: #6b7280; }
    .badge-error { background: #fee2e2; color: #dc2626; }
    .badge-warning { background: #fef9c3; color: #ca8a04; }
    .form-group { margin-bottom: 14px; }
    label { display: block; font-size: 13px; font-weight: 500; margin-bottom: 4px; color: #374151; }
    input, select, textarea { width: 100%; padding: 8px 10px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 13px; background: #fff; }
    input:focus, select:focus, textarea:focus { outline: none; border-color: #4f6ef7; box-shadow: 0 0 0 2px rgba(79,110,247,0.15); }
    textarea { font-family: monospace; resize: vertical; min-height: 80px; }
    .form-hint { font-size: 11px; color: #9ca3af; margin-top: 3px; }
    .error-msg { background: #fee2e2; border: 1px solid #fca5a5; color: #dc2626; padding: 10px 14px; border-radius: 6px; margin-bottom: 16px; font-size: 13px; }
    .success-msg { background: #dcfce7; border: 1px solid #86efac; color: #16a34a; padding: 10px 14px; border-radius: 6px; margin-bottom: 16px; font-size: 13px; }
    .page-actions { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
    .page-actions h1 { margin-bottom: 0; }
    .stat-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; margin-bottom: 20px; }
    .stat-card { background: #fff; border: 1px solid #e5e5e5; border-radius: 8px; padding: 16px; }
    .stat-label { font-size: 11px; text-transform: uppercase; color: #9ca3af; font-weight: 600; margin-bottom: 6px; }
    .stat-value { font-size: 24px; font-weight: 700; color: #1a1a2e; }
    .stat-sub { font-size: 12px; color: #6b7280; margin-top: 2px; }
    .code { font-family: monospace; background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-size: 12px; }
    .empty-state { text-align: center; padding: 48px 24px; color: #9ca3af; }
    .empty-state p { margin-bottom: 16px; }
    .flex-gap { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .back-link { font-size: 13px; color: #6b7280; margin-bottom: 16px; display: block; }
    .section-title { font-size: 13px; font-weight: 600; text-transform: uppercase; color: #9ca3af; letter-spacing: 0.5px; margin: 24px 0 10px; }
    .filter-row { display: flex; gap: 8px; margin-bottom: 12px; align-items: center; }
    .filter-row select, .filter-row input { width: auto; }
    .truncate { max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  </style>
</head>
<body>
  <nav>
    <a href="/dashboard" class="brand">Cron<span>API</span> Dashboard</a>
    <div class="nav-right">
      <a href="/api/docs" target="_blank" rel="noopener">API Docs</a>
      ${user ? `<span>${user.email}</span>
      <span class="badge badge-active" style="text-transform:capitalize;">${user.plan}</span>
      <a href="/dashboard/usage">Usage</a>
      <a href="/dashboard/billing">Billing</a>
      <a href="/dashboard/logout">Logout</a>` : ''}
    </div>
  </nav>
  <div class="container">
    ${body}
  </div>
</body>
</html>`;
}

// ── pages ─────────────────────────────────────────────────────────────────────

function loginPage(error?: string) {
  return layout('Login', `
    <div style="max-width:420px;margin:60px auto;">
      <h1 style="text-align:center;margin-bottom:8px;">Sign in to Dashboard</h1>
      <p style="text-align:center;color:#6b7280;margin-bottom:24px;font-size:13px;">Enter your CronAPI key to continue</p>
      ${error ? `<div class="error-msg">${error}</div>` : ''}
      <div class="card">
        <form method="POST" action="/dashboard/login">
          <div class="form-group">
            <label for="apiKey">API Key</label>
            <input type="password" id="apiKey" name="apiKey" placeholder="ck_live_..." required autocomplete="current-password" />
            <div class="form-hint">Your CronAPI key starting with <code>ck_live_</code></div>
          </div>
          <button type="submit" class="btn btn-primary" style="width:100%;justify-content:center;">Sign in</button>
        </form>
      </div>
      <p style="text-align:center;font-size:12px;color:#9ca3af;margin-top:16px;">
        Don't have an account? Use <a href="/api/v1/auth/register">the API</a> to register.
      </p>
    </div>
  `);
}

function jobsListPage(jobs: any[], user: { email: string; plan: string }, flash?: string, usage?: { jobCount: number; jobLimit: number | null; execThisMonth: number }) {
  const rows = jobs.length === 0
    ? `<tr><td colspan="6" class="empty-state" style="padding:40px;text-align:center;color:#9ca3af;">
         No jobs yet. <a href="/dashboard/jobs/new">Create your first job →</a>
       </td></tr>`
    : jobs.map(j => `
      <tr>
        <td><a href="/dashboard/jobs/${j.id}">${escapeHtml(j.name)}</a></td>
        <td>${statusBadge(j.enabled)}</td>
        <td><code class="code">${escapeHtml(j.cron_expression)}</code></td>
        <td class="truncate"><span title="${escapeHtml(j.endpoint_url)}">${escapeHtml(j.endpoint_url)}</span></td>
        <td style="color:#6b7280;font-size:12px;">${fmt(j.next_run_at)}</td>
        <td>
          <div class="flex-gap">
            <a href="/dashboard/jobs/${j.id}" class="btn btn-secondary btn-sm">View</a>
            <a href="/dashboard/jobs/${j.id}/edit" class="btn btn-secondary btn-sm">Edit</a>
            <form method="POST" action="/dashboard/jobs/${j.id}/toggle" style="display:inline;">
              <button type="submit" class="btn btn-secondary btn-sm">${j.enabled ? 'Pause' : 'Resume'}</button>
            </form>
            <form method="POST" action="/dashboard/jobs/${j.id}/trigger" style="display:inline;">
              <button type="submit" class="btn btn-secondary btn-sm">Run now</button>
            </form>
          </div>
        </td>
      </tr>`).join('');

  let upgradeBanner = '';
  if (usage && usage.jobLimit) {
    const pct = Math.round((usage.jobCount / usage.jobLimit) * 100);
    if (pct >= 80) {
      upgradeBanner = `
        <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:14px 16px;margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;gap:12px;">
          <div>
            <strong style="color:#92400e;">⚠ You're using ${pct}% of your job limit</strong>
            <span style="color:#78350f;font-size:13px;margin-left:8px;">${usage.jobCount} / ${usage.jobLimit} jobs on the <strong>${user.plan}</strong> plan</span>
          </div>
          <a href="/dashboard/billing" class="btn btn-primary btn-sm">Upgrade plan →</a>
        </div>`;
    }
  }

  let usageBar = '';
  if (usage && usage.jobLimit) {
    const pct = Math.min(100, Math.round((usage.jobCount / usage.jobLimit) * 100));
    usageBar = `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;background:#fff;border:1px solid #e5e5e5;border-radius:8px;padding:12px 16px;">
        <div style="flex:1;">
          <div style="font-size:12px;color:#6b7280;margin-bottom:4px;">Jobs: ${usage.jobCount} / ${usage.jobLimit} &nbsp;·&nbsp; Executions this month: ${usage.execThisMonth.toLocaleString()}</div>
          <div style="background:#e5e7eb;border-radius:4px;height:6px;overflow:hidden;">
            <div style="background:${pct >= 80 ? '#f59e0b' : '#4f6ef7'};width:${pct}%;height:100%;border-radius:4px;"></div>
          </div>
        </div>
        <a href="/dashboard/billing" style="font-size:12px;color:#4f6ef7;white-space:nowrap;">View plan →</a>
      </div>`;
  }

  return layout('Jobs', `
    ${flash ? `<div class="success-msg">${flash}</div>` : ''}
    ${upgradeBanner}
    ${usageBar}
    <div class="page-actions">
      <h1>Jobs (${jobs.length})</h1>
      <a href="/dashboard/jobs/new" class="btn btn-primary">+ New Job</a>
    </div>
    <div class="card" style="padding:0;overflow:hidden;">
      <table>
        <thead><tr>
          <th>Name</th><th>Status</th><th>Schedule</th><th>Endpoint</th><th>Next Run</th><th>Actions</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `, user);
}

function jobDetailPage(job: any, executions: any[], stats: any, user: { email: string; plan: string }, flash?: string, deliveryAttempts?: any[], dlqItems?: any[]) {
  const execRows = executions.length === 0
    ? `<tr><td colspan="5" style="padding:24px;text-align:center;color:#9ca3af;">No executions yet.</td></tr>`
    : executions.map(e => `
      <tr>
        <td>${execStatusBadge(e.status)}</td>
        <td style="font-size:12px;color:#6b7280;">${fmt(e.started_at)}</td>
        <td style="font-size:12px;">${e.duration_ms != null ? e.duration_ms + 'ms' : '—'}</td>
        <td style="font-size:12px;">${e.response_status ?? '—'}</td>
        <td style="font-size:12px;color:#6b7280;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(e.error_message ?? e.response_body ?? '')}">${escapeHtml((e.error_message ?? e.response_body ?? '').substring(0, 120))}</td>
      </tr>`).join('');

  const deliveryRows = (deliveryAttempts && deliveryAttempts.length > 0)
    ? deliveryAttempts.map(a => `
      <tr>
        <td style="font-size:12px;">${a.attempt_number}</td>
        <td>${execStatusBadge(a.status)}</td>
        <td style="font-size:12px;color:#6b7280;">${fmt(a.attempted_at)}</td>
        <td style="font-size:12px;">${a.duration_ms != null ? a.duration_ms + 'ms' : '—'}</td>
        <td style="font-size:12px;">${a.response_status ?? '—'}</td>
        <td style="font-size:12px;color:#6b7280;max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(a.error_message ?? a.response_body ?? '')}">${escapeHtml((a.error_message ?? a.response_body ?? '').substring(0, 100))}</td>
      </tr>`).join('')
    : `<tr><td colspan="6" style="padding:20px;text-align:center;color:#9ca3af;">No delivery attempts recorded yet.</td></tr>`;

  const dlqSection = (dlqItems && dlqItems.length > 0) ? `
    <div class="section-title">Dead Letter Queue (${dlqItems.length} item${dlqItems.length !== 1 ? 's' : ''})</div>
    <div class="card" style="padding:0;overflow:hidden;">
      <table>
        <thead><tr><th>Failed At</th><th>Attempts</th><th>Error</th><th>Expires</th><th>Action</th></tr></thead>
        <tbody>
          ${dlqItems.map(d => `
          <tr>
            <td style="font-size:12px;color:#6b7280;">${fmt(d.failed_at)}</td>
            <td style="font-size:12px;">${d.attempt_count}</td>
            <td style="font-size:12px;color:#6b7280;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(d.error_message ?? '')}">${escapeHtml((d.error_message ?? '').substring(0, 80))}</td>
            <td style="font-size:12px;color:#6b7280;">${fmt(d.expires_at)}</td>
            <td>
              ${d.replayed_at
                ? `<span style="font-size:12px;color:#16a34a;">Replayed ${fmt(d.replayed_at)}</span>`
                : `<form method="POST" action="/dashboard/jobs/${job.id}/dead-letters/${d.id}/replay" style="display:inline;">
                     <button type="submit" class="btn btn-secondary btn-sm">Replay</button>
                   </form>`
              }
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>` : '';

  return layout(job.name, `
    ${flash ? `<div class="success-msg">${flash}</div>` : ''}
    <a href="/dashboard" class="back-link">← Back to jobs</a>
    <div class="page-actions">
      <h1>${escapeHtml(job.name)} ${statusBadge(job.enabled)}</h1>
      <div class="flex-gap">
        <form method="POST" action="/dashboard/jobs/${job.id}/trigger">
          <button type="submit" class="btn btn-primary">Run now</button>
        </form>
        <a href="/dashboard/jobs/${job.id}/edit" class="btn btn-secondary">Edit</a>
        <form method="POST" action="/dashboard/jobs/${job.id}/toggle">
          <button type="submit" class="btn btn-secondary">${job.enabled ? 'Pause' : 'Resume'}</button>
        </form>
        <form method="POST" action="/dashboard/jobs/${job.id}/delete" onsubmit="return confirm('Delete this job?');">
          <button type="submit" class="btn btn-danger">Delete</button>
        </form>
      </div>
    </div>

    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-label">Schedule</div>
        <div style="font-size:18px;font-weight:700;font-family:monospace;">${escapeHtml(job.cron_expression)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Next Run</div>
        <div class="stat-value" style="font-size:14px;">${fmt(job.next_run_at)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Last Run</div>
        <div class="stat-value" style="font-size:14px;">${fmt(job.last_run_at)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">24h Runs</div>
        <div class="stat-value">${stats.last24h.totalRuns}</div>
        <div class="stat-sub">${stats.last24h.successCount} ok / ${stats.last24h.failureCount} fail</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">24h Success Rate</div>
        <div class="stat-value">${stats.last24h.totalRuns > 0 ? Math.round(stats.last24h.successRate * 100) + '%' : '—'}</div>
        <div class="stat-sub">avg ${stats.last24h.avgResponseMs}ms</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">7d Runs</div>
        <div class="stat-value">${stats.last7d.totalRuns}</div>
        <div class="stat-sub">${stats.last7d.successCount} ok / ${stats.last7d.failureCount} fail</div>
      </div>
    </div>

    <div class="card">
      <h2>Configuration</h2>
      <table>
        <tbody>
          <tr><td style="color:#6b7280;width:160px;">Endpoint</td><td><code class="code">${escapeHtml(job.endpoint_url)}</code></td></tr>
          <tr><td style="color:#6b7280;">Method</td><td><code class="code">${escapeHtml(job.http_method)}</code></td></tr>
          <tr><td style="color:#6b7280;">Max Retries</td><td>${job.max_retries}</td></tr>
          <tr><td style="color:#6b7280;">Timeout</td><td>${job.timeout_ms}ms</td></tr>
          ${job.notify_url ? `<tr><td style="color:#6b7280;">Notify URL</td><td><code class="code">${escapeHtml(job.notify_url)}</code></td></tr>` : ''}
          ${job.headers && Object.keys(job.headers).length > 0 ? `<tr><td style="color:#6b7280;">Headers</td><td><code class="code" style="white-space:pre-wrap;">${escapeHtml(JSON.stringify(job.headers, null, 2))}</code></td></tr>` : ''}
          ${job.body ? `<tr><td style="color:#6b7280;">Body</td><td><code class="code" style="white-space:pre-wrap;">${escapeHtml(job.body)}</code></td></tr>` : ''}
        </tbody>
      </table>
    </div>

    <div class="section-title">Execution Log (last 50)</div>
    <div class="card" style="padding:0;overflow:hidden;">
      <table>
        <thead><tr><th>Status</th><th>Started</th><th>Duration</th><th>HTTP</th><th>Details</th></tr></thead>
        <tbody>${execRows}</tbody>
      </table>
    </div>

    <div class="section-title">Delivery Attempt Log (last 30)</div>
    <div class="card" style="padding:0;overflow:hidden;">
      <table>
        <thead><tr><th>#</th><th>Status</th><th>Timestamp</th><th>Duration</th><th>HTTP</th><th>Response</th></tr></thead>
        <tbody>${deliveryRows}</tbody>
      </table>
    </div>

    ${dlqSection}
  `, user);
}

function jobFormPage(user: { email: string; plan: string }, job?: any, error?: string) {
  const isEdit = !!job;
  const v = (field: string, def = '') => job ? escapeHtml(String(job[field] ?? def)) : def;

  const templatePicker = !isEdit ? `
    <div class="card" style="max-width:680px;margin-bottom:12px;background:#f8f9ff;border:1px solid #e0e4ff;">
      <div style="display:flex;align-items:center;gap:12px;">
        <span style="font-size:13px;font-weight:600;color:#374151;white-space:nowrap;">Start from template:</span>
        <select id="templateSelect" onchange="applyTemplate(this.value)" style="flex:1;max-width:380px;">
          <option value="">Choose a template...</option>
        </select>
      </div>
    </div>
    <script>
      fetch('/api/v1/templates').then(r=>r.json()).then(d=>{
        const sel = document.getElementById('templateSelect');
        d.templates.forEach(t=>{
          const opt = document.createElement('option');
          opt.value = JSON.stringify(t);
          opt.textContent = t.name + ' \u2014 ' + t.description;
          sel.appendChild(opt);
        });
      }).catch(()=>{});
      function applyTemplate(val) {
        if (!val) return;
        const t = JSON.parse(val);
        document.getElementById('name').value = t.name || '';
        document.getElementById('endpointUrl').value = t.endpointUrl || '';
        document.getElementById('cronExpression').value = t.cronExpression || '';
        const mSel = document.getElementById('httpMethod');
        if (mSel) mSel.value = t.httpMethod || 'GET';
        document.getElementById('headers').value = t.headers && Object.keys(t.headers).length ? JSON.stringify(t.headers, null, 2) : '';
        document.getElementById('body').value = t.body || '';
        document.getElementById('templateSelect').value = '';
      }
    </script>
  ` : '';

  return layout(isEdit ? 'Edit Job' : 'New Job', `
    <a href="${isEdit ? `/dashboard/jobs/${job.id}` : '/dashboard'}" class="back-link">← ${isEdit ? 'Back to job' : 'Back to jobs'}</a>
    <h1>${isEdit ? 'Edit Job' : 'Create New Job'}</h1>
    ${error ? `<div class="error-msg">${error}</div>` : ''}
    ${templatePicker}
    <div class="card" style="max-width:680px;">
      <form method="POST" action="${isEdit ? `/dashboard/jobs/${job.id}/edit` : '/dashboard/jobs'}">
        <div class="form-group">
          <label for="name">Job Name *</label>
          <input type="text" id="name" name="name" value="${v('name')}" required placeholder="e.g. Daily Report" />
        </div>
        <div class="form-group">
          <label for="endpointUrl">Endpoint URL *</label>
          <input type="url" id="endpointUrl" name="endpointUrl" value="${v('endpoint_url')}" required placeholder="https://your-app.com/api/cron-hook" />
        </div>
        <div class="form-group">
          <label for="cronExpression">Cron Expression *</label>
          <input type="text" id="cronExpression" name="cronExpression" value="${v('cron_expression')}" required placeholder="0 * * * *" />
          <div class="form-hint">Standard 5-field cron. Examples: <code>0 * * * *</code> (hourly), <code>0 9 * * 1-5</code> (9am weekdays)</div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div class="form-group">
            <label for="httpMethod">HTTP Method</label>
            <select id="httpMethod" name="httpMethod">
              ${['GET','POST','PUT','PATCH','DELETE'].map(m => `<option value="${m}" ${v('http_method', 'GET') === m ? 'selected' : ''}>${m}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label for="maxRetries">Max Retries</label>
            <select id="maxRetries" name="maxRetries">
              ${[0,1,2,3,4,5].map(n => `<option value="${n}" ${String(job?.max_retries ?? 3) === String(n) ? 'selected' : ''}>${n}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-group">
          <label for="timeoutMs">Timeout (ms)</label>
          <input type="number" id="timeoutMs" name="timeoutMs" value="${v('timeout_ms', '30000')}" min="1000" max="120000" />
          <div class="form-hint">1000–120000ms</div>
        </div>
        <div class="form-group">
          <label for="headers">Headers (JSON)</label>
          <textarea id="headers" name="headers" placeholder='{"Authorization": "Bearer token"}'>${job ? escapeHtml(JSON.stringify(job.headers ?? {}, null, 2)) : ''}</textarea>
          <div class="form-hint">Optional JSON object of request headers</div>
        </div>
        <div class="form-group">
          <label for="body">Request Body</label>
          <textarea id="body" name="body" placeholder='{"key": "value"}'>${v('body')}</textarea>
          <div class="form-hint">Optional request body (for POST/PUT/PATCH)</div>
        </div>
        <div class="form-group">
          <label for="notifyUrl">Failure Notify URL</label>
          <input type="url" id="notifyUrl" name="notifyUrl" value="${v('notify_url')}" placeholder="https://your-app.com/webhooks/job-failed" />
          <div class="form-hint">Optional webhook URL to call on job failure</div>
        </div>
        <div class="flex-gap" style="margin-top:4px;">
          <button type="submit" class="btn btn-primary">${isEdit ? 'Save Changes' : 'Create Job'}</button>
          <a href="${isEdit ? `/dashboard/jobs/${job.id}` : '/dashboard'}" class="btn btn-secondary">Cancel</a>
        </div>
      </form>
    </div>
  `, user);
}

function onboardingPage(user: { email: string; plan: string }, step: number, jobId?: string, error?: string) {
  const steps = [
    { num: 1, label: 'Create your first job' },
    { num: 2, label: 'Test it' },
    { num: 3, label: 'Set a schedule' },
  ];

  const stepIndicator = `
    <div style="display:flex;align-items:center;gap:0;margin-bottom:32px;">
      ${steps.map((s, i) => `
        <div style="display:flex;align-items:center;${i > 0 ? 'flex:1;' : ''}">
          ${i > 0 ? `<div style="flex:1;height:2px;background:${step > s.num - 1 ? '#4f6ef7' : '#e5e5e5'};"></div>` : ''}
          <div style="display:flex;flex-direction:column;align-items:center;gap:4px;">
            <div style="width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;
              background:${step >= s.num ? '#4f6ef7' : '#e5e5e5'};color:${step >= s.num ? '#fff' : '#9ca3af'};">${step > s.num ? '✓' : s.num}</div>
            <div style="font-size:11px;color:${step >= s.num ? '#4f6ef7' : '#9ca3af'};white-space:nowrap;font-weight:${step === s.num ? '600' : '400'};">${s.label}</div>
          </div>
        </div>
      `).join('')}
    </div>`;

  let stepContent = '';
  if (step === 1) {
    stepContent = `
      <h2 style="margin-bottom:8px;">Create your first job</h2>
      <p style="color:#6b7280;font-size:13px;margin-bottom:20px;">A job is a scheduled HTTP request. Let's create one with a pre-filled example to get started.</p>
      ${error ? `<div class="error-msg">${error}</div>` : ''}
      <form method="POST" action="/dashboard/onboarding/step1">
        <div class="form-group">
          <label for="name">Job Name *</label>
          <input type="text" id="name" name="name" value="Health Check" required />
        </div>
        <div class="form-group">
          <label for="endpointUrl">Endpoint URL *</label>
          <input type="url" id="endpointUrl" name="endpointUrl" value="https://httpbin.org/get" required />
          <div class="form-hint">We pre-filled a test endpoint — httpbin.org echoes requests back. You can change this to your own URL.</div>
        </div>
        <div class="form-group">
          <label for="cronExpression">Cron Expression *</label>
          <input type="text" id="cronExpression" name="cronExpression" value="0 * * * *" required />
          <div class="form-hint">This runs every hour. You'll customise the schedule in step 3.</div>
        </div>
        <input type="hidden" name="httpMethod" value="GET" />
        <button type="submit" class="btn btn-primary" style="width:100%;justify-content:center;">Create job &amp; continue →</button>
      </form>`;
  } else if (step === 2 && jobId) {
    stepContent = `
      <h2 style="margin-bottom:8px;">Test your job</h2>
      <p style="color:#6b7280;font-size:13px;margin-bottom:20px;">Let's run your job right now to make sure it works. Hit the button below to trigger it manually.</p>
      <form method="POST" action="/dashboard/onboarding/step2/${jobId}">
        <button type="submit" class="btn btn-primary" style="width:100%;justify-content:center;margin-bottom:12px;">▶ Run job now</button>
      </form>
      <a href="/dashboard/onboarding/step3/${jobId}" style="display:block;text-align:center;font-size:13px;color:#9ca3af;">Skip this step →</a>`;
  } else if (step === 3 && jobId) {
    stepContent = `
      <h2 style="margin-bottom:8px;">Set your schedule</h2>
      <p style="color:#6b7280;font-size:13px;margin-bottom:20px;">Pick a cron schedule for your job. Common examples are pre-filled below.</p>
      ${error ? `<div class="error-msg">${error}</div>` : ''}
      <form method="POST" action="/dashboard/onboarding/step3/${jobId}">
        <div class="form-group">
          <label for="cronExpression">Cron Expression *</label>
          <input type="text" id="cronExpression" name="cronExpression" value="0 * * * *" required />
          <div class="form-hint">
            Examples: <code>0 * * * *</code> (hourly) · <code>*/5 * * * *</code> (every 5 min) · <code>0 9 * * 1-5</code> (9am weekdays)
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;">
          ${[
            ['Every hour', '0 * * * *'],
            ['Every 5 min', '*/5 * * * *'],
            ['Daily at midnight', '0 0 * * *'],
            ['9am weekdays', '0 9 * * 1-5'],
          ].map(([label, expr]) => `
            <button type="button" class="btn btn-secondary btn-sm"
              onclick="document.getElementById('cronExpression').value='${expr}'"
              style="justify-content:center;">${label}<br/><code style="font-size:10px;">${expr}</code></button>
          `).join('')}
        </div>
        <button type="submit" class="btn btn-primary" style="width:100%;justify-content:center;">Save schedule &amp; finish →</button>
      </form>`;
  }

  return layout('Welcome to CronAPI', `
    <div style="max-width:520px;margin:40px auto;">
      <h1 style="text-align:center;margin-bottom:4px;">Welcome to CronAPI 👋</h1>
      <p style="text-align:center;color:#6b7280;font-size:13px;margin-bottom:28px;">Let's get your first job running in 3 quick steps.</p>
      ${stepIndicator}
      <div class="card">
        ${stepContent}
      </div>
      <p style="text-align:center;font-size:12px;color:#9ca3af;margin-top:12px;">
        <a href="/dashboard/jobs">Skip onboarding →</a>
      </p>
    </div>
  `, user);
}

function billingPage(user: { email: string; plan: string }, usage: { jobCount: number; execThisMonth: number }, planLimits: { maxJobs: number | null; rateLimit: number }) {
  const plans = [
    { name: 'free', price: 0, maxJobs: 10, minInterval: '60 min', rateLimit: 10, description: 'For hobby projects' },
    { name: 'indie', price: 9, maxJobs: 100, minInterval: '1 min', rateLimit: 60, description: 'For indie developers' },
    { name: 'pro', price: 29, maxJobs: null, minInterval: '1 min', rateLimit: 300, description: 'For production workloads' },
  ];

  const jobLimit = planLimits.maxJobs;
  const jobPct = jobLimit ? Math.min(100, Math.round((usage.jobCount / jobLimit) * 100)) : 0;

  const progressBar = (pct: number, warn: boolean) => `
    <div style="background:#e5e7eb;border-radius:4px;height:8px;overflow:hidden;margin-top:6px;">
      <div style="background:${warn ? '#f59e0b' : '#4f6ef7'};width:${pct}%;height:100%;border-radius:4px;transition:width 0.3s;"></div>
    </div>`;

  const usageSection = `
    <div class="card" style="margin-bottom:16px;">
      <h2 style="margin-bottom:16px;">Current Usage</h2>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
        <div>
          <div class="stat-label">Jobs Used</div>
          <div style="font-size:20px;font-weight:700;">${usage.jobCount}${jobLimit ? ` / ${jobLimit}` : ''}</div>
          ${jobLimit ? progressBar(jobPct, jobPct >= 80) : '<div style="font-size:12px;color:#16a34a;margin-top:4px;">Unlimited</div>'}
          ${jobLimit && jobPct >= 80 ? `<div style="font-size:11px;color:#d97706;margin-top:4px;">⚠ ${jobPct}% of limit used</div>` : ''}
        </div>
        <div>
          <div class="stat-label">Executions This Month</div>
          <div style="font-size:20px;font-weight:700;">${usage.execThisMonth.toLocaleString()}</div>
        </div>
      </div>
    </div>`;

  const plansSection = `
    <div class="card">
      <h2 style="margin-bottom:16px;">Plans</h2>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;">
        ${plans.map(p => {
          const isCurrent = p.name === user.plan;
          return `
          <div style="border:2px solid ${isCurrent ? '#4f6ef7' : '#e5e5e5'};border-radius:8px;padding:16px;position:relative;">
            ${isCurrent ? '<div style="position:absolute;top:-10px;left:50%;transform:translateX(-50%);background:#4f6ef7;color:#fff;font-size:10px;font-weight:700;padding:2px 10px;border-radius:10px;text-transform:uppercase;">Current</div>' : ''}
            <div style="font-weight:700;font-size:15px;text-transform:capitalize;margin-bottom:4px;">${p.name}</div>
            <div style="font-size:22px;font-weight:800;margin-bottom:8px;">$${p.price}<span style="font-size:12px;font-weight:400;color:#6b7280;">/mo</span></div>
            <div style="font-size:12px;color:#6b7280;margin-bottom:12px;">${p.description}</div>
            <ul style="font-size:12px;color:#374151;list-style:none;margin-bottom:16px;display:flex;flex-direction:column;gap:4px;">
              <li>✓ ${p.maxJobs ? p.maxJobs + ' jobs' : 'Unlimited jobs'}</li>
              <li>✓ Min interval: ${p.minInterval}</li>
              <li>✓ ${p.rateLimit} req/min</li>
            </ul>
            ${isCurrent
              ? '<div style="text-align:center;font-size:12px;color:#9ca3af;">Active plan</div>'
              : `<form method="POST" action="/dashboard/billing/checkout"><input type="hidden" name="plan" value="${p.name}" /><button type="submit" class="btn btn-primary btn-sm" style="width:100%;justify-content:center;">Upgrade →</button></form>`
            }
          </div>`;
        }).join('')}
      </div>
    </div>`;

  return layout('Billing', `
    <div class="page-actions">
      <h1>Billing &amp; Plan</h1>
    </div>
    ${usageSection}
    ${plansSection}
  `, user);
}

function usageDashboardPage(
  user: { email: string; plan: string },
  data: {
    jobCount: number;
    jobLimit: number | null;
    enabledJobs: number;
    execThisMonth: number;
    successThisMonth: number;
    failThisMonth: number;
    nextRunAt: Date | null;
    dailyExecs: { day: string; count: number }[];
  }
) {
  const jobPct = data.jobLimit ? Math.min(100, Math.round((data.jobCount / data.jobLimit) * 100)) : 0;
  const successRate = (data.successThisMonth + data.failThisMonth) > 0
    ? Math.round((data.successThisMonth / (data.successThisMonth + data.failThisMonth)) * 100)
    : null;

  const barColor = jobPct >= 100 ? '#ef4444' : jobPct >= 80 ? '#f59e0b' : '#4f6ef7';

  const jobBar = data.jobLimit
    ? `<div style="background:#e5e7eb;border-radius:4px;height:8px;overflow:hidden;margin-top:8px;">
         <div style="background:${barColor};width:${jobPct}%;height:100%;border-radius:4px;transition:width 0.3s;"></div>
       </div>
       <div style="font-size:11px;color:${jobPct >= 80 ? '#d97706' : '#6b7280'};margin-top:4px;">
         ${jobPct}% of limit used
       </div>`
    : '<div style="font-size:12px;color:#16a34a;margin-top:4px;">Unlimited</div>';

  const upgradePrompt = data.jobLimit && jobPct >= 80
    ? `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:14px 16px;margin-bottom:20px;display:flex;align-items:center;justify-content:space-between;gap:12px;">
        <div>
          <strong style="color:#92400e;">${jobPct >= 100 ? '🚫 Job limit reached' : '⚠ Approaching job limit'}</strong>
          <span style="color:#78350f;font-size:13px;margin-left:8px;">
            ${jobPct >= 100
              ? `You cannot create new jobs on the <strong>${user.plan}</strong> plan.`
              : `${data.jobCount} / ${data.jobLimit} jobs used on the <strong>${user.plan}</strong> plan.`}
          </span>
        </div>
        <a href="/dashboard/billing" class="btn btn-primary btn-sm">Upgrade plan →</a>
      </div>`
    : '';

  // Render a simple bar chart of daily executions (last 30 days)
  const maxExecs = Math.max(...data.dailyExecs.map(d => d.count), 1);
  const chartBars = data.dailyExecs.map(d => {
    const h = Math.round((d.count / maxExecs) * 60);
    return `<div title="${d.day}: ${d.count} executions" style="display:flex;flex-direction:column;align-items:center;gap:2px;flex:1;">
      <div style="background:#4f6ef7;width:100%;height:${h}px;border-radius:2px 2px 0 0;min-height:2px;"></div>
    </div>`;
  }).join('');

  return layout('Usage', `
    ${upgradePrompt}
    <div class="page-actions">
      <h1>Usage Overview</h1>
    </div>

    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-label">Jobs Created</div>
        <div class="stat-value">${data.jobCount}${data.jobLimit ? ` / ${data.jobLimit}` : ''}</div>
        ${jobBar}
      </div>
      <div class="stat-card">
        <div class="stat-label">Active Jobs</div>
        <div class="stat-value">${data.enabledJobs}</div>
        <div class="stat-sub">${data.jobCount - data.enabledJobs} paused</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Executions This Month</div>
        <div class="stat-value">${data.execThisMonth.toLocaleString()}</div>
        <div class="stat-sub">${data.successThisMonth} ok / ${data.failThisMonth} failed</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Success Rate (Month)</div>
        <div class="stat-value">${successRate !== null ? successRate + '%' : '—'}</div>
        <div class="stat-sub">${data.execThisMonth} total</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Next Scheduled Run</div>
        <div class="stat-value" style="font-size:13px;">${data.nextRunAt ? fmt(data.nextRunAt) : '—'}</div>
        <div class="stat-sub">${data.enabledJobs} enabled job${data.enabledJobs !== 1 ? 's' : ''}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Plan</div>
        <div class="stat-value" style="font-size:18px;text-transform:capitalize;">${user.plan}</div>
        <div class="stat-sub"><a href="/dashboard/billing">View / upgrade →</a></div>
      </div>
    </div>

    <div class="card">
      <h2>Daily Executions (last 30 days)</h2>
      ${data.dailyExecs.length === 0
        ? '<div class="empty-state" style="padding:24px;">No executions yet.</div>'
        : `<div style="display:flex;align-items:flex-end;gap:2px;height:80px;padding-top:8px;">${chartBars}</div>
           <div style="display:flex;justify-content:space-between;font-size:10px;color:#9ca3af;margin-top:4px;">
             <span>${data.dailyExecs[0]?.day ?? ''}</span>
             <span>${data.dailyExecs[data.dailyExecs.length - 1]?.day ?? ''}</span>
           </div>`
      }
    </div>
  `, user);
}

function escapeHtml(str: string) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── route registration ────────────────────────────────────────────────────────

export async function dashboardRoutes(app: FastifyInstance) {
  // GET /dashboard — redirect to jobs list (or login)
  app.get('/', requireAuth(async (_req, reply, _user) => {
    reply.redirect('/dashboard/jobs');
  }));

  // GET /dashboard/login
  app.get('/login', async (_req, reply) => {
    reply.type('text/html').send(loginPage());
  });

  // POST /dashboard/login
  app.post<{ Body: { apiKey?: string } }>('/login', async (request, reply) => {
    const raw = (request.body as any)?.apiKey ?? '';
    const validated = await validateApiKey(raw).catch(() => null);
    if (!validated) {
      return reply.type('text/html').send(loginPage('Invalid API key. Please try again.'));
    }
    reply.setCookie(COOKIE_NAME, raw, COOKIE_OPTS);
    return reply.redirect('/dashboard/jobs');
  });

  // GET /dashboard/logout
  app.get('/logout', async (_req, reply) => {
    reply.clearCookie(COOKIE_NAME, { path: '/' });
    reply.redirect('/dashboard/login');
  });

  // GET /dashboard/jobs
  app.get('/jobs', requireAuth(async (request, reply, user) => {
    const result = await db.query(
      'SELECT * FROM jobs WHERE user_id = $1 ORDER BY created_at DESC',
      [user.userId]
    );
    const jobs = result.rows;

    // Show onboarding for first-time users with no jobs
    if (!user.onboardingCompleted && jobs.length === 0) {
      return reply.redirect('/dashboard/onboarding');
    }

    const flash = (request.query as any).flash;

    // Fetch usage for banner
    const limits = getPlanLimits(user.plan as any);
    const execResult = await db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM job_executions je
       JOIN jobs j ON j.id = je.job_id
       WHERE j.user_id = $1 AND DATE_TRUNC('month', je.started_at) = DATE_TRUNC('month', NOW())`,
      [user.userId]
    );
    const usage = {
      jobCount: jobs.length,
      jobLimit: limits.maxJobs === Infinity ? null : limits.maxJobs,
      execThisMonth: parseInt(execResult.rows[0]?.count ?? '0'),
    };

    reply.type('text/html').send(jobsListPage(jobs, user, flash, usage));
  }));

  // GET /dashboard/jobs/new
  app.get('/jobs/new', requireAuth(async (_req, reply, user) => {
    reply.type('text/html').send(jobFormPage(user));
  }));

  // POST /dashboard/jobs — create job
  app.post<{ Body: Record<string, string> }>('/jobs', requireAuth(async (request, reply, user) => {
    const b = request.body as Record<string, string>;
    const { name, endpointUrl, cronExpression, httpMethod = 'GET', headers, body, notifyUrl, maxRetries, timeoutMs } = b;

    if (!name || !endpointUrl || !cronExpression) {
      return reply.type('text/html').send(jobFormPage(user, null, 'Name, Endpoint URL, and Cron Expression are required.'));
    }

    // Enforce plan job limit with upgrade prompt
    const limits = getPlanLimits(user.plan as any);
    if (limits.maxJobs !== Infinity) {
      const countResult = await db.query<{ count: string }>('SELECT COUNT(*) as count FROM jobs WHERE user_id=$1', [user.userId]);
      const jobCount = parseInt(countResult.rows[0]?.count ?? '0');
      if (jobCount >= limits.maxJobs) {
        return reply.type('text/html').send(jobFormPage(user, null,
          `🚫 You've reached the ${limits.maxJobs}-job limit on the ${user.plan} plan. <a href="/dashboard/billing" style="color:#4f6ef7;font-weight:600;">Upgrade your plan →</a>`
        ));
      }
    }

    let parsedHeaders: Record<string, string> = {};
    if (headers && headers.trim()) {
      try { parsedHeaders = JSON.parse(headers); } catch {
        return reply.type('text/html').send(jobFormPage(user, null, 'Headers must be valid JSON.'));
      }
    }

    try {
      cronParser.parseExpression(cronExpression);
    } catch {
      return reply.type('text/html').send(jobFormPage(user, null, 'Invalid cron expression.'));
    }

    const retries = parseInt(maxRetries ?? '3');
    const timeout = parseInt(timeoutMs ?? '30000');

    try {
      await db.query(
        `INSERT INTO jobs (user_id, name, endpoint_url, cron_expression, http_method, headers, body, notify_url, max_retries, timeout_ms, next_run_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [user.userId, name, endpointUrl, cronExpression, httpMethod.toUpperCase(), JSON.stringify(parsedHeaders), body || null, notifyUrl || null, retries, timeout, nextRunAt(cronExpression)]
      );
    } catch (err: any) {
      return reply.type('text/html').send(jobFormPage(user, null, `Error: ${err.message}`));
    }

    checkUsageAndAlert(user.userId, user.email, user.plan);
    reply.redirect('/dashboard/jobs?flash=Job+created+successfully');
  }));

  // GET /dashboard/jobs/:jobId
  app.get<{ Params: { jobId: string } }>('/jobs/:jobId', requireAuth(async (request, reply, user) => {
    const { jobId } = request.params as { jobId: string };
    const jobResult = await db.query('SELECT * FROM jobs WHERE id = $1 AND user_id = $2', [jobId, user.userId]);
    if (!jobResult.rows[0]) return reply.code(404).type('text/html').send(layout('Not Found', '<div class="empty-state"><p>Job not found.</p><a href="/dashboard">← Back</a></div>', user));

    const job = jobResult.rows[0];
    const [exResult, statsResult, deliveryResult, dlqResult] = await Promise.all([
      db.query('SELECT * FROM job_executions WHERE job_id = $1 ORDER BY started_at DESC LIMIT 50', [job.id]),
      db.query<{
        total_24h: string; success_24h: string; failure_24h: string; avg_ms_24h: string | null;
        total_7d: string; success_7d: string; failure_7d: string; avg_ms_7d: string | null;
      }>(
        `SELECT
          COUNT(*) FILTER (WHERE started_at >= NOW() - INTERVAL '24 hours') AS total_24h,
          COUNT(*) FILTER (WHERE status = 'success' AND started_at >= NOW() - INTERVAL '24 hours') AS success_24h,
          COUNT(*) FILTER (WHERE status != 'success' AND started_at >= NOW() - INTERVAL '24 hours') AS failure_24h,
          AVG(duration_ms) FILTER (WHERE started_at >= NOW() - INTERVAL '24 hours') AS avg_ms_24h,
          COUNT(*) FILTER (WHERE started_at >= NOW() - INTERVAL '7 days') AS total_7d,
          COUNT(*) FILTER (WHERE status = 'success' AND started_at >= NOW() - INTERVAL '7 days') AS success_7d,
          COUNT(*) FILTER (WHERE status != 'success' AND started_at >= NOW() - INTERVAL '7 days') AS failure_7d,
          AVG(duration_ms) FILTER (WHERE started_at >= NOW() - INTERVAL '7 days') AS avg_ms_7d
        FROM job_executions WHERE job_id = $1`,
        [job.id]
      ),
      db.query(
        'SELECT * FROM delivery_attempts WHERE job_id = $1 ORDER BY attempted_at DESC LIMIT 30',
        [job.id]
      ).catch(() => ({ rows: [] })),
      db.query(
        'SELECT * FROM dead_letter_queue WHERE job_id = $1 AND expires_at > NOW() ORDER BY failed_at DESC LIMIT 20',
        [job.id]
      ).catch(() => ({ rows: [] })),
    ]);

    const r = statsResult.rows[0];
    const total24h = parseInt(r.total_24h) || 0;
    const total7d = parseInt(r.total_7d) || 0;
    const stats = {
      last24h: {
        totalRuns: total24h,
        successCount: parseInt(r.success_24h) || 0,
        failureCount: parseInt(r.failure_24h) || 0,
        successRate: total24h > 0 ? (parseInt(r.success_24h) || 0) / total24h : 0,
        avgResponseMs: r.avg_ms_24h ? Math.round(parseFloat(r.avg_ms_24h)) : 0,
      },
      last7d: {
        totalRuns: total7d,
        successCount: parseInt(r.success_7d) || 0,
        failureCount: parseInt(r.failure_7d) || 0,
        successRate: total7d > 0 ? (parseInt(r.success_7d) || 0) / total7d : 0,
        avgResponseMs: r.avg_ms_7d ? Math.round(parseFloat(r.avg_ms_7d)) : 0,
      },
    };

    const flash = (request.query as any).flash;
    reply.type('text/html').send(jobDetailPage(job, exResult.rows, stats, user, flash, deliveryResult.rows, dlqResult.rows));
  }));

  // GET /dashboard/jobs/:jobId/edit
  app.get<{ Params: { jobId: string } }>('/jobs/:jobId/edit', requireAuth(async (request, reply, user) => {
    const { jobId } = request.params as { jobId: string };
    const jobResult = await db.query('SELECT * FROM jobs WHERE id = $1 AND user_id = $2', [jobId, user.userId]);
    if (!jobResult.rows[0]) return reply.code(404).type('text/html').send(layout('Not Found', '<p>Job not found.</p>', user));
    reply.type('text/html').send(jobFormPage(user, jobResult.rows[0]));
  }));

  // POST /dashboard/jobs/:jobId/edit — update job
  app.post<{ Params: { jobId: string }; Body: Record<string, string> }>('/jobs/:jobId/edit', requireAuth(async (request, reply, user) => {
    const { jobId } = request.params as { jobId: string };
    const b = request.body as Record<string, string>;
    const jobResult = await db.query('SELECT * FROM jobs WHERE id = $1 AND user_id = $2', [jobId, user.userId]);
    if (!jobResult.rows[0]) return reply.code(404).type('text/html').send(layout('Not Found', '<p>Job not found.</p>', user));

    const job = jobResult.rows[0];
    const { name, endpointUrl, cronExpression, httpMethod, headers, body, notifyUrl, maxRetries, timeoutMs } = b;

    let parsedHeaders = job.headers;
    if (headers !== undefined && headers.trim()) {
      try { parsedHeaders = JSON.parse(headers); } catch {
        return reply.type('text/html').send(jobFormPage(user, job, 'Headers must be valid JSON.'));
      }
    }

    const cronExpr = cronExpression || job.cron_expression;
    try { cronParser.parseExpression(cronExpr); } catch {
      return reply.type('text/html').send(jobFormPage(user, job, 'Invalid cron expression.'));
    }

    await db.query(
      `UPDATE jobs SET name=$1, endpoint_url=$2, cron_expression=$3, http_method=$4, headers=$5, body=$6,
       notify_url=$7, max_retries=$8, timeout_ms=$9, next_run_at=$10, updated_at=NOW()
       WHERE id=$11 AND user_id=$12`,
      [
        name || job.name,
        endpointUrl || job.endpoint_url,
        cronExpr,
        (httpMethod || job.http_method).toUpperCase(),
        JSON.stringify(parsedHeaders),
        body !== undefined ? (body || null) : job.body,
        notifyUrl !== undefined ? (notifyUrl || null) : job.notify_url,
        maxRetries !== undefined ? parseInt(maxRetries) : job.max_retries,
        timeoutMs !== undefined ? parseInt(timeoutMs) : job.timeout_ms,
        nextRunAt(cronExpr),
        jobId,
        user.userId,
      ]
    );

    reply.redirect(`/dashboard/jobs/${jobId}?flash=Job+updated+successfully`);
  }));

  // POST /dashboard/jobs/:jobId/toggle — enable/disable
  app.post<{ Params: { jobId: string } }>('/jobs/:jobId/toggle', requireAuth(async (request, reply, user) => {
    const { jobId } = request.params as { jobId: string };
    const jobResult = await db.query('SELECT enabled FROM jobs WHERE id = $1 AND user_id = $2', [jobId, user.userId]);
    if (!jobResult.rows[0]) return reply.code(404).send('Not found');
    const newEnabled = !jobResult.rows[0].enabled;
    await db.query('UPDATE jobs SET enabled=$1, updated_at=NOW() WHERE id=$2 AND user_id=$3', [newEnabled, jobId, user.userId]);
    reply.redirect(`/dashboard/jobs/${jobId}?flash=${newEnabled ? 'Job+resumed' : 'Job+paused'}`);
  }));

  // POST /dashboard/jobs/:jobId/trigger — manual run
  app.post<{ Params: { jobId: string } }>('/jobs/:jobId/trigger', requireAuth(async (request, reply, user) => {
    const { jobId } = request.params as { jobId: string };
    const jobResult = await db.query<{
      id: string; endpoint_url: string; http_method: string;
      headers: Record<string, string>; body: string | null;
      notify_url: string | null; max_retries: number;
      signing_secret: string; timeout_ms: number;
    }>(
      'SELECT id, endpoint_url, http_method, headers, body, notify_url, max_retries, signing_secret, timeout_ms FROM jobs WHERE id = $1 AND user_id = $2',
      [jobId, user.userId]
    );
    if (!jobResult.rows[0]) return reply.code(404).send('Not found');

    await runJob(jobResult.rows[0]).catch(() => {});
    reply.redirect(`/dashboard/jobs/${jobId}?flash=Job+triggered+successfully`);
  }));

  // POST /dashboard/jobs/:jobId/delete
  app.post<{ Params: { jobId: string } }>('/jobs/:jobId/delete', requireAuth(async (request, reply, user) => {
    const { jobId } = request.params as { jobId: string };
    await db.query('DELETE FROM jobs WHERE id = $1 AND user_id = $2', [jobId, user.userId]);
    reply.redirect('/dashboard/jobs?flash=Job+deleted');
  }));

  // POST /dashboard/jobs/:jobId/dead-letters/:dlqId/replay
  app.post<{ Params: { jobId: string; dlqId: string } }>('/jobs/:jobId/dead-letters/:dlqId/replay', requireAuth(async (request, reply, user) => {
    const { jobId, dlqId } = request.params as { jobId: string; dlqId: string };

    const jobResult = await db.query<{
      id: string; signing_secret: string; notify_url: string | null; max_retries: number; timeout_ms: number;
    }>(
      'SELECT id, signing_secret, notify_url, max_retries, timeout_ms FROM jobs WHERE id = $1 AND user_id = $2',
      [jobId, user.userId]
    );
    if (!jobResult.rows[0]) return reply.code(404).send('Job not found');

    const dlqResult = await db.query(
      'SELECT * FROM dead_letter_queue WHERE id = $1 AND job_id = $2 AND expires_at > NOW() AND replayed_at IS NULL',
      [dlqId, jobId]
    );
    if (!dlqResult.rows[0]) return reply.redirect(`/dashboard/jobs/${jobId}?flash=Dead+letter+not+found+or+already+replayed`);

    const dlq = dlqResult.rows[0];
    const job = jobResult.rows[0];

    await runJob({
      id: job.id,
      endpoint_url: dlq.endpoint_url,
      http_method: dlq.http_method,
      headers: dlq.headers,
      body: dlq.body,
      notify_url: job.notify_url,
      signing_secret: job.signing_secret,
      max_retries: 0, // single replay attempt
      timeout_ms: job.timeout_ms,
    }).catch(() => {});

    await db.query('UPDATE dead_letter_queue SET replayed_at = NOW() WHERE id = $1', [dlqId]);

    reply.redirect(`/dashboard/jobs/${jobId}?flash=Dead+letter+replayed+successfully`);
  }));

  // ── onboarding ──────────────────────────────────────────────────────────────

  // GET /dashboard/onboarding — step 1
  app.get('/onboarding', requireAuth(async (_req, reply, user) => {
    reply.type('text/html').send(onboardingPage(user, 1));
  }));

  // POST /dashboard/onboarding/step1 — create job and proceed to step 2
  app.post<{ Body: Record<string, string> }>('/onboarding/step1', requireAuth(async (request, reply, user) => {
    const b = request.body as Record<string, string>;
    const { name, endpointUrl, cronExpression, httpMethod = 'GET' } = b;
    if (!name || !endpointUrl || !cronExpression) {
      return reply.type('text/html').send(onboardingPage(user, 1, undefined, 'Name, Endpoint URL, and Cron Expression are required.'));
    }
    try { cronParser.parseExpression(cronExpression); } catch {
      return reply.type('text/html').send(onboardingPage(user, 1, undefined, 'Invalid cron expression.'));
    }
    const insertResult = await db.query<{ id: string }>(
      `INSERT INTO jobs (user_id, name, endpoint_url, cron_expression, http_method, headers, next_run_at)
       VALUES ($1, $2, $3, $4, $5, '{}', $6) RETURNING id`,
      [user.userId, name, endpointUrl, cronExpression, httpMethod.toUpperCase(), nextRunAt(cronExpression)]
    );
    const jobId = insertResult.rows[0].id;
    checkUsageAndAlert(user.userId, user.email, user.plan);
    reply.redirect(`/dashboard/onboarding/step2/${jobId}`);
  }));

  // GET /dashboard/onboarding/step2/:jobId
  app.get<{ Params: { jobId: string } }>('/onboarding/step2/:jobId', requireAuth(async (request, reply, user) => {
    const { jobId } = request.params as { jobId: string };
    reply.type('text/html').send(onboardingPage(user, 2, jobId));
  }));

  // POST /dashboard/onboarding/step2/:jobId — trigger job then go to step 3
  app.post<{ Params: { jobId: string } }>('/onboarding/step2/:jobId', requireAuth(async (request, reply, user) => {
    const { jobId } = request.params as { jobId: string };
    const jobResult = await db.query(
      'SELECT id, endpoint_url, http_method, headers, body, notify_url, max_retries, signing_secret, timeout_ms FROM jobs WHERE id = $1 AND user_id = $2',
      [jobId, user.userId]
    );
    if (jobResult.rows[0]) {
      await runJob(jobResult.rows[0]).catch(() => {});
    }
    reply.redirect(`/dashboard/onboarding/step3/${jobId}`);
  }));

  // GET /dashboard/onboarding/step3/:jobId
  app.get<{ Params: { jobId: string } }>('/onboarding/step3/:jobId', requireAuth(async (request, reply, user) => {
    const { jobId } = request.params as { jobId: string };
    reply.type('text/html').send(onboardingPage(user, 3, jobId));
  }));

  // POST /dashboard/onboarding/step3/:jobId — save schedule and complete onboarding
  app.post<{ Params: { jobId: string }; Body: Record<string, string> }>('/onboarding/step3/:jobId', requireAuth(async (request, reply, user) => {
    const { jobId } = request.params as { jobId: string };
    const { cronExpression } = request.body as Record<string, string>;
    if (cronExpression) {
      try { cronParser.parseExpression(cronExpression); } catch {
        return reply.type('text/html').send(onboardingPage(user, 3, jobId, 'Invalid cron expression.'));
      }
      await db.query(
        'UPDATE jobs SET cron_expression=$1, next_run_at=$2, updated_at=NOW() WHERE id=$3 AND user_id=$4',
        [cronExpression, nextRunAt(cronExpression), jobId, user.userId]
      );
    }
    await db.query('UPDATE users SET onboarding_completed=true, updated_at=NOW() WHERE id=$1', [user.userId]);
    reply.redirect('/dashboard/jobs?flash=Welcome+to+CronAPI!+Your+first+job+is+ready.');
  }));

  // ── usage ────────────────────────────────────────────────────────────────────

  // GET /dashboard/usage
  app.get('/usage', requireAuth(async (_req, reply, user) => {
    const limits = getPlanLimits(user.plan as any);

    const [jobsResult, execResult, nextRunResult, dailyResult] = await Promise.all([
      db.query<{ count: string; enabled_count: string }>(
        `SELECT COUNT(*) as count, COUNT(*) FILTER (WHERE enabled = true) as enabled_count FROM jobs WHERE user_id = $1`,
        [user.userId]
      ),
      db.query<{ total: string; success: string; fail: string }>(
        `SELECT
           COUNT(*) as total,
           COUNT(*) FILTER (WHERE je.status = 'success') as success,
           COUNT(*) FILTER (WHERE je.status != 'success') as fail
         FROM job_executions je
         JOIN jobs j ON j.id = je.job_id
         WHERE j.user_id = $1 AND DATE_TRUNC('month', je.started_at) = DATE_TRUNC('month', NOW())`,
        [user.userId]
      ),
      db.query<{ next_run_at: Date }>(
        `SELECT MIN(next_run_at) as next_run_at FROM jobs WHERE user_id = $1 AND enabled = true`,
        [user.userId]
      ),
      db.query<{ day: string; count: string }>(
        `SELECT DATE(je.started_at) as day, COUNT(*) as count
         FROM job_executions je
         JOIN jobs j ON j.id = je.job_id
         WHERE j.user_id = $1 AND je.started_at >= NOW() - INTERVAL '30 days'
         GROUP BY DATE(je.started_at)
         ORDER BY day ASC`,
        [user.userId]
      ),
    ]);

    // Build a 30-day array with zeros for missing days
    const dailyMap = new Map<string, number>();
    for (const row of dailyResult.rows) {
      dailyMap.set(row.day, parseInt(row.count));
    }
    const dailyExecs: { day: string; count: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      dailyExecs.push({ day: key, count: dailyMap.get(key) ?? 0 });
    }

    const data = {
      jobCount: parseInt(jobsResult.rows[0]?.count ?? '0'),
      jobLimit: limits.maxJobs === Infinity ? null : limits.maxJobs,
      enabledJobs: parseInt(jobsResult.rows[0]?.enabled_count ?? '0'),
      execThisMonth: parseInt(execResult.rows[0]?.total ?? '0'),
      successThisMonth: parseInt(execResult.rows[0]?.success ?? '0'),
      failThisMonth: parseInt(execResult.rows[0]?.fail ?? '0'),
      nextRunAt: nextRunResult.rows[0]?.next_run_at ?? null,
      dailyExecs,
    };

    reply.type('text/html').send(usageDashboardPage(user, data));
  }));

  // ── billing ─────────────────────────────────────────────────────────────────

  // GET /dashboard/billing
  app.get('/billing', requireAuth(async (_req, reply, user) => {
    const limits = getPlanLimits(user.plan as any);
    const [jobResult, execResult] = await Promise.all([
      db.query<{ count: string }>('SELECT COUNT(*) as count FROM jobs WHERE user_id=$1', [user.userId]),
      db.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM job_executions je
         JOIN jobs j ON j.id = je.job_id
         WHERE j.user_id=$1 AND DATE_TRUNC('month', je.started_at)=DATE_TRUNC('month', NOW())`,
        [user.userId]
      ),
    ]);
    const usage = {
      jobCount: parseInt(jobResult.rows[0]?.count ?? '0'),
      execThisMonth: parseInt(execResult.rows[0]?.count ?? '0'),
    };
    const planLimits = {
      maxJobs: limits.maxJobs === Infinity ? null : limits.maxJobs,
      rateLimit: limits.rateLimit,
    };
    reply.type('text/html').send(billingPage(user, usage, planLimits));
  }));

  // POST /dashboard/billing/checkout — create Stripe checkout session
  app.post<{ Body: { plan?: string } }>('/billing/checkout', requireAuth(async (request, reply, user) => {
    const { plan } = request.body as { plan?: string };
    const stripeKey = process.env.STRIPE_SECRET_KEY;

    if (!stripeKey) {
      return reply.type('text/html').send(layout('Upgrade', `
        <div class="container" style="max-width:520px;margin:60px auto;">
          <div class="card" style="text-align:center;">
            <h2 style="margin-bottom:8px;">Stripe not configured</h2>
            <p style="color:#6b7280;font-size:13px;margin-bottom:16px;">Stripe payments are not yet set up. Please contact support to upgrade your plan.</p>
            <a href="/dashboard/billing" class="btn btn-secondary">← Back to Billing</a>
          </div>
        </div>
      `, user));
    }

    const priceId = plan === 'pro' ? process.env.STRIPE_PRO_PRICE_ID : process.env.STRIPE_INDIE_PRICE_ID;
    if (!priceId) {
      return reply.redirect('/dashboard/billing?flash=Plan+price+not+configured');
    }

    const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' });
    const protocol = request.headers['x-forwarded-proto'] ?? 'http';
    const host = request.headers.host ?? 'localhost';
    const baseUrl = `${protocol}://${host}`;

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: user.email,
      success_url: `${baseUrl}/dashboard/jobs?flash=Plan+upgraded+successfully`,
      cancel_url: `${baseUrl}/dashboard/billing`,
    });

    logConversionEvent(user.userId, 'checkout_initiated', { plan, sessionId: session.id });

    reply.redirect(session.url!);
  }));
}
