import { defineConfig } from "vite";

/** content script 必须打成无 import/export 的独立脚本，用 iife 格式内联所有依赖（包括 @chunkly/engine）。 */
export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: false,
    lib: {
      entry: "src/content.ts",
      formats: ["iife"],
      name: "ChunklyContent",
      fileName: () => "content.js",
    },
  },
});
