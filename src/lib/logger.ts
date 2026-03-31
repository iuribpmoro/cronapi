/**
 * Structured JSON logger for production diagnostics.
 * Outputs to stdout so Render captures it in service logs.
 */

type LogLevel = 'info' | 'warn' | 'error';

function log(level: LogLevel, message: string, data?: Record<string, unknown>) {
  const entry: Record<string, unknown> = {
    level,
    time: new Date().toISOString(),
    msg: message,
    ...data,
  };
  console.log(JSON.stringify(entry));
}

export const logger = {
  info: (message: string, data?: Record<string, unknown>) => log('info', message, data),
  warn: (message: string, data?: Record<string, unknown>) => log('warn', message, data),
  error: (message: string, data?: Record<string, unknown>) => log('error', message, data),
};
