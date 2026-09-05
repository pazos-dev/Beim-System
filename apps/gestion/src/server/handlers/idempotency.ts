import { createHash } from "node:crypto";

import { idempotencyKeySchema, type GestionError, type IdempotencyDocument } from "../data/schemas";
import { JsonStore, JSON_STORE_ERROR_REASONS, type JsonStoreError } from "../data/json-store";
import { createGestionError, ERROR_CODES } from "./errors";
import { err, ok, type Result } from "./result";

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item));
  }

  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(record)
      .sort()
      .map((key) => [key, canonicalize(record[key])])
  );
}

export function hashPayload(payload: unknown): string {
  const canonicalPayload = JSON.stringify(canonicalize(payload)) ?? "undefined";
  return createHash("sha256").update(canonicalPayload).digest("hex");
}

function mapStoreError(error: JsonStoreError): GestionError {
  if (error.code === "CONFLICT") {
    return createGestionError(ERROR_CODES.CONFLICT);
  }
  return createGestionError(ERROR_CODES.STORAGE_ERROR);
}

export class IdempotencyService {
  private readonly store: JsonStore<IdempotencyDocument>;
  private executionQueue: Promise<void> = Promise.resolve();

  public constructor(store: JsonStore<IdempotencyDocument> | { store: JsonStore<IdempotencyDocument> }) {
    this.store = store instanceof JsonStore ? store : store.store;
  }

  public execute<T>(
    keyInput: unknown,
    payload: unknown,
    effect: () => Promise<Result<T, GestionError>>
  ): Promise<Result<T, GestionError>> {
    const operation = this.executionQueue.then(() => this.executeSerialized(keyInput, payload, effect));
    this.executionQueue = operation.then(
      () => undefined,
      () => undefined
    );
    return operation;
  }

  private async executeSerialized<T>(
    keyInput: unknown,
    payload: unknown,
    effect: () => Promise<Result<T, GestionError>>
  ): Promise<Result<T, GestionError>> {
    const parsedKey = idempotencyKeySchema.safeParse(keyInput);
    if (!parsedKey.success) {
      return err(createGestionError(ERROR_CODES.VALIDATION_ERROR));
    }

    const key = parsedKey.data;
    const payloadHash = hashPayload(payload);
    const current = await this.store.read();
    let records: IdempotencyDocument["records"];
    if (current.ok) {
      records = current.value.records;
    } else if (current.error.reason === JSON_STORE_ERROR_REASONS.NOT_FOUND) {
      records = [];
    } else {
      return err(mapStoreError(current.error));
    }

    const existing = records.find((record) => record.key === key);
    if (existing !== undefined) {
      if (existing.payloadHash !== payloadHash) {
        return err(createGestionError(ERROR_CODES.CONFLICT));
      }
      return existing.result as Result<T, GestionError>;
    }

    let result: Result<T, GestionError>;
    try {
      result = await effect();
    } catch {
      return err(createGestionError(ERROR_CODES.STORAGE_ERROR));
    }

    if (!result.ok) {
      return result;
    }

    const currentVersion = current.ok ? current.value.version : 0;
    const nextDocument: IdempotencyDocument = {
      version: currentVersion + 1,
      records: [
        ...records,
        {
          key,
          payloadHash,
          result,
          createdAt: new Date().toISOString()
        }
      ]
    };
    const written = await this.store.write(nextDocument, current.ok ? current.value.version : undefined);
    if (!written.ok) {
      return err(mapStoreError(written.error));
    }

    return result;
  }
}
