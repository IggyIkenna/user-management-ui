import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    pool: "forks",
    teardownTimeout: 5000,
    setupFiles: ["./src/setupTests.ts"],
    passWithNoTests: true,
    exclude: ["**/node_modules/**", "**/tests/smoke/**"],
    include: [
      "src/**/*.test.{ts,tsx}",
      "tests/unit/**/*.test.{ts,tsx}",
      "tests/integration/**/*.integration.test.{ts,tsx}",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      reportsDirectory: "./coverage",
      exclude: [
        "dist/**",
        "*.config.{ts,js,cjs}",
        "eslint.config.js",
        "src/main.tsx",
        "src/vite-env.d.ts",
        "src/**/*.d.ts",
        "src/setupTests.ts",
        "src/**/*.test.{ts,tsx}",
        "e2e/**",
        "tests/**",
        "playwright.config.ts",
        "src/api/types.ts",
        "src/api/client.ts",
        "server/**",
      ],
      thresholds: {
        lines: 70,
        statements: 70,
        functions: 70,
        branches: 70,
      },
    },
  },
});
