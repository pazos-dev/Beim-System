/**
 * Shim over the composition root (slice 0.4): the app factory lives in
 * `src/composition-root.ts`. This path is preserved so existing imports
 * (`./app.js`, incl. `server.ts` and tests) keep working with zero
 * logic duplication and identical behavior.
 */
export { createApp } from "./composition-root.js";
export type { CreateAppOptions } from "./composition-root.js";
