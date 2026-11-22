import { defineConfig } from "vite";

export default defineConfig({
  // Relative asset paths make the build work from the GitHub Pages project URL.
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true
  }
});
