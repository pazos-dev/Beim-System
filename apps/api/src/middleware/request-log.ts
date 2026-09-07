/**
 * Request logging middleware (issue #94).
 *
 * Assigns a short reqId to every request, echoes it back in the
 * `X-Request-Id` header, and logs exactly ONE JSON line when the response
 * finishes: { reqId, method, path, status, ms, ip }.
 *
 * The path uses the BOUNDED route pattern (`req.route?.path` + `baseUrl`),
 * never the raw URL with ids — otherwise high cardinality ids would explode
 * log storage and metric series. Unmatched requests (catch-all 404, or errors
 * thrown before routing) collapse into the literal "unmatched".
 *
 * Normalization: Express only restores `baseUrl` while unwinding through
 * `next(err)`, so terminal successes keep the mount prefix (`/api/v1/...`)
 * while errors report the inner pattern (`/...`). Both routers mount at
 * `/api/v1` (see app.ts), so the prefix is stripped for one uniform label
 * per route — success and error share the same series.
 */
import { randomUUID } from "node:crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { logger } from "../observability/logger.js";

declare global {
  namespace Express {
    interface Request {
      reqId?: string;
    }
  }
}

/** Bounded-cardinality route pattern for the current request. */
export function routePattern(req: Request): string {
  const routePath = (req.route as { path?: unknown } | undefined)?.path;
  const base = req.baseUrl ?? "";
  let raw: string | undefined;
  if (typeof routePath === "string" && routePath.length > 0) {
    raw = `${base}${routePath}`;
  } else if (Array.isArray(routePath)) {
    const joined = routePath.filter((p): p is string => typeof p === "string").join(",");
    if (joined.length > 0) raw = `${base}${joined}`;
  }
  if (raw === undefined || raw.length === 0) return "unmatched";
  return raw.replace(/^\/api\/v1(?=\/|$)/, "");
}

/** Reads req.ip defensively: the socket may already be gone at finish time. */
function safeIp(req: Request): string {
  try {
    return req.ip ?? "unknown";
  } catch {
    return "unknown";
  }
}

export const requestLog: RequestHandler = (req: Request, res: Response, next: NextFunction): void => {
  const reqId = randomUUID().slice(0, 8);
  req.reqId = reqId;
  res.setHeader("X-Request-Id", reqId);
  // Capture up front: at finish time the socket may be closed (req.ip throws).
  const ip = safeIp(req);
  const start = process.hrtime.bigint();
  res.on("finish", () => {
    const ms = Number(process.hrtime.bigint() - start) / 1_000_000;
    logger.info({
      reqId,
      method: req.method,
      path: routePattern(req),
      status: res.statusCode,
      ms: Math.round(ms * 1000) / 1000,
      ip
    });
  });
  next();
};
