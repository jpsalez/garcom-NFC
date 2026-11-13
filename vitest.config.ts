import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/global-setup.ts"],
    setupFiles: ["tests/setup.ts"],
    // Um único banco compartilhado: arquivos de teste rodam um por vez
    fileParallelism: false,
    testTimeout: 15000,
  },
});
