export const STALE_SUBMISSION_MESSAGE = "This submission changed while you were editing it. Your changes were not saved. Return to My Contributions and reopen the latest version before trying again. Copy any unsaved notes before leaving this page.";

export type PendingAction = "save" | "commit" | "reject";
export function pendingEditAvailable(row: { source: string; status: string; submissionId?: string; sightingId?: number | null }) {
  return row.source === "submission" && row.status === "Pending" && !!row.submissionId && row.sightingId == null;
}

export async function savePendingSubmission(client: { rpc: Function }, id: string, revision: number | null,
  changes: unknown, action: PendingAction = "save"): Promise<{ revision: number; status: string }> {
  if (!Number.isInteger(revision) || revision! < 0) throw new Error("Reopen this submission before saving.");
  const { data, error } = await client.rpc("save_pending_sighting_submission", {
    sub_id: id, expected_revision: revision, changes, action,
  });
  if (error) {
    if (error.code === "PT409" || error.code === "40001") throw new Error(STALE_SUBMISSION_MESSAGE);
    throw error;
  }
  if (!data || !Number.isInteger(data.revision)) throw new Error("Save was not confirmed. Reopen the submission before retrying.");
  return data;
}


export const ADMIN_STALE_SUBMISSION_MESSAGE = "This submission changed after you opened it. Your changes were not saved. Reload the latest submission before continuing.";
export const RELOAD_SUBMISSION_MESSAGE = "Submission editing has changed. Your changes were not saved. Reload the latest submission before continuing.";
export type EditProtocol = 0 | 1;

/** Only a missing discovery function means pre-cutover. Network/ACL errors fail closed. */
export async function pendingEditProtocol(client: { rpc: Function }): Promise<EditProtocol> {
  const { data, error } = await client.rpc("pending_submission_edit_protocol");
  if (error?.code === "PGRST202") return 0;
  if (error) throw new Error("Unable to check submission editing availability. Reload before continuing.");
  if (data !== 1) throw new Error("Unsupported submission editing version. Reload before continuing.");
  return 1;
}

const isObject = (v: any) => v && typeof v === "object" && !Array.isArray(v);
function mergeReview(target: any, source: any): any {
  const result = { ...target };
  for (const [key, value] of Object.entries(source ?? {})) {
    if (Array.isArray(value)) result[key] = value.slice();
    else if (isObject(value)) result[key] = mergeReview(isObject(result[key]) ? result[key] : {}, value);
    else if (value !== undefined) result[key] = value;
  }
  return result;
}

/** Pre-cutover Admin compatibility only. Never used as a retry after a V1 failure.
 * If cutover occurs during these requests, the database rejects the legacy write.
 * Pre-cutover approval retains the existing save-then-commit behavior.
 */
export async function saveLegacyReview(client: { from: Function; rpc: Function }, id: string, changes: any, action: PendingAction) {
  if (action === "reject") {
    const { data, error } = await client.from("sighting_submissions")
      .update({ status: "rejected", rejected_at: new Date().toISOString() })
      .eq("id", id).eq("status", "pending").select("id").single();
    if (error || !data) throw new Error(RELOAD_SUBMISSION_MESSAGE);
    return { revision: null, status: "rejected" };
  }
  const { data, error } = await client.from("sighting_submissions").select("payload,sighting_date").eq("id", id).single();
  if (error || !data) throw new Error(RELOAD_SUBMISSION_MESSAGE);
  const merged = mergeReview(data.payload ?? {}, changes);
  const saved = await client.from("sighting_submissions")
    .update({ payload: merged, sighting_date: merged.date === undefined ? data.sighting_date : merged.date || null })
    .eq("id", id).eq("status", "pending").select("id").single();
  if (saved.error || !saved.data) throw new Error(RELOAD_SUBMISSION_MESSAGE);
  if (action === "commit") {
    const withBiopsies = merged.mantas?.some((m: any) => m.biopsy?.collected === true);
    const result = await client.rpc(withBiopsies ? "commit_sighting_submission_with_biopsies" : "commit_sighting_submission", { sub_id: id });
    if (result.error) {
      if (result.error.code === "42501") throw new Error(RELOAD_SUBMISSION_MESSAGE);
      throw result.error;
    }
  }
  return { revision: null, status: action === "commit" ? "committed" : "pending" };
}
