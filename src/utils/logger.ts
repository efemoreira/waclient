type LogLevel = 'info' | 'warn' | 'error' | 'debug';

function formatPrefix(level: LogLevel, scope?: string): string {
  const tag = scope ? `[${scope}]` : '[App]';
  const lvl = level.toUpperCase();
  return `${tag} ${lvl}`;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch (_err) {
    return '[unserializable]';
  }
}

export const logger = {
  info(scope: string, message: string, meta?: unknown): void {
    const prefix = formatPrefix('info', scope);
    if (meta !== undefined) {
      console.log(prefix, message, safeStringify(meta));
      return;
    }
    console.log(prefix, message);
  },
  warn(scope: string, message: string, meta?: unknown): void {
    const prefix = formatPrefix('warn', scope);
    if (meta !== undefined) {
      console.warn(prefix, message, safeStringify(meta));
      return;
    }
    console.warn(prefix, message);
  },
  error(scope: string, message: string, meta?: unknown): void {
    const prefix = formatPrefix('error', scope);
    if (meta !== undefined) {
      console.error(prefix, message, safeStringify(meta));
      return;
    }
    console.error(prefix, message);
  },
  debug(scope: string, message: string, meta?: unknown): void {
    const prefix = formatPrefix('debug', scope);
    if (meta !== undefined) {
      console.debug(prefix, message, safeStringify(meta));
      return;
    }
    console.debug(prefix, message);
  },
};
