/**
 * Minimal structured logger. Single sink so it's trivial to swap
 * for pino/winston/console-shipper later without touching call sites.
 */

type Fields = Record<string, unknown>;
type Level = 'info' | 'warn' | 'error';

function emit(level: Level, message: string, fields?: Fields): void {
  const entry = { level, time: new Date().toISOString(), message, ...fields };
  const sink = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  sink(JSON.stringify(entry));
}

export const log = {
  info: (message: string, fields?: Fields) => emit('info', message, fields),
  warn: (message: string, fields?: Fields) => emit('warn', message, fields),
  error: (message: string, fields?: Fields) => emit('error', message, fields),
};
