/**
 * Readiness probe helper: runs an injected query with a timeout.
 *
 * The query is injected (`runQuery`) so this stays dependency-free (no
 * `pg`, no pool, no config imports — no import cycles) and unit-testable
 * without a database. Production wires `() => query("SELECT 1")`.
 */
export async function checkDatabase(
  runQuery: () => Promise<unknown>,
  timeoutMs = 2000
): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const onTimeout = new Promise<false>((resolve) => {
      timer = setTimeout(() => resolve(false), timeoutMs);
    });
    // The rejection branch converts any query failure into `false`, so the
    // probe promise only ever resolves: a late failure arriving after the
    // timeout already won the race cannot surface as an unhandled rejection.
    const probe = Promise.resolve()
      .then(runQuery)
      .then(
        () => true as const,
        () => false as const
      );
    return await Promise.race([probe, onTimeout]);
  } finally {
    // Cleared on both paths (query won or timeout won): no hanging timers.
    if (timer !== undefined) clearTimeout(timer);
  }
}
