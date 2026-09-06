import { z } from "zod";

const ENV_SCHEMA = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1).optional(),
  PGHOST: z.string().min(1).optional(),
  PGPORT: z.coerce.number().int().positive().optional(),
  PGDATABASE: z.string().min(1).optional(),
  PGUSER: z.string().min(1).optional(),
  PGPASSWORD: z.string().optional()
});

export type NodeEnv = z.infer<typeof ENV_SCHEMA>["NODE_ENV"];

export interface DatabaseConfig {
  connectionString: string;
}

export interface Config {
  port: number;
  nodeEnv: NodeEnv;
  database: DatabaseConfig;
}

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 5432;

interface ConnectionParts {
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
}

/**
 * Builds a postgres:// connection string from individual parts. Returns
 * undefined when the minimum identity (database + user) is missing, which
 * forces callers to provide DATABASE_URL instead.
 */
export function buildConnectionString(parts: ConnectionParts): string | undefined {
  const { host = DEFAULT_HOST, port = DEFAULT_PORT, password } = parts;
  if (parts.database === undefined || parts.user === undefined) return undefined;
  const encodedUser = encodeURIComponent(parts.user);
  const encodedPassword = password === undefined ? "" : `:${encodeURIComponent(password)}`;
  return `postgres://${encodedUser}${encodedPassword}@${host}:${port}/${parts.database}`;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = ENV_SCHEMA.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Configuración de entorno inválida: ${issues}`);
  }

  const { PORT, NODE_ENV, DATABASE_URL, PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD } = parsed.data;

  const connectionString =
    DATABASE_URL ??
    buildConnectionString({
      host: PGHOST,
      port: PGPORT,
      database: PGDATABASE,
      user: PGUSER,
      password: PGPASSWORD
    });

  if (connectionString === undefined) {
    throw new Error("Configuración de base de datos faltante: definir DATABASE_URL o PGDATABASE y PGUSER.");
  }

  return {
    port: PORT,
    nodeEnv: NODE_ENV,
    database: { connectionString }
  };
}