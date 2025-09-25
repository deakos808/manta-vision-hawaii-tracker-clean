import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 8081,
    host: "127.0.0.1",
    strictPort: true,
    hmr: { protocol: "ws", host: "localhost", clientPort: 8081 },
  },
});
