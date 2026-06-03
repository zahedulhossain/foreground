import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Relative base so the built index.html works when loaded via file:// in Electron.
  base: "./",
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  build: { outDir: "dist", emptyOutDir: true },
});
