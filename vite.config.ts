import react from "@vitejs/plugin-react-swc"
import externalGlobals from "rollup-plugin-external-globals"
import { defineConfig } from "vite"

// Orca Note mounts React and Valtio on `window`; keep them external so the
// bundle never ships its own copy (hooks would break if it did).
export default defineConfig(({ command }) => ({
  define: {
    "process.env": {
      NODE_ENV: JSON.stringify(command === "build" ? "production" : "development"),
    },
  },
  build: {
    minify: false,
    lib: {
      entry: "src/main.ts",
      fileName: "index",
      formats: ["es"],
    },
    rollupOptions: {
      external: ["react", "valtio"],
    },
  },
  plugins: [react(), externalGlobals({ react: "React", valtio: "Valtio" })],
}))
