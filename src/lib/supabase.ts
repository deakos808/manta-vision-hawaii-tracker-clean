import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// diag: confirm envs are baked into the bundle
console.log('ENV URL[0..11]=', String(supabaseUrl || '').slice(0,12));
console.log('ENV KEY[0..11]=', String(supabaseAnonKey || '').slice(0,12));

export const supabase = createClient(supabaseUrl!, supabaseAnonKey!, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});

export const EDGE_BASE =
  import.meta.env.VITE_SUPABASE_EDGE_URL ??
  `${String(supabaseUrl || '').replace(/\/$/, '')}/functions/v1`;
