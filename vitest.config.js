import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/worker/**/*.test.{js,ts}", "workers/**/*.test.ts"],
    clearMocks: true,
    restoreMocks: true,
  },
});
