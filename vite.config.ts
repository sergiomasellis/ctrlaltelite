import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const host = process.env.TAURI_DEV_HOST || "localhost"
const port = process.env.TAURI_DEV_PORT ? parseInt(process.env.TAURI_DEV_PORT) : 1420

export default defineConfig({
  clearScreen: false,
  server: {
    port,
    strictPort: true,
    host: host || false,
    hmr: process.env.TAURI_DEV
      ? {
          protocol: "ws",
          host,
          port,
        }
      : undefined,
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: process.env.TAURI_PLATFORM == "windows" ? "chrome105" : "safari13",
    minify: !process.env.TAURI_DEV ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_DEV,
  },
  optimizeDeps: {
    force: true,
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
