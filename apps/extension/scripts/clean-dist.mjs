// 清空 dist 目录。只用 Node 内置 fs，不引入额外依赖。
import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dist = join(__dirname, "..", "dist");

rmSync(dist, { recursive: true, force: true });
console.log("cleaned dist/");
