/**
 * Shim over the composition root (slice 0.4): the shared pool lives in
 * `src/composition-root.ts`. This path is preserved so existing imports
 * (`./config/db.js`, incl. `server.ts` and `src/db/withTransaction.ts`)
 * keep working with zero logic duplication and identical behavior
 * (pool still built at import time; full injection comes later).
 */
export { pool, query } from "../composition-root.js";
// withTransaction moved to src/db/withTransaction.ts (task 3.3); re-exported
// from here so both import locations keep working.
export { withTransaction } from "../db/withTransaction.js";
export type { TxClient } from "../db/withTransaction.js";
