import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from 'path'
import { copyFileSync } from 'fs'

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'copy-fps-html',
      closeBundle() {
        try {
          copyFileSync(
            resolve(__dirname, 'src/fps.html'),
            resolve(__dirname, 'dist/fps.html')
          )
        } catch(e) {
          console.warn('Could not copy fps.html:', e.message)
        }
      }
    }
  ],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: ["es2021", "chrome100", "safari13"],
    minify: !process.env.TAURI_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_DEBUG,
  },
});