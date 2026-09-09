import type { Clock } from "../../domain/shared/types.js";

/**
 * Production `Clock` binding (infrastructure slice, Unit 1 foundation).
 * Use cases keep depending on the domain port; this adapter only reads the
 * wall clock. No state, no side effect at import time.
 */
export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}
