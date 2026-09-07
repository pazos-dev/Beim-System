import { createHash } from "node:crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { query } from "../config/db.js";
import { ConflictError, ValidationError } from "../errors/taxonomy.js";

/**
 * POST idempotency middleware (issue #88).
 *
 * Clients send `Idempotency-Key: <uuid>` on retriable creates. The first
 * request with a fresh key owns it, executes the handler, and persists the
 * 2xx response; a retry with the same key + payload replays the stored
 * status + body without re-executing the handler. Keys live 24h
 * (expires_at), scoped per (key, scope, user_id).
 *
 * Mount AFTER the auth guard and BEFORE validate: without req.identity the
 * middleware passes through so the auth gate decides; validation failures
 * must not poison the key (they delete the placeholder via the error path).
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Replay marker header, set only when the response comes from the store. */
export const IDEMPOTENT_REPLAYED_HEADER = "Idempotent-Replayed";

interface StoredKey {
  request_hash: string;
  response_status: number | null;
  response_json: unknown;
  expires_at: Date;
}

function readKeyHeader(req: Request): string | undefined {
  const raw = req.headers["idempotency-key"];
  if (raw === undefined) return undefined;
  return Array.isArray(raw) ? raw[0] : raw;
}

function hashBody(body: unknown): string {
  return createHash("sha256").update(JSON.stringify(body ?? null)).digest("hex");
}

function deleteKey(key: string, scope: string, userId: string): Promise<unknown> {
  return query("DELETE FROM idempotency_keys WHERE key = $1 AND scope = $2 AND user_id = $3", [
    key,
    scope,
    userId
  ]);
}

export function idempotency(scope: string): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    void run(req, res, next, scope).catch(next);
  };
}

async function run(req: Request, res: Response, next: NextFunction, scope: string): Promise<void> {
  const key = readKeyHeader(req);
  // No key: current behavior (every request executes).
  if (key === undefined || key.length === 0) {
    next();
    return;
  }
  if (!UUID_RE.test(key)) {
    next(new ValidationError("Idempotency-Key inválida: debe ser un UUID"));
    return;
  }
  // No identity yet: let the auth guard decide (mounted before this).
  const identity = req.identity;
  if (identity === undefined) {
    next();
    return;
  }
  const userId = identity.userId;
  const requestHash = hashBody(req.body);

  // Opportunistic sweep of expired keys (indexed on expires_at).
  await query("DELETE FROM idempotency_keys WHERE expires_at < now()");

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const inserted = await query(
      `INSERT INTO idempotency_keys (key, scope, user_id, request_hash, expires_at)
       VALUES ($1, $2, $3, $4, now() + interval '24 hours')
       ON CONFLICT DO NOTHING`,
      [key, scope, userId, requestHash]
    );

    if ((inserted.rowCount ?? 0) > 0) {
      ownKey(req, res, next, scope, key, userId);
      return;
    }

    const { rows } = await query<StoredKey>(
      `SELECT request_hash, response_status, response_json, expires_at
       FROM idempotency_keys WHERE key = $1 AND scope = $2 AND user_id = $3`,
      [key, scope, userId]
    );
    const stored = rows[0];
    if (stored === undefined) {
      // Swept concurrently between insert and select: retry as new.
      continue;
    }
    if (stored.expires_at.getTime() < Date.now()) {
      await deleteKey(key, scope, userId);
      continue;
    }
    if (stored.response_status === null) {
      next(new ConflictError("Solicitud en curso, reintente"));
      return;
    }
    if (stored.request_hash !== requestHash) {
      next(new ValidationError("Idempotency-Key en uso con un cuerpo distinto"));
      return;
    }
    res.set(IDEMPOTENT_REPLAYED_HEADER, "true");
    res.status(stored.response_status).json(stored.response_json);
    return;
  }

  // Lost every race: fail loud instead of executing twice.
  next(new ConflictError("Solicitud en curso, reintente"));
}

/**
 * We own the key: capture the 2xx response via res.json (persisted BEFORE
 * sending, so a replay can never observe a missing row) and delete the
 * placeholder on any downstream failure so errors never poison the key.
 * Downstream errors surface through the central errorHandler, which answers
 * via the same res.json — the non-2xx branch deletes the row and the error
 * keeps flowing to the client untouched.
 */
function ownKey(
  _req: Request,
  res: Response,
  next: NextFunction,
  scope: string,
  key: string,
  userId: string
): void {
  const originalJson = res.json.bind(res);
  res.json = ((body: unknown) => {
    const status = res.statusCode;
    if (status >= 200 && status < 300) {
      return query(
        `UPDATE idempotency_keys SET response_status = $1, response_json = $2::jsonb
         WHERE key = $3 AND scope = $4 AND user_id = $5`,
        [status, JSON.stringify(body ?? null), key, scope, userId]
      ).then(() => originalJson(body));
    }
    return deleteKey(key, scope, userId).then(() => originalJson(body));
  }) as unknown as typeof res.json;
  next();
}
