-- EMERGENCY REVERSAL: restores ordinary authenticated match-result exposure.
-- Restores the reviewed baseline: RLS off, no policies, default definer view,
-- authenticated base SELECT/INSERT/UPDATE/DELETE and view SELECT.
BEGIN;
ALTER VIEW public.manta_match_results_view RESET (security_invoker);
DROP POLICY manta_match_results_admin_select ON public.manta_match_results;
ALTER TABLE public.manta_match_results DISABLE ROW LEVEL SECURITY;
GRANT INSERT, UPDATE, DELETE ON TABLE public.manta_match_results TO authenticated;
COMMIT;
