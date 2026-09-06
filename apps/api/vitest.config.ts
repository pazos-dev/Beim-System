import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Integration suites (contract.test.ts, gestion-services.test.ts,
    // gestion-api.test.ts) share the beim_api_test create/drop lifecycle with
    // strict ordering requirements — file-parallelism must stay OFF.
    fileParallelism: false
  }
});