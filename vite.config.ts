import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

const developmentPort = Number(process.env.MANTA_DEV_PORT || 8080);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: developmentPort,
    host: "127.0.0.1",
    strictPort: true,
    hmr: { protocol: "ws", host: "localhost", clientPort: developmentPort },
  },
});
