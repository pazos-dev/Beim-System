/**
 * Prometheus metrics (issue #94) — hand-rolled text exposition, no dependencies.
 *
 * Families:
 * - http_requests_total{method,path,status}: counter per bounded route pattern
 *   (never raw URLs — see routePattern in middleware/request-log.ts).
 * - http_request_duration_seconds{method,path}: histogram of latency.
 * - pg_pool_total / pg_pool_idle / pg_pool_waiting: live gauges read from the
 *   node-pg pool (totalCount/idleCount/waitingCount) at scrape time.
 *
 * No PII, no business data: only counters, latencies and pool sizes.
 */
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { routePattern } from "../middleware/request-log.js";
import { pool } from "../config/db.js";

const LATENCY_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5];

export interface PoolStats {
  total: number;
  idle: number;
  waiting: number;
}

let poolStatsProvider: () => PoolStats = () => ({
  total: pool.totalCount,
  idle: pool.idleCount,
  waiting: pool.waitingCount
});

/** Test hook: replace the live pool reader (e.g. to prove nonzero gauges). */
export function setPoolStatsProvider(next: () => PoolStats): void {
  poolStatsProvider = next;
}

/** Test hook: restore the live node-pg pool reader. */
export function resetPoolStatsProvider(): void {
  poolStatsProvider = () => ({
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount
  });
}

const counters = new Map<string, number>();
const histograms = new Map<string, { buckets: number[]; sum: number; count: number }>();

/** Test hook: clear all request observations (gauges always read live). */
export function resetMetrics(): void {
  counters.clear();
  histograms.clear();
}

export function observeRequest(method: string, path: string, status: string, durationSeconds: number): void {
  const counterKey = `${method}\n${path}\n${status}`;
  counters.set(counterKey, (counters.get(counterKey) ?? 0) + 1);
  const histogramKey = `${method}\n${path}`;
  let entry = histograms.get(histogramKey);
  if (entry === undefined) {
    entry = { buckets: new Array<number>(LATENCY_BUCKETS.length).fill(0), sum: 0, count: 0 };
    histograms.set(histogramKey, entry);
  }
  for (let i = 0; i < LATENCY_BUCKETS.length; i += 1) {
    if (durationSeconds <= (LATENCY_BUCKETS[i] as number)) {
      entry.buckets[i] = (entry.buckets[i] as number) + 1;
    }
  }
  entry.sum += durationSeconds;
  entry.count += 1;
}

/** Observes every request on finish; mounted next to requestLog (before identity/routers). */
export const metricsMiddleware: RequestHandler = (req: Request, res: Response, next: NextFunction): void => {
  const start = process.hrtime.bigint();
  res.on("finish", () => {
    const durationSeconds = Number(process.hrtime.bigint() - start) / 1_000_000_000;
    observeRequest(req.method, routePattern(req), String(res.statusCode), durationSeconds);
  });
  next();
};

function escapeLabel(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

function formatFloat(value: number): string {
  return Number.isFinite(value) ? String(value) : "0";
}

/** Renders the Prometheus text exposition format (version 0.0.4). */
export function renderMetrics(): string {
  const lines: string[] = [];
  lines.push("# HELP http_requests_total Total HTTP requests.");
  lines.push("# TYPE http_requests_total counter");
  for (const key of [...counters.keys()].sort()) {
    const [method, path, status] = key.split("\n") as [string, string, string];
    lines.push(
      `http_requests_total{method="${escapeLabel(method)}",path="${escapeLabel(path)}",status="${escapeLabel(status)}"} ${counters.get(key) as number}`
    );
  }
  lines.push("# HELP http_request_duration_seconds HTTP request latency in seconds.");
  lines.push("# TYPE http_request_duration_seconds histogram");
  for (const key of [...histograms.keys()].sort()) {
    const [method, path] = key.split("\n") as [string, string];
    const entry = histograms.get(key) as { buckets: number[]; sum: number; count: number };
    let cumulative = 0;
    for (let i = 0; i < LATENCY_BUCKETS.length; i += 1) {
      cumulative += entry.buckets[i] as number;
      lines.push(
        `http_request_duration_seconds_bucket{method="${escapeLabel(method)}",path="${escapeLabel(path)}",le="${LATENCY_BUCKETS[i] as number}"} ${cumulative}`
      );
    }
    lines.push(
      `http_request_duration_seconds_bucket{method="${escapeLabel(method)}",path="${escapeLabel(path)}",le="+Inf"} ${entry.count}`
    );
    lines.push(
      `http_request_duration_seconds_sum{method="${escapeLabel(method)}",path="${escapeLabel(path)}"} ${formatFloat(entry.sum)}`
    );
    lines.push(
      `http_request_duration_seconds_count{method="${escapeLabel(method)}",path="${escapeLabel(path)}"} ${entry.count}`
    );
  }
  const stats = poolStatsProvider();
  lines.push("# HELP pg_pool_total Total connections in the Postgres pool.");
  lines.push("# TYPE pg_pool_total gauge");
  lines.push(`pg_pool_total ${formatFloat(stats.total)}`);
  lines.push("# HELP pg_pool_idle Idle connections in the Postgres pool.");
  lines.push("# TYPE pg_pool_idle gauge");
  lines.push(`pg_pool_idle ${formatFloat(stats.idle)}`);
  lines.push("# HELP pg_pool_waiting Requests waiting for a Postgres connection.");
  lines.push("# TYPE pg_pool_waiting gauge");
  lines.push(`pg_pool_waiting ${formatFloat(stats.waiting)}`);
  return `${lines.join("\n")}\n`;
}
