import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  isLoginBypassActive,
} from "./src/server/handlers/session";

/** Cookie name used for Bearer token auth (must match src/lib/api/cookies.ts). */
const AUTH_TOKEN_COOKIE = "beim_auth_token";

function isProtectedPath(pathname: string): boolean {
  return pathname === "/app" || pathname.startsWith("/app/");
}

export function middleware(request: NextRequest) {
  // Test-only bypass for visual testing without login. Never set in production.
  if (isLoginBypassActive()) {
    return NextResponse.next();
  }

  if (!isProtectedPath(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(AUTH_TOKEN_COOKIE)?.value;
  if (token === undefined || token.trim() === "") {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*"]
};
