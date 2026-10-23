// 把 manifest.json、content.css 和 icons 复制进构建产物目录，只用 Node 内置 fs，不引入额外依赖。
import { copyFileSync, mkdirSync, cpSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = join(__dirname, "..", "dist");

mkdirSync(distDir, { recursive: true });

copyFileSync(join(__dirname, "..", "manifest.json"), join(distDir, "manifest.json"));
console.log("manifest.json -> dist/manifest.json");

copyFileSync(join(__dirname, "..", "src", "content.css"), join(distDir, "content.css"));
console.log("content.css -> dist/content.css");

const iconsDir = join(__dirname, "..", "icons");
const distIconsDir = join(distDir, "icons");
if (existsSync(iconsDir)) {
  mkdirSync(distIconsDir, { recursive: true });
  cpSync(iconsDir, distIconsDir, { recursive: true });
  console.log("icons/ -> dist/icons/");
}

