import { createClient } from "@supabase/supabase-js";

const envUrl = import.meta.env.VITE_SUPABASE_URL || "";
const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

// diag
console.log("ENV URL len =", envUrl.length, "prefix =", envUrl.slice(0, 12));
console.log("ENV KEY len =", envKey.length, "prefix =", envKey.slice(0, 12));

// consider any redacted/placeholder value invalid
const looksRedacted =
  !envKey ||
  envKey === "JWT_REDACTED" ||
  envKey.startsWith("JWT_") ||
  envKey.length < 40;

// TEMP fallback so you can sign in immediately if env is missing/redacted
const supabaseUrl = envUrl || "https://apweteosdbgsolmvcmhn.supabase.co";
const supabaseAnonKey = looksRedacted
  ? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFwd2V0ZW9zZGJnc29sbXZjbWhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY5ODc4MjksImV4cCI6MjA2MjU2MzgyOX0.tjo2en6kNIIAcpZH_hvyG_CbXB1AIfwCajR1CdTaXv4"
  : envKey;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});

export const EDGE_BASE =
  import.meta.env.VITE_SUPABASE_EDGE_URL ??
  `${String(supabaseUrl).replace(/\/$/, "")}/functions/v1`;
