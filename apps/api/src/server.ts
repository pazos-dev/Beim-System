import { createApp } from "./app.js";
import { loadConfig } from "./config/env.js";
import { pool } from "./config/db.js";
import { resolveBearerIdentity } from "./modules/webshop/webshop-token.js";

const config = loadConfig();
// Session resolution: Bearer webshop session → Identity. Requests without a
// usable identity stay anonymous and the gestion role gates answer 404
// (NOT_FOUND_OR_FORBIDDEN); only admin/superadmin sessions pass ADMIN gates
// — operator roles stay fail-closed until gestion_users issuance exists.
const app = createApp({ resolveIdentity: resolveBearerIdentity });
const port = config.port;

const server = app.listen(port, () => {
  console.log(`[api] listening on http://localhost:${port} (env: ${config.nodeEnv})`);
});

// Bounded request lifecycle (Express 5 / Node http.Server API): slow clients
// cannot hold connections open forever. headersTimeout stays above
// requestTimeout so incomplete headers fail first with a clear timeout.
server.setTimeout(30_000);
server.requestTimeout = 30_000;
server.headersTimeout = 35_000;

function shutdown(signal: NodeJS.Signals): void {
  console.log(`[api] ${signal} received, shutting down`);
  server.close(() => {
    pool
      .end()
      .then(() => {
        process.exit(0);
      })
      .catch((err: unknown) => {
        console.error("[api] error closing database pool:", err);
        process.exit(1);
      });
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));