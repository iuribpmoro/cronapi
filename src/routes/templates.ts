import { FastifyInstance } from 'fastify';

export const JOB_TEMPLATES = [
  {
    id: 'uptime-monitor',
    name: 'Uptime Monitor',
    description: 'Ping your service every 5 minutes to verify it is alive.',
    cronExpression: '*/5 * * * *',
    httpMethod: 'GET',
    endpointUrl: 'https://your-service.com/health',
    headers: {},
    body: null,
  },
  {
    id: 'daily-digest',
    name: 'Daily Digest',
    description: 'Trigger a daily summary report at 8am UTC on weekdays.',
    cronExpression: '0 8 * * 1-5',
    httpMethod: 'POST',
    endpointUrl: 'https://your-service.com/api/digest',
    headers: { 'Content-Type': 'application/json' },
    body: '{"type":"daily"}',
  },
  {
    id: 'slack-notification',
    name: 'Slack Notification',
    description: 'Send a scheduled message to a Slack webhook every weekday morning.',
    cronExpression: '0 9 * * 1-5',
    httpMethod: 'POST',
    endpointUrl: 'https://hooks.slack.com/services/YOUR/WEBHOOK/URL',
    headers: { 'Content-Type': 'application/json' },
    body: '{"text":"Good morning! Daily standup in 15 minutes."}',
  },
  {
    id: 'database-backup',
    name: 'Database Backup Trigger',
    description: 'Trigger a nightly database backup job at 2am UTC.',
    cronExpression: '0 2 * * *',
    httpMethod: 'POST',
    endpointUrl: 'https://your-service.com/api/backup',
    headers: { 'Content-Type': 'application/json' },
    body: '{"type":"full"}',
  },
  {
    id: 'rss-to-webhook',
    name: 'RSS-to-Webhook',
    description: 'Poll an RSS feed hourly and forward new items to your endpoint.',
    cronExpression: '0 * * * *',
    httpMethod: 'POST',
    endpointUrl: 'https://your-service.com/api/rss-check',
    headers: { 'Content-Type': 'application/json' },
    body: '{"feedUrl":"https://example.com/feed.xml"}',
  },
];

export async function templateRoutes(app: FastifyInstance) {
  app.get('/', async (_request, reply) => {
    return reply.send({ templates: JOB_TEMPLATES });
  });
}
