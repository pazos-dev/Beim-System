import { randomUUID } from "node:crypto";

import type { Uuid } from "../../domain/shared/types.js";

/**
 * Production `Uuid` binding (infrastructure slice, Unit 1 foundation).
 * Use cases keep depending on the domain port; this adapter only mints
 * v4 uuids. No state, no side effect at import time.
 */
export class SystemUuid implements Uuid {
  generate(): string {
    return randomUUID();
  }
}
