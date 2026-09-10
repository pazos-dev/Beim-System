import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * No-legacy-shims gate (F8b4 cutover swap).
 *
 * The PR7 edge re-home kept `src/middleware/*` compatibility shims with a
 * "removal belongs to cutover" note. The cutover deleted them: the canonical
 * modules live in `src/interface/http/edge/`, and `src/middleware/` owns
 * only the central `error-handler.ts` (NOT a shim — the thin routers and
 * the composition root share it) plus behavior tests. This gate fails if a
 * shim file returns or if any source file imports a deleted shim path, so
 * the edge split cannot silently regress.
 *
 * DB-free: filesystem reads only.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = join(HERE, "..", "..");
const MIDDLEWARE_DIR = join(PACKAGE_ROOT, "src", "middleware");

/** Shim modules deleted by the cutover (canonical twins in edge/). */
const DELETED_SHIMS = [
  "auth",
  "cors",
  "idempotency",
  "rate-limit",
  "rate-limit-store",
  "request-log",
  "security-headers",
  "validate"
] as const;

const SHIM_IMPORT = new RegExp(
  `from\\s+["'][^"']*middleware\\/(${DELETED_SHIMS.join("|")})\\.js["']`
);

function collectSourceFiles(dir: string): string[] {
  return readdirSync(dir)
    .map((entry) => join(dir, entry))
    .flatMap((entry) =>
      statSync(entry).isDirectory() ? collectSourceFiles(entry) : [entry]
    )
    .filter((entry) => entry.endsWith(".ts"));
}

describe("no legacy middleware shims", () => {
  it("keeps only the central error handler as a middleware module", () => {
    const modules = readdirSync(MIDDLEWARE_DIR)
      .filter((entry) => entry.endsWith(".ts") && !entry.endsWith(".test.ts"))
      .sort();
    expect(modules).toEqual(["error-handler.ts"]);
  });

  it("has no imports pointing at the deleted shim paths", () => {
    const offenders = collectSourceFiles(join(PACKAGE_ROOT, "src"))
      .filter((file) => !file.endsWith(".test.ts"))
      .map((file) => ({
        file: relative(PACKAGE_ROOT, file),
        line: readFileSync(file, "utf8")
          .split("\n")
          .find((line) => SHIM_IMPORT.test(line))
      }))
      .filter((entry): entry is { file: string; line: string } => entry.line !== undefined);
    expect(offenders).toEqual([]);
  });
});
