import { defineConfig } from "vite";

/** MV3 service worker 打成 iife，避免 import 语句的模块加载兼容性问题。 */
export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: false,
    lib: {
      entry: "src/background.ts",
      formats: ["iife"],
      name: "ChunklyBackground",
      fileName: () => "background.js",
    },
  },
});
