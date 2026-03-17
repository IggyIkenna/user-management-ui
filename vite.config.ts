import path from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uiKitSrc = path.resolve(__dirname, "../unified-trading-ui-kit/src");

export default defineConfig(({ mode }) => ({
  resolve: {
    dedupe: ["react", "react-dom", "react-router-dom"],
    alias:
      mode === "development"
        ? [
            {
              find: "@unified-trading/ui-kit/globals.css",
              replacement: path.join(uiKitSrc, "globals.css"),
            },
            {
              find: "@unified-trading/ui-kit",
              replacement: path.join(uiKitSrc, "index.ts"),
            },
            { find: "@", replacement: path.resolve(__dirname, "./src") },
          ]
        : [{ find: "@", replacement: path.resolve(__dirname, "./src") }],
  },
  plugins: [react(), tailwindcss()],
  server: {
    port: 5184,
    strictPort: true,
    proxy: {
      "/api/": {
        target: "http://localhost:8017",
        changeOrigin: true,
      },
    },
  },
}));
