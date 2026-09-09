/**
 * Re-home of the frozen `Errores` taxonomy import path (domain slice,
 * change `clean-arch-domain`, path-only).
 *
 * The canonical taxonomy still lives in `src/errors/taxonomy.ts` — codes
 * and messages are frozen and MUST NOT change here. This module re-exports
 * it so domain code imports taxonomy symbols from the new path; the legacy
 * path keeps working untouched (its removal happens at cutover, NOT here).
 */
export * from "../../errors/taxonomy.js";
