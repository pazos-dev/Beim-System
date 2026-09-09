"use client";

// Mounted once under QueryProvider in app/app/layout.tsx. Renders nothing;
// its only job is keeping the session slice populated app-wide.
//
// The canonical session query contract (key, fetch, parse, sync) lives in
// `src/hooks/useSession.ts` (single owner). The re-exports below keep
// existing importers (`ConfiguracionPanel`) resolving until their migration.

import { useSessionSync } from "../hooks/useSession";

export {
  SESSION_QUERY_KEY,
  fetchSessionActor,
  sessionQueryOptions
} from "../hooks/useSession";

export function SessionBootstrap() {
  useSessionSync();
  return null;
}
