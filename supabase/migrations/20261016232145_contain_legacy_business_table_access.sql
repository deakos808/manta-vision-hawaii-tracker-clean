-- Batch 2A: MantaTracker-only legacy financial/credential table containment.
-- Preserve contents, definitions, ownership, RLS state and service_role grants.
-- Contractor views and contractor-docs Storage are separate batches.
REVOKE ALL PRIVILEGES ON TABLE public.clients FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.client_contracts FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.client_invoices FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.client_invoice_items FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.client_invoice_item_dates FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.client_invoice_documents FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.contractor_credentials FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.contractor_diver_invoices FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.contractor_diver_invoice_items FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.contractor_diver_invoice_documents FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.contractor_vessel_invoices FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.contractor_vessel_invoice_items FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.contractor_vessel_invoice_documents FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.project_task_code_rates FROM anon, authenticated;
