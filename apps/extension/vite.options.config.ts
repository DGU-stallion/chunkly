import { defineConfig } from "vite";

/** options.html 是普通页面，可以用标准 ES module 脚本，走 Vite 常规多页构建。 */
export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: false,
    rollupOptions: {
      input: {
        options: "options.html",
        popup: "popup.html",
      },
    },
  },
});
