/**
 * Minimal structured logger (issue #94) — stdlib only, no dependencies.
 *
 * One JSON object per line on a single injectable destination (tests swap in
 * a memory sink via setLogDestination). Levels: info, warn, error. Callers
 * must only pass allowlisted scalar fields — never bodies, queries, tokens
 * or passwords.
 */

export type LogLevel = "info" | "warn" | "error";

export interface LogSink {
  write(chunk: string): void;
}

const LEVEL_ORDER: Record<LogLevel, number> = { info: 0, warn: 1, error: 2 };

function activeLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL ?? "info").toLowerCase();
  if (raw === "error") return "error";
  if (raw === "warn") return "warn";
  return "info";
}

let sink: LogSink = {
  write: (chunk: string): void => {
    process.stdout.write(chunk);
  }
};

/** Test hook: route every level into `next` (e.g. a memory sink). */
export function setLogDestination(next: LogSink): void {
  sink = next;
}

/** Test hook: restore the default stdout destination. */
export function resetLogDestination(): void {
  sink = {
    write: (chunk: string): void => {
      process.stdout.write(chunk);
    }
  };
}

function emit(level: LogLevel, fields: Record<string, unknown>): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[activeLevel()]) return;
  sink.write(`${JSON.stringify({ ts: new Date().toISOString(), level, ...fields })}\n`);
}

export const logger = {
  info(fields: Record<string, unknown>): void {
    emit("info", fields);
  },
  warn(fields: Record<string, unknown>): void {
    emit("warn", fields);
  },
  error(fields: Record<string, unknown>): void {
    emit("error", fields);
  }
};
