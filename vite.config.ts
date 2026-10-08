import { defineConfig, loadEnv } from "vite";
import { execFileSync } from "node:child_process";
import react from "@vitejs/plugin-react";
import path from "path";

const developmentPort = Number(process.env.MANTA_DEV_PORT || 8080);

export default defineConfig(({ command, mode }) => {
  const development = command === "serve";
  if (development && process.env.MANTA_DEV_PORT === "8081") {
    const env = { ...loadEnv(mode, __dirname, ""), ...process.env };
    const forbidden = [
      "VITE_SUPABASE_SERVICE_ROLE_KEY", "VITE_SUPABASE_SECRET_KEY",
      "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY", "SUPABASE_SECRET_KEYS",
    ];
    const privilegedBrowserValue = Object.entries(env).some(([name, value]) => {
      if (!name.startsWith("VITE_") || !value) return false;
      if (value.includes("sb_secret_")) return true;
      try {
        return JSON.parse(Buffer.from(value.split(".")[1], "base64url").toString()).role === "service_role";
      } catch { return false; }
    });
    if (forbidden.some(name => Boolean(env[name])) || privilegedBrowserValue) {
      throw new Error("Development startup refused: privileged credentials are present.");
    }
    if (env.VITE_SUPABASE_URL !== "https://apweteosdbgsolmvcmhn.supabase.co") {
      throw new Error("Development startup requires the exact canonical Supabase URL.");
    }
    if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(env.VITE_SUPABASE_PUBLISHABLE_KEY || "")) {
      throw new Error("Development startup requires a normal publishable key.");
    }
  }
  const git = (...args: string[]) => execFileSync("git", args, { cwd: __dirname, encoding: "utf8" }).trim();
  return {
    define: development ? {
      "import.meta.env.VITE_DEV_BRANCH": JSON.stringify(git("branch", "--show-current")),
      "import.meta.env.VITE_DEV_SHA": JSON.stringify(git("rev-parse", "--short=7", "HEAD")),
    } : {},
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
  };
});
