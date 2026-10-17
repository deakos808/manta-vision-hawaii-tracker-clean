-- Batch 3D: active-Admin calibration access; no scientific content changes.
begin;
alter table public.calibration_sessions enable row level security;
create policy calibration_sessions_active_admin on public.calibration_sessions for all to authenticated using ((select public.is_admin_user())) with check ((select public.is_admin_user()));
alter table public.calibration_photos enable row level security;
create policy calibration_photos_active_admin on public.calibration_photos for all to authenticated using ((select public.is_admin_user())) with check ((select public.is_admin_user()));
alter table public.calibration_measurements enable row level security;
create policy calibration_measurements_active_admin on public.calibration_measurements for all to authenticated using ((select public.is_admin_user())) with check ((select public.is_admin_user()));
-- The landing-page aggregate must use the caller's table permissions/RLS.
alter view public.calibration_session_stats set (security_invoker = true);
-- Measurement edits use DELETE + INSERT; no browser UPDATE dependency exists.
revoke update on public.calibration_measurements from authenticated;
commit;
