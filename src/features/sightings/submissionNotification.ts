import { supabase } from "@/lib/supabase";

export async function notifySubmission(submissionId: string): Promise<boolean> {
  try {
    const { error } = await supabase.functions.invoke("notify-admin", {
      body: { submissionId },
      signal: AbortSignal.timeout(15000),
    });
    if (error) { console.warn("Admin notification failed; submission remains saved."); return false; }
    return true;
  } catch {
    console.warn("Admin notification unavailable; submission remains saved.");
    return false;
  }
}
