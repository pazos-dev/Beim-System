"use client";

// Mounted once under QueryProvider in app/app/layout.tsx. Renders nothing.
// Bearer transport (PR2): the token lives in memory only, so a reload starts
// logged out and there is no session endpoint to poll. The mount keeps the
// manual sync entry point (`useSessionSync`, the sole slice writer) wired
// app-wide for login/logout-driven updates.

import { useSessionSync } from "../hooks/useSession";

export function SessionBootstrap() {
  useSessionSync();
  return null;
}
