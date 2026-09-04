import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { middleware } from "./middleware.js";
import {
  GESTION_SESSION_COOKIE,
  createSessionCookieValue
} from "./src/server/handlers/session.js";

function buildRequest(path: string, cookie?: string): NextRequest {
  const request = new NextRequest(`http://localhost:3000${path}`);
  if (cookie !== undefined) {
    request.cookies.set(GESTION_SESSION_COOKIE, cookie);
  }
  return request;
}

function redirectPath(response: Response): string | null {
  const location = response.headers.get("location");
  return location === null ? null : new URL(location).pathname;
}

describe("gestion route middleware", () => {
  it("redirects a protected route without a session cookie to login", () => {
    const response = middleware(buildRequest("/app"));

    expect(response.status).toBe(307);
    expect(redirectPath(response)).toBe("/login");
  });

  it("redirects a protected route with a malformed session cookie to login", () => {
    const response = middleware(buildRequest("/app/orders", "not-a-session"));

    expect(response.status).toBe(307);
    expect(redirectPath(response)).toBe("/login");
  });

  it("redirects a protected route with an expired session format to login", () => {
    const expiredCookie = createSessionCookieValue(
      "session-token-0001",
      new Date(Date.now() - 60_000)
    );

    const response = middleware(buildRequest("/app/orders", expiredCookie));

    expect(response.status).toBe(307);
    expect(redirectPath(response)).toBe("/login");
  });

  it("passes through a protected route with a well-formed session cookie", () => {
    const validCookie = createSessionCookieValue(
      "session-token-0001",
      new Date(Date.now() + 60_000)
    );

    const response = middleware(buildRequest("/app/orders", validCookie));

    expect(response.status).toBe(200);
    expect(redirectPath(response)).toBeNull();
  });

  it("passes through a non-protected route without a session cookie", () => {
    const response = middleware(buildRequest("/login"));

    expect(response.status).toBe(200);
    expect(redirectPath(response)).toBeNull();
  });
});
