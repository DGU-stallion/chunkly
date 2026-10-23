import { defineConfig, loadEnv } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * MV3 service worker 打成 iife，避免 import 语句的模块加载兼容性问题。
 *
 * 官方模式的 API Key 在这里**构建时注入**（define），而不是存进设置页：
 * 设置页是用户可见、可读的，把开发者的密钥放在那里等于把它交给每一个用户。
 * Key 只存在于打包后的 background.js 里，而 background 是唯一发请求的地方。
 *
 * 注入值优先读取系统环境变量，以及项目根目录与子目录中的 .env 文件。
 */
export default defineConfig(({ mode }) => {
  const rootDir = path.resolve(__dirname, "../..");
  const rootEnv = loadEnv(mode, rootDir, "");
  const localEnv = loadEnv(mode, process.cwd(), "");

  // 发布打包（BUILD_RELEASE=true）时强制置空私有密钥，保护开发者账户安全；
  // 本地开发/日常使用（无 BUILD_RELEASE）则正常读取本地 .env 注入，保持本地无缝体验。
  const isRelease = process.env.BUILD_RELEASE === "true" || process.env.RELEASE === "1";
  const officialKey = isRelease
    ? ""
    : process.env.CHUNKLY_OFFICIAL_API_KEY ||
      rootEnv.CHUNKLY_OFFICIAL_API_KEY ||
      localEnv.CHUNKLY_OFFICIAL_API_KEY ||
      "";

  if (isRelease) {
    console.log("🛡️ [Vite] 正在进行纯净 Release 构建：已彻底剔除私有 API Key。");
  } else if (officialKey) {
    console.log("🔑 [Vite] 本地开发构建：已注入本地环境配置。");
  }

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
