type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogPayload {
  message: string;
  [key: string]: unknown;
}

function formatLog(level: LogLevel, payload: LogPayload): string {
  const { message, ...meta } = payload;
  const timestamp = new Date().toISOString();
  const base = { timestamp, level, message };
  return JSON.stringify(Object.keys(meta).length > 0 ? { ...base, ...meta } : base);
}

function shouldLog(level: LogLevel): boolean {
  if (level === 'debug') return process.env.NODE_ENV !== 'production';
  return true;
}

export const logger = {
  info(message: string, meta?: Record<string, unknown>) {
    if (!shouldLog('info')) return;
    console.log(formatLog('info', { message, ...meta }));
  },

  warn(message: string, meta?: Record<string, unknown>) {
    if (!shouldLog('warn')) return;
    console.warn(formatLog('warn', { message, ...meta }));
  },

  error(message: string, error?: unknown, meta?: Record<string, unknown>) {
    if (!shouldLog('error')) return;
    const errorMeta: Record<string, unknown> = { ...meta };
    if (error instanceof Error) {
      errorMeta.error = error.message;
      errorMeta.stack = error.stack;
    } else if (error !== undefined) {
      errorMeta.error = String(error);
    }
    console.error(formatLog('error', { message, ...errorMeta }));
  },

  debug(message: string, meta?: Record<string, unknown>) {
    if (!shouldLog('debug')) return;
    console.log(formatLog('debug', { message, ...meta }));
  },
};
