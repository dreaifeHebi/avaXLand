import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const target = env.VITE_DEV_API_TARGET || "http://localhost:8787";
  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        "/api": { target, changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, "") },
        "/ws": { target: target.replace(/^http/, "ws"), ws: true },
      },
    },
  };
});
