import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    include: ["tests/settings/**/*.test.{ts,tsx}"],
    setupFiles: ["tests/auth/setup.ts"],
    restoreMocks: true,
    clearMocks: true,
  },
});
