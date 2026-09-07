/**
 * Observability tests (issue #94) — structured logs + Prometheus metrics.
 *
 * Fully DB-free: the auth repository is stubbed (failed logins never touch
 * Postgres; scrypt still runs on CPU like production) and the middleware,
 * logger and /metrics route never issue a query.
 */
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// createApp's module graph imports src/config/db.ts, which requires
// DATABASE_URL at load time; this suite never opens a connection.
process.env.DATABASE_URL ??= "postgres://beim@127.0.0.1:5432/beim_api_test";

// Unknown identifiers fail closed (401) without touching the database.
vi.mock("../modules/webshop/repositories/pg-auth.js", () => ({
  authRepository: {
    findByIdentifier: async (): Promise<null> => null,
    findById: async (): Promise<null> => null,
    insertClient: async (): Promise<null> => null,
    createSession: async (): Promise<void> => undefined,
    findSessionWithUser: async (): Promise<null> => null,
    deleteSessionByHash: async (): Promise<void> => undefined,
    findBridgeToken: async (): Promise<null> => null,
    consumeBridgeToken: async (): Promise<void> => undefined
  },
  hashToken: (token: string): string => token
}));

const { createApp } = await import("../app.js");
const { resetLogDestination, setLogDestination } = await import("./logger.js");
const {
  renderMetrics,
  resetMetrics,
  resetPoolStatsProvider,
  setPoolStatsProvider
} = await import("./metrics.js");

interface LogLine {
  reqId?: unknown;
  method?: unknown;
  path?: unknown;
  status?: unknown;
  ms?: unknown;
  ip?: unknown;
  level?: unknown;
  event?: unknown;
  ok?: unknown;
  name?: unknown;
  message?: unknown;
}

function memorySink(): { chunks: string[]; write(chunk: string): void } {
  const chunks: string[] = [];
  return {
    chunks,
    write(chunk: string): void {
      chunks.push(chunk);
    }
  };
}

function parseLines(chunks: string[]): LogLine[] {
  return chunks
    .flatMap((chunk) => chunk.split("\n"))
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as LogLine);
}

let capture = memorySink();

beforeEach(() => {
  resetMetrics();
  resetPoolStatsProvider();
  capture = memorySink();
  setLogDestination(capture);
});

afterAll(() => {
  resetLogDestination();
});

describe("request logging", () => {
  it("logs exactly one parseable JSON line per request and echoes reqId in X-Request-Id", async () => {
    const res = await request(createApp()).get("/health");

    expect(res.status).toBe(200);
    const headerId = res.headers["x-request-id"] as string | undefined;
    expect(headerId).toMatch(/^[0-9a-f-]{8}$/);

    const lines = parseLines(capture.chunks);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      level: "info",
      reqId: headerId,
      method: "GET",
      path: "/health",
      status: 200
    });
    expect(typeof lines[0]?.ms).toBe("number");
    expect(typeof lines[0]?.ip).toBe("string");
  });

  it("uses bounded route patterns, never raw ids (no cardinality explosion)", async () => {
    const app = createApp();
    // No token: the guard rejects before any service/DB call, but the route
    // is already matched, so the pattern (not the id) is what gets logged.
    const guarded = await request(app).get("/api/v1/orders/11111111-1111-4111-8111-111111111111");
    expect(guarded.status).toBe(401);
    const missing = await request(app).get("/no-such-observability-route");
    expect(missing.status).toBe(404);

    const lines = parseLines(capture.chunks);
    const byStatus = new Map(lines.map((line) => [line.status, line]));
    expect(byStatus.get(401)?.path).toBe("/orders/:id");
    expect(byStatus.get(404)?.path).toBe("unmatched");
    for (const line of lines) {
      expect(JSON.stringify(line)).not.toContain("11111111-1111-4111-8111-111111111111");
      expect(JSON.stringify(line)).not.toContain("no-such-observability-route");
    }
  });
});

describe("error logging", () => {
  it("keeps the raw 500 message out of the response but in the sanitized error log with reqId", async () => {
    const secret = "boom-secreto-SQL-SELECT-*";
    const app = createApp({
      resolveIdentity: () => {
        throw new Error(secret);
      }
    });
    const res = await request(app).get("/health");

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ ok: false, error: { code: "INTERNAL_ERROR", message: "Error interno del servidor" } });
    expect(JSON.stringify(res.body)).not.toContain(secret);

    const headerId = res.headers["x-request-id"] as string | undefined;
    const lines = parseLines(capture.chunks);
    const errorLine = lines.find((line) => line.level === "error");
    // The resolver throws before routing, so no route was ever matched.
    expect(errorLine).toMatchObject({ method: "GET", path: "unmatched", reqId: headerId });
    expect(errorLine?.name).toBe("Error");
    expect(String(errorLine?.message)).toContain("boom-secreto");
    expect(String(errorLine?.message ?? "").length).toBeLessThanOrEqual(200);
  });
});

describe("auth audit logging", () => {
  it("a failed login never leaves the password in the logs", async () => {
    const password = "Secreto-Oculta-123!";
    const res = await request(createApp())
      .post("/api/v1/auth/login")
      .send({ identifier: "nadie@beim.test", password });

    expect(res.status).toBe(401);

    const raw = capture.chunks.join("\n");
    expect(raw).not.toContain(password);
    expect(raw.toLowerCase()).not.toContain("password");
    const lines = parseLines(capture.chunks);
    expect(lines.some((line) => line.event === "webshop_login" && line.ok === false)).toBe(true);
    expect(lines.find((line) => line.status === 401)?.path).toBe("/auth/login");
  });

  it("success and error on the same route share one path label (no split series)", async () => {
    const app = createApp();
    const ok = await request(app)
      .post("/api/v1/auth/register")
      .send({ name: "Observabilidad Test", email: "obs-uniform@beim.test", password: "Clav3-Segura!x" });
    expect(ok.status).toBe(201);
    const invalid = await request(app).post("/api/v1/auth/register").send({ name: "x" });
    expect(invalid.status).toBe(422);

    const lines = parseLines(capture.chunks);
    const byStatus = new Map(lines.map((line) => [line.status, line]));
    expect(byStatus.get(201)?.path).toBe("/auth/register");
    expect(byStatus.get(422)?.path).toBe("/auth/register");
  });
});

describe("GET /metrics", () => {
  it("exposes the three families with values above zero after traffic (no auth)", async () => {
    const app = createApp();
    await request(app).get("/health");
    await request(app).get("/health");
    await request(app).get("/no-such-observability-route");

    const res = await request(app).get("/metrics");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/plain");
    expect(res.headers["x-request-id"]).toMatch(/^[0-9a-f-]{8}$/);
    const body = res.text;
    expect(body).toContain("http_requests_total");
    expect(body).toContain("http_request_duration_seconds_bucket");
    expect(body).toContain("pg_pool_total");
    expect(body).toContain("pg_pool_idle");
    expect(body).toContain("pg_pool_waiting");
    const counterValues = [...body.matchAll(/^http_requests_total\{[^}]*\} (\d+)/gm)].map((m) => Number(m[1]));
    expect(counterValues.length).toBeGreaterThan(0);
    expect(Math.max(...counterValues)).toBeGreaterThan(0);
    const histogramCounts = [
      ...body.matchAll(/^http_request_duration_seconds_count\{[^}]*\} (\d+)/gm)
    ].map((m) => Number(m[1]));
    expect(Math.max(...histogramCounts)).toBeGreaterThan(0);
  });

  it("renders live pool gauges, including nonzero values via the injected provider", async () => {
    // Default provider: the real node-pg pool (zeros here — this DB-free
    // suite never opens a connection), still rendered as gauges.
    expect(renderMetrics()).toMatch(/^pg_pool_total \d+$/m);
    expect(renderMetrics()).toMatch(/^pg_pool_idle \d+$/m);
    expect(renderMetrics()).toMatch(/^pg_pool_waiting \d+$/m);

    setPoolStatsProvider(() => ({ total: 3, idle: 2, waiting: 1 }));
    const rendered = renderMetrics();
    expect(rendered).toContain("pg_pool_total 3");
    expect(rendered).toContain("pg_pool_idle 2");
    expect(rendered).toContain("pg_pool_waiting 1");
  });
});
