import { Redis } from "ioredis";

/**
 * Fixed-window counter result: hits in the current window plus the timestamp
 * (epoch ms) at which the window resets.
 */
export interface RateLimitHit {
  count: number;
  resetAt: number;
}

/**
 * Fixed-window counter backend shared by every `rateLimit()` middleware.
 *
 * `hit` may resolve synchronously (plain value) or asynchronously: the
 * middleware keeps the synchronous fast path for the in-memory store so the
 * existing sync unit-test contract is preserved, and awaits promise-backed
 * stores (Redis). `clear` is a test hook (sync for memory, async for Redis).
 */
export interface RateLimitStore {
  hit(key: string, windowMs: number): RateLimitHit | Promise<RateLimitHit>;
  clear(): Promise<void> | void;
}

interface Bucket {
  count: number;
  resetAt: number;
}

const MAX_BUCKETS = 10_000;

/**
 * Single-instance store. Holds the exact logic (Map + opportunistic sweep)
 * that used to live inline in the middleware: same keys, same counting, same
 * expiry semantics.
 */
export class MemoryRateLimitStore implements RateLimitStore {
  private readonly buckets = new Map<string, Bucket>();

  hit(key: string, windowMs: number): RateLimitHit {
    const now = Date.now();
    if (this.buckets.size >= MAX_BUCKETS) this.sweepExpired(now);
    const bucket = this.buckets.get(key);
    if (bucket === undefined || now >= bucket.resetAt) {
      const fresh = { count: 1, resetAt: now + windowMs };
      this.buckets.set(key, fresh);
      return { ...fresh };
    }
    bucket.count += 1;
    return { count: bucket.count, resetAt: bucket.resetAt };
  }

  clear(): void {
    this.buckets.clear();
  }

  private sweepExpired(now: number): void {
    for (const [key, bucket] of this.buckets) {
      if (now >= bucket.resetAt) this.buckets.delete(key);
    }
  }
}

const REDIS_KEY_PREFIX = "ratelimit:";

/**
 * Atomic fixed-window increment: INCR the counter, PEXPIRE only on the first
 * hit of a window, then PTTL to derive the reset timestamp. One script means
 * concurrent API instances share a single counter per key.
 */
const HIT_SCRIPT = `
local count = redis.call("INCR", KEYS[1])
if count == 1 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
end
local ttl = redis.call("PTTL", KEYS[1])
return {count, ttl}
`;

/**
 * Multi-instance store backed by Redis. Never throws from `hit`: when Redis
 * is unreachable the hit falls back to an in-process memory counter (fail-open
 * — the limiter must never take the API down) and logs a single warn without
 * any request data (no IPs in logs).
 *
 * The client is injected so unit tests can pass a fake; use `fromUrl` for the
 * shared runtime instance.
 */
export class RedisRateLimitStore implements RateLimitStore {
  private readonly fallback = new MemoryRateLimitStore();

  constructor(private readonly client: Redis) {}

  static fromUrl(url: string): RedisRateLimitStore {
    const client = new Redis(url, {
      // No connection until the first command: processes without Redis
      // traffic (or without the env var ever resolving to a store) never
      // open a socket.
      lazyConnect: true,
      // Fail fast while disconnected: queueing would stall every limited
      // request for the whole outage instead of falling back to memory.
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      // Wall-clock cap per command; a slow Redis degrades to memory counters
      // instead of slow requests.
      commandTimeout: 1_000
    });
    // Connection failures also surface as 'error' events, which would throw
    // without a listener. Per-command rejections already carry the failure to
    // `hit` (warn + fallback there), so this stays a silent guard.
    client.on("error", () => undefined);
    return new RedisRateLimitStore(client);
  }

  /** Release the underlying connection (server shutdown). */
  disconnect(): void {
    this.client.disconnect();
  }

  async hit(key: string, windowMs: number): Promise<RateLimitHit> {
    const redisKey = `${REDIS_KEY_PREFIX}${key}`;
    try {
      const raw = (await this.client.eval(HIT_SCRIPT, 1, redisKey, String(windowMs))) as
        | [number, number]
        | null;
      if (raw === null) throw new Error("empty script result");
      const [count, ttl] = raw;
      return { count, resetAt: Date.now() + Math.max(ttl, 0) };
    } catch {
      console.warn("[rate-limit] Redis unavailable, falling back to in-memory counters");
      return this.fallback.hit(key, windowMs);
    }
  }

  async clear(): Promise<void> {
    // Scoped to our own prefix: never flushes unrelated keys.
    let cursor = "0";
    do {
      const [next, keys] = await this.client.scan(
        cursor,
        "MATCH",
        `${REDIS_KEY_PREFIX}*`,
        "COUNT",
        100
      );
      cursor = next;
      if (keys.length > 0) await this.client.del(...keys);
    } while (cursor !== "0");
  }
}
