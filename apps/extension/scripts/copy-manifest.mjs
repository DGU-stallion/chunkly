// 把 manifest.json 复制进构建产物目录，只用 Node 内置 fs，不引入额外依赖。
import { copyFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = join(__dirname, "..", "manifest.json");
const distDir = join(__dirname, "..", "dist");
const dest = join(distDir, "manifest.json");

mkdirSync(distDir, { recursive: true });
copyFileSync(src, dest);
console.log("manifest.json -> dist/manifest.json");
