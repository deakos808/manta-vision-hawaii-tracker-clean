import { supabase } from "@/lib/supabase";

type AuditAction = "insert" | "update" | "delete";

type AuditInput = {
  action: AuditAction;
  tableName: string;
  primaryKey: string | number;
  recordLabel?: string;
  reason: string;
  oldData?: Record<string, unknown> | null;
  newData?: Record<string, unknown> | null;
  changedFields?: string[];
  metadata?: Record<string, unknown>;
  source?: string;
  localLedgerPath?: string;
};

const AUDIT_TABLE_MISSING_MESSAGE =
  "Supabase cannot see the data_change_audit table yet, so the sighting was not changed. In the Supabase SQL Editor for this project, run supabase/migrations/20260518_204347_data_change_audit.sql, including the final NOTIFY line, then refresh this page.";

export async function logDataChange(input: AuditInput) {
  const reason = input.reason.trim();
  if (!reason) {
    throw new Error("A reason is required before changing database records.");
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  const user = userData.user;
  if (!user) {
    throw new Error("You must be signed in to change database records.");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const { error } = await supabase.from("data_change_audit").insert({
    changed_by: user.id,
    changed_by_email: user.email ?? null,
    actor_role: profile?.role ?? null,
    source: input.source ?? "admin_ui",
    action: input.action,
    table_name: input.tableName,
    primary_key: String(input.primaryKey),
    record_label: input.recordLabel ?? null,
    reason,
    old_data: input.oldData ?? {},
    new_data: input.newData ?? {},
    changed_fields: input.changedFields ?? [],
    metadata: input.metadata ?? {},
    local_ledger_path: input.localLedgerPath ?? null,
  });

  if (error) {
    const message = error.message ?? "";
    const details = error.details ?? "";
    const hint = error.hint ?? "";
    const code = error.code ?? "";
    if (
      code === "42P01" ||
      code === "PGRST205" ||
      code === "404" ||
      message.trim() === "" ||
      message.toLowerCase().includes("not found") ||
      message.includes("404") ||
      message.includes("data_change_audit") ||
      details.includes("data_change_audit") ||
      hint.includes("schema cache")
    ) {
      throw new Error(AUDIT_TABLE_MISSING_MESSAGE);
    }
    throw new Error(message || details || "Could not write data change audit row.");
  }
}
