-- Batch 2B: contain legacy operational tables AND owner-security summary views.
-- Preserve service_role, contents, definitions, ownership and RLS. Storage is separate.
REVOKE ALL PRIVILEGES ON TABLE public.contractors_divers FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.contractors_vessels FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.contractor_work_logs FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.contractor_work_log_divers FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.project_task_codes FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.contractor_vessel_documents FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.v_contractor_diver_clearance_status FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.v_contractor_diver_monthly_summary FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.v_contractor_vessel_monthly_summary FROM anon, authenticated;
