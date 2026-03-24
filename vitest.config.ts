import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "tests/unit/**/*.test.ts",
      "tests/integration/provider-failures.integration.test.ts",
    ],
    testTimeout: 20000,
  },
});
