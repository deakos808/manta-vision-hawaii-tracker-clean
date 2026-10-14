import { supabase } from "@/lib/supabase";
import { savePendingSubmission, saveLegacyReview, STALE_SUBMISSION_MESSAGE, ADMIN_STALE_SUBMISSION_MESSAGE, type EditProtocol, type PendingAction } from "@/features/sightings/pendingSubmission";

/** Protocol and revision are captured when review opens, never refreshed at save. */
export async function saveReviewServer(reviewId: string, overrides?: unknown, revision: number | null = null, action: PendingAction = "save", protocol: EditProtocol = 1) {
  if (protocol === 0) return saveLegacyReview(supabase, reviewId, overrides ?? {}, action);
  try {
    return await savePendingSubmission(supabase, reviewId, revision, overrides ?? {}, action);
  } catch (error) {
    if (error instanceof Error && error.message === STALE_SUBMISSION_MESSAGE) throw new Error(ADMIN_STALE_SUBMISSION_MESSAGE);
    throw error;
  }
}
export default saveReviewServer;
