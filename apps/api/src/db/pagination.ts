/**
 * Shared pagination clamp.
 *
 * Single definition of the list bounds contract: 1-based page floored at 1
 * (default 1), limit clamped to 1..100 (default 20). Offset derives from the
 * clamped values so SQL LIMIT/OFFSET bindings stay consistent.
 */
export function clampPagination(
  page?: number,
  limit?: number
): { page: number; limit: number; offset: number } {
  const safePage = Math.max(page ?? 1, 1);
  const safeLimit = Math.min(Math.max(limit ?? 20, 1), 100);
  return { page: safePage, limit: safeLimit, offset: (safePage - 1) * safeLimit };
}
