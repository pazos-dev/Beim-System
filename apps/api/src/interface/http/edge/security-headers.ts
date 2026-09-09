import type { NextFunction, Request, Response } from "express";

/**
 * Baseline security headers (no dependencies). Applied globally in app.ts
 * before the routers so every JSON envelope and upload response carries them.
 *
 * No HSTS on purpose: the app serves plain HTTP without TLS, so advertising
 * Strict-Transport-Security would be misleading. TLS terminates upstream
 * (reverse proxy / platform), which is where HSTS belongs.
 */
export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "DENY");
  next();
}
