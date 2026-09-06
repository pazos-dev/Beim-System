import { createApp } from "./app.js";
import { loadConfig } from "./config/env.js";
import { pool } from "./config/db.js";

const config = loadConfig();
const app = createApp();
const port = config.port;

const server = app.listen(port, () => {
  console.log(`[api] listening on http://localhost:${port} (env: ${config.nodeEnv})`);
});

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