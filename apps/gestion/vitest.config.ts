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
    // Server tests use Node by default; component tests opt into JSDOM with
    // `// @vitest-environment jsdom` at the top of each test file.
    include: ["src/**/*.test.ts", "*.test.ts", "**/*.test.tsx"]
  }
});
