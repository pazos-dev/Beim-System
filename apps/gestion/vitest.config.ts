import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react() as unknown as import("vitest/config").Plugin],
  test: {
    environment: "node",
    environmentOptions: {
      jsdom: {
        url: "http://localhost/"
      }
    },
    setupFiles: ["src/test/setup.ts"],
    // Files that mutate shared process.env / session-store state (e.g.
    // GESTION_DATA_DIR) must not run concurrently: AuthService resolves its
    // directory at call time, so parallel files can cross-contaminate the env
    // and write test audit events into the repository data directory.
    fileParallelism: false,
    // Server tests use Node by default; component tests opt into JSDOM with
    // `// @vitest-environment jsdom` at the top of each test file.
    include: ["src/**/*.test.ts", "app/**/*.test.ts", "*.test.ts", "**/*.test.tsx"]
  }
});
