import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  root: "initiative",
  base: "/Effect-Tracker/initiative/",
  publicDir: "public",
  plugins: [react()],
  build: { outDir: "../dist/initiative", emptyOutDir: false }
});
