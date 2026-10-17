-- Roll back the frontend before removing its RPCs. Reverse 3E-B first if applied.
-- Does not modify table/view access, RLS, or data.
begin;
drop function public.admin_biopsy_browse();
drop function private.admin_biopsy_browse();
drop function public.admin_biopsy_age_ranking();
drop function private.admin_biopsy_age_ranking();
commit;
