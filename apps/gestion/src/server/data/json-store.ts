import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { z } from "zod";

import { err, ok, type Result } from "../handlers/result";

export const JSON_STORE_ERROR_CODES = {
  CONFLICT: "CONFLICT",
  STORAGE_ERROR: "STORAGE_ERROR",
  VALIDATION_ERROR: "VALIDATION_ERROR"
} as const;

export type JsonStoreErrorCode = (typeof JSON_STORE_ERROR_CODES)[keyof typeof JSON_STORE_ERROR_CODES];

export const JSON_STORE_ERROR_REASONS = {
  NOT_FOUND: "NOT_FOUND",
  INVALID_DOCUMENT: "INVALID_DOCUMENT",
  IO: "IO",
  VERSION: "VERSION"
} as const;

export type JsonStoreErrorReason =
  (typeof JSON_STORE_ERROR_REASONS)[keyof typeof JSON_STORE_ERROR_REASONS];

export interface JsonStoreError {
  code: JsonStoreErrorCode;
  message: string;
  reason: JsonStoreErrorReason;
}

export interface VersionedDocument {
  version: number;
}

export interface JsonStoreFileSystem {
  readFile(filePath: string, encoding: "utf8"): Promise<string>;
  writeFile(filePath: string, contents: string, encoding: "utf8"): Promise<void>;
  rename(sourcePath: string, destinationPath: string): Promise<void>;
  mkdir(directoryPath: string, options: { recursive: true }): Promise<string | undefined>;
  unlink(filePath: string): Promise<void>;
}

export interface JsonStoreOptions {
  fileSystem?: Partial<JsonStoreFileSystem>;
}

export interface JsonStoreConfig<T extends VersionedDocument> extends JsonStoreOptions {
  filePath: string;
  schema: z.ZodType<T>;
}

const nodeFileSystem: JsonStoreFileSystem = {
  readFile,
  writeFile,
  rename,
  mkdir,
  unlink
};

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function errorForRead(error: unknown): JsonStoreError {
  if (isErrnoException(error) && error.code === "ENOENT") {
    return {
      code: JSON_STORE_ERROR_CODES.STORAGE_ERROR,
      message: "The JSON store file does not exist.",
      reason: JSON_STORE_ERROR_REASONS.NOT_FOUND
    };
  }

  return {
    code: JSON_STORE_ERROR_CODES.STORAGE_ERROR,
    message: "The JSON store could not be read.",
    reason: JSON_STORE_ERROR_REASONS.IO
  };
}

function storageError(message: string): JsonStoreError {
  return {
    code: JSON_STORE_ERROR_CODES.STORAGE_ERROR,
    message,
    reason: JSON_STORE_ERROR_REASONS.IO
  };
}

export class JsonStore<T extends VersionedDocument> {
  private readonly filePath: string;
  private readonly schema: z.ZodType<T>;
  private readonly fileSystem: JsonStoreFileSystem;
  private writeQueue: Promise<void> = Promise.resolve();

  public constructor(config: JsonStoreConfig<T>);
  public constructor(filePath: string, schema: z.ZodType<T>, options?: JsonStoreOptions);
  public constructor(
    configOrFilePath: JsonStoreConfig<T> | string,
    schema?: z.ZodType<T>,
    options: JsonStoreOptions = {}
  ) {
    const config = typeof configOrFilePath === "string"
      ? { filePath: configOrFilePath, schema, fileSystem: options.fileSystem }
      : configOrFilePath;

    if (!config.schema) {
      throw new Error("JsonStore requires a schema.");
    }

    this.filePath = config.filePath;
    this.schema = config.schema;
    this.fileSystem = {
      readFile: config.fileSystem?.readFile ?? nodeFileSystem.readFile,
      writeFile: config.fileSystem?.writeFile ?? nodeFileSystem.writeFile,
      rename: config.fileSystem?.rename ?? nodeFileSystem.rename,
      mkdir: config.fileSystem?.mkdir ?? nodeFileSystem.mkdir,
      unlink: config.fileSystem?.unlink ?? nodeFileSystem.unlink
    };
  }

  public async read(): Promise<Result<T, JsonStoreError>> {
    let raw: string;
    try {
      raw = await this.fileSystem.readFile(this.filePath, "utf8");
    } catch (error: unknown) {
      return err(errorForRead(error));
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      return err({
        code: JSON_STORE_ERROR_CODES.STORAGE_ERROR,
        message: "The JSON store contains invalid JSON.",
        reason: JSON_STORE_ERROR_REASONS.INVALID_DOCUMENT
      });
    }

    return this.validate(parsed);
  }

  public write(document: T, expectedVersion?: number): Promise<Result<T, JsonStoreError>> {
    const operation = this.writeQueue.then(() => this.writeSerialized(document, expectedVersion));
    this.writeQueue = operation.then(
      () => undefined,
      () => undefined
    );
    return operation;
  }

  private validate(input: unknown): Result<T, JsonStoreError> {
    const parsed = this.schema.safeParse(input);
    if (!parsed.success) {
      return err({
        code: JSON_STORE_ERROR_CODES.STORAGE_ERROR,
        message: "The JSON store document does not match its schema.",
        reason: JSON_STORE_ERROR_REASONS.INVALID_DOCUMENT
      });
    }

    if (!Number.isInteger(parsed.data.version) || parsed.data.version < 0) {
      return err({
        code: JSON_STORE_ERROR_CODES.STORAGE_ERROR,
        message: "The JSON store document has an invalid version.",
        reason: JSON_STORE_ERROR_REASONS.VERSION
      });
    }

    return ok(parsed.data);
  }

  private async writeSerialized(document: T, expectedVersion?: number): Promise<Result<T, JsonStoreError>> {
    const candidate = this.validate(document);
    if (!candidate.ok) {
      return candidate;
    }

    const current = await this.read();
    const currentVersion = current.ok
      ? current.value.version
      : current.error.reason === JSON_STORE_ERROR_REASONS.NOT_FOUND
        ? 0
        : undefined;

    if (currentVersion === undefined) {
      return current;
    }

    const requiredVersion = expectedVersion ?? currentVersion;
    if (currentVersion !== requiredVersion || candidate.value.version !== requiredVersion + 1) {
      return err({
        code: JSON_STORE_ERROR_CODES.CONFLICT,
        message: "The JSON store version is stale.",
        reason: JSON_STORE_ERROR_REASONS.VERSION
      });
    }

    let serialized: string;
    try {
      serialized = JSON.stringify(candidate.value, null, 2);
    } catch {
      return err(storageError("The JSON store document could not be serialized."));
    }

    const temporaryPath = `${this.filePath}.tmp`;
    try {
      await this.fileSystem.mkdir(dirname(this.filePath), { recursive: true });
      await this.fileSystem.writeFile(temporaryPath, `${serialized}\n`, "utf8");
      await this.fileSystem.rename(temporaryPath, this.filePath);
    } catch {
      try {
        await this.fileSystem.unlink(temporaryPath);
      } catch {
        // Cleanup is best effort; the live destination was never replaced.
      }
      return err(storageError("The JSON store could not be written atomically."));
    }

    return candidate;
  }
}
