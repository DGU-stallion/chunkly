import { defineConfig, loadEnv } from "vite";

/**
 * MV3 service worker 打成 iife，避免 import 语句的模块加载兼容性问题。
 *
 * 官方模式的 API Key 在这里**构建时注入**（define），而不是存进设置页：
 * 设置页是用户可见、可读的，把开发者的密钥放在那里等于把它交给每一个用户。
 * Key 只存在于打包后的 background.js 里，而 background 是唯一发请求的地方。
 *
 * 注入值来自构建时的环境变量 CHUNKLY_OFFICIAL_API_KEY。没配就注入空串，
 * 此时官方模式会提示用户改用自定义模式（见 background.ts 的 NO_OFFICIAL_KEY）。
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const officialKey = env.CHUNKLY_OFFICIAL_API_KEY ?? "";

  return {
    define: {
      __CHUNKLY_OFFICIAL_API_KEY__: JSON.stringify(officialKey),
    },
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
  };
});
