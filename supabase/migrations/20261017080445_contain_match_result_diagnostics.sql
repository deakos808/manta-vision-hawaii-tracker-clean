-- Admin-only diagnostic reads; server/owner privileges and data are unchanged.
BEGIN;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.manta_match_results FROM authenticated;
ALTER TABLE public.manta_match_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY manta_match_results_admin_select
  ON public.manta_match_results FOR SELECT TO authenticated
  USING ((SELECT public.is_admin_user()));
ALTER VIEW public.manta_match_results_view SET (security_invoker = true);
COMMIT;
