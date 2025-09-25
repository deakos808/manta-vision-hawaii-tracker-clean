// vite.config.ts

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: { port: 8081, host: "127.0.0.1", strictPort: true, hmr: { protocol: "ws", host: "localhost", clientPort: 8081 } } },
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://apweteosdbgsolmvcmhn.supabase.co'),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('JWT_REDACTED'),
    'import.meta.env.VITE_SUPABASE_EDGE_URL': JSON.stringify('https://apweteosdbgsolmvcmhn.supabase.co/functions/v1'),
  },
});
