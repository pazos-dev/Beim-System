import type { NextFunction, Request, RequestHandler, Response } from "express";

export interface CorsOptions {
  /** Explicit allowlist. When omitted, `CORS_ORIGINS` is read per request. */
  origins?: string[];
}

const ALLOW_METHODS = "GET,POST,PUT,OPTIONS";
const ALLOW_HEADERS = "Content-Type, Authorization";
const MAX_AGE = "86400";

/**
 * Parse the allowlist: comma-separated, trimmed, empties dropped.
 * `*` entries are ignored (fail-closed): a wildcard would open the API to
 * every website, and with Bearer auth in play an arbitrary page must never
 * get a readable response. Unknown origins get no headers at all.
 */
function parseOrigins(raw: string[]): string[] {
  return raw.map((o) => o.trim()).filter((o) => o !== "" && o !== "*");
}

/**
 * Minimal CORS allowlist middleware (no dependencies).
 *
 * The env var is read on every request (never cached at module level) so
 * the allowlist can change without a restart and stays testable.
 * Never sets `Access-Control-Allow-Credentials`: auth is Bearer, not cookies.
 */
export function createCorsMiddleware(options: CorsOptions = {}): RequestHandler {
  const explicit = options.origins;
  return (req: Request, res: Response, next: NextFunction): void => {
    const origins = explicit !== undefined ? parseOrigins(explicit) : parseOrigins((process.env.CORS_ORIGINS ?? "").split(","));
    const origin = req.headers.origin;
    // No Origin (curl, server-to-server): leave the request untouched.
    if (typeof origin !== "string" || origin === "") {
      next();
      return;
    }
    // Foreign origin: no headers, the browser blocks; reveal nothing.
    if (!origins.includes(origin)) {
      next();
      return;
    }
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Methods", ALLOW_METHODS);
      res.setHeader("Access-Control-Allow-Headers", ALLOW_HEADERS);
      res.setHeader("Access-Control-Max-Age", MAX_AGE);
      res.status(204).end();
      return;
    }
    next();
  };
}

/** Default instance: allowlist from `CORS_ORIGINS` (comma-separated). */
export function cors(): RequestHandler {
  return createCorsMiddleware();
}
