console.log(~NV URL[0..11]=', (import.meta.env?.VITE_SUPABASE_URL||"").slice(0,12));
console.log(~NV KEY[0..11]=', (import.meta.env?.VITE_SUPABASE_ANON_KEY||"").slice(0,12));
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Fail fast in dev if envs are missing
if (!supabaseUrl) console.error("VITE_SUPABASE_URL is missing");
if (!supabaseAnonKey) console.error("VITE_SUPABASE_ANON_KEY is missing");

export const supabase = createClient(supabaseUrl!, supabaseAnonKey!, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});

export const EDGE_BASE =
  import.meta.env.VITE_SUPABASE_EDGE_URL ?? `${supabaseUrl?.replace(/\/$/, "")}/functions/v1`;
