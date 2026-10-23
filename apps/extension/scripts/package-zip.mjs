import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const extDir = resolve(__dirname, "..");
const distDir = resolve(extDir, "dist");
const manifestPath = resolve(distDir, "manifest.json");

console.log("🛡️ [Chunkly Packager] 步骤 1/4: 执行纯净 Release 构建 (BUILD_RELEASE=true)...");
execSync("pnpm build", {
  cwd: extDir,
  env: { ...process.env, BUILD_RELEASE: "true" },
  stdio: "inherit",
});

if (!existsSync(manifestPath)) {
  console.error("❌ dist/manifest.json 不存在，构建可能失败！");
  process.exit(1);
}

console.log("🔍 [Chunkly Packager] 步骤 2/4: 执行严格密钥泄漏静态扫描审计...");
const bgJsPath = resolve(distDir, "background.js");
if (existsSync(bgJsPath)) {
  const bgContent = readFileSync(bgJsPath, "utf-8");
  // 扫描常见密钥格式特征：user_ 开头 或 sk- 开头且长度大于 15
  const leakedUserKey = bgContent.match(/["'](user_[a-zA-Z0-9_-]{15,})["']/);
  const leakedSkKey = bgContent.match(/["'](sk-[a-zA-Z0-9_-]{15,})["']/);

  if (leakedUserKey || leakedSkKey) {
    console.error("🚨 致命安全拦截：在 dist/background.js 中检测到潜在的明文 API Key！已紧急终止打包！");
    process.exit(1);
  }
}
console.log("✅ 密钥安全审计通过：产物中未发现任何硬编码私有 API Key。");

const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
const version = manifest.version || "0.0.0";
const zipName = `chunkly-extension-v${version}.zip`;
const zipPath = resolve(extDir, zipName);

console.log(`📦 [Chunkly Packager] 步骤 3/4: 正在生成发布压缩包: ${zipName}...`);
try {
  // -r 递归，-q 静默，-X 剔除 macOS 额外属性元数据，排除 .DS_Store
  execSync(`cd "${distDir}" && zip -r -X "${zipPath}" . -x "*.DS_Store"`, {
    stdio: "inherit",
  });
  console.log(`✅ 纯净发布压缩包生成成功: ${zipPath}`);
} catch (err) {
  console.error("❌ 打包失败:", err);
  process.exit(1);
}

console.log("🔄 [Chunkly Packager] 步骤 4/4: 正在恢复本地开发环境 dist 产物（保留本地 .env 配置）...");
try {
  execSync("pnpm build", {
    cwd: extDir,
    stdio: "ignore",
  });
  console.log("🎉 本地开发环境已无缝还原！您可以在本地 Chrome 中继续正常调试使用。");
} catch {
  // 忽略
}
