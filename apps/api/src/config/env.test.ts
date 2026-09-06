import { describe, expect, it } from "vitest";
import { buildConnectionString, loadConfig } from "./env.js";

describe("loadConfig", () => {
  it("throws when neither DATABASE_URL nor PG* parts are provided", () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL|PG/);
  });

  it("uses DATABASE_URL with default PORT 4000 and NODE_ENV development", () => {
    const config = loadConfig({ DATABASE_URL: "postgres://beim@127.0.0.1:5432/beim_api" });
    expect(config.port).toBe(4000);
    expect(config.nodeEnv).toBe("development");
    expect(config.database.connectionString).toBe("postgres://beim@127.0.0.1:5432/beim_api");
  });

  it("parses PORT and NODE_ENV overrides", () => {
    const config = loadConfig({
      DATABASE_URL: "postgres://beim@127.0.0.1:5432/beim_api",
      PORT: "8080",
      NODE_ENV: "production"
    });
    expect(config.port).toBe(8080);
    expect(config.nodeEnv).toBe("production");
  });

  it("prefers DATABASE_URL over PG* parts when both are present", () => {
    const config = loadConfig({
      DATABASE_URL: "postgres://beim@127.0.0.1:5432/beim_api",
      PGHOST: "other-host",
      PGDATABASE: "other-db"
    });
    expect(config.database.connectionString).toBe("postgres://beim@127.0.0.1:5432/beim_api");
  });

  it("builds the connection string from PG* parts when DATABASE_URL is absent", () => {
    const config = loadConfig({
      PGHOST: "127.0.0.1",
      PGPORT: "5433",
      PGDATABASE: "beim_api",
      PGUSER: "beim"
    });
    expect(config.database.connectionString).toBe("postgres://beim@127.0.0.1:5433/beim_api");
  });

  it("rejects an invalid PORT", () => {
    expect(() => loadConfig({ DATABASE_URL: "postgres://beim@127.0.0.1:5432/beim_api", PORT: "abc" })).toThrow();
  });

  it("rejects an invalid NODE_ENV", () => {
    expect(() =>
      loadConfig({ DATABASE_URL: "postgres://beim@127.0.0.1:5432/beim_api", NODE_ENV: "staging" })
    ).toThrow();
  });
});

describe("buildConnectionString", () => {
  it("returns undefined when database or user is missing", () => {
    expect(buildConnectionString({ database: "beim_api", user: undefined })).toBeUndefined();
    expect(buildConnectionString({ database: undefined, user: "beim" })).toBeUndefined();
  });

  it("defaults host to 127.0.0.1 and port to 5432", () => {
    expect(buildConnectionString({ database: "beim_api", user: "beim" })).toBe(
      "postgres://beim@127.0.0.1:5432/beim_api"
    );
  });

  it("URL-encodes user and password", () => {
    expect(buildConnectionString({ host: "h", database: "d", user: "u@1", password: "p@s:s" })).toBe(
      "postgres://u%401:p%40s%3As@h:5432/d"
    );
  });
});