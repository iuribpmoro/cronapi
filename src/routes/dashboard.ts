import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { validateApiKey } from '../lib/apiKeys';
import { db } from '../db/client';
import { runJob } from '../lib/executeJob';
import cronParser from 'cron-parser';

// ── helpers ──────────────────────────────────────────────────────────────────

const COOKIE_NAME = 'dashboard_key';
const COOKIE_OPTS = { path: '/', httpOnly: true, sameSite: 'lax' as const, maxAge: 60 * 60 * 24 * 7 };

async function getSessionUser(request: FastifyRequest) {
  const raw = request.cookies?.[COOKIE_NAME];
  if (!raw) return null;
  const validated = await validateApiKey(raw).catch(() => null);
  if (!validated) return null;
  const row = await db.query<{ email: string; plan: string }>(
    'SELECT email, plan FROM users WHERE id = $1',
    [validated.userId]
  ).then(r => r.rows[0]).catch(() => null);
  if (!row) return null;
  return { userId: validated.userId, keyId: validated.keyId, email: row.email, plan: row.plan };
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
    ${user ? `<div class="nav-right">
      <span>${user.email}</span>
      <span class="badge badge-active" style="text-transform:capitalize;">${user.plan}</span>
      <a href="/dashboard/logout">Logout</a>
    </div>` : ''}
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

function jobsListPage(jobs: any[], user: { email: string; plan: string }, flash?: string) {
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

  return layout('Jobs', `
    ${flash ? `<div class="success-msg">${flash}</div>` : ''}
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

function jobDetailPage(job: any, executions: any[], stats: any, user: { email: string; plan: string }, flash?: string) {
  const execRows = executions.length === 0
    ? `<tr><td colspan="5" style="padding:24px;text-align:center;color:#9ca3af;">No executions yet.</td></tr>`
    : executions.map(e => `
      <tr>
        <td>${execStatusBadge(e.status)}</td>
        <td style="font-size:12px;color:#6b7280;">${fmt(e.started_at)}</td>
        <td style="font-size:12px;">${e.duration_ms != null ? e.duration_ms + 'ms' : '—'}</td>
        <td style="font-size:12px;">${e.status_code ?? '—'}</td>
        <td style="font-size:12px;color:#6b7280;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(e.error ?? e.response_body ?? '')}">${escapeHtml((e.error ?? e.response_body ?? '').substring(0, 120))}</td>
      </tr>`).join('');

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
  `, user);
}

function jobFormPage(user: { email: string; plan: string }, job?: any, error?: string) {
  const isEdit = !!job;
  const v = (field: string, def = '') => job ? escapeHtml(String(job[field] ?? def)) : def;

  return layout(isEdit ? 'Edit Job' : 'New Job', `
    <a href="${isEdit ? `/dashboard/jobs/${job.id}` : '/dashboard'}" class="back-link">← ${isEdit ? 'Back to job' : 'Back to jobs'}</a>
    <h1>${isEdit ? 'Edit Job' : 'Create New Job'}</h1>
    ${error ? `<div class="error-msg">${error}</div>` : ''}
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
    const flash = (request.query as any).flash;
    reply.type('text/html').send(jobsListPage(result.rows, user, flash));
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

    reply.redirect('/dashboard/jobs?flash=Job+created+successfully');
  }));

  // GET /dashboard/jobs/:jobId
  app.get<{ Params: { jobId: string } }>('/jobs/:jobId', requireAuth(async (request, reply, user) => {
    const { jobId } = request.params as { jobId: string };
    const jobResult = await db.query('SELECT * FROM jobs WHERE id = $1 AND user_id = $2', [jobId, user.userId]);
    if (!jobResult.rows[0]) return reply.code(404).type('text/html').send(layout('Not Found', '<div class="empty-state"><p>Job not found.</p><a href="/dashboard">← Back</a></div>', user));

    const job = jobResult.rows[0];
    const [exResult, statsResult] = await Promise.all([
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
    reply.type('text/html').send(jobDetailPage(job, exResult.rows, stats, user, flash));
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
}
