import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    // Server tests use Node by default; component tests opt into JSDOM with
    // `// @vitest-environment jsdom` at the top of each test file.
    include: ["src/**/*.test.ts", "*.test.ts", "**/*.test.tsx"]
  }
});
