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
  server: {
    port: 8080,
  },
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://apweteosdbgsolmvcmhn.supabase.co'),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFwd2V0ZW9zZGJnc29sbXZjbWhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY5ODc4MjksImV4cCI6MjA2MjU2MzgyOX0.tjo2en6kNIIAcpZH_hvyG_CbXB1AIfwCajR1CdTaXv4'),
    'import.meta.env.VITE_SUPABASE_EDGE_URL': JSON.stringify('https://apweteosdbgsolmvcmhn.supabase.co/functions/v1'),
  },
});
