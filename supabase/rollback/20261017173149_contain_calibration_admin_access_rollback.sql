-- EMERGENCY REVERSAL: restores ordinary authenticated calibration access.
begin;
grant update on public.calibration_measurements to authenticated;
alter view public.calibration_session_stats reset (security_invoker);
drop policy calibration_sessions_active_admin on public.calibration_sessions;
alter table public.calibration_sessions disable row level security;
drop policy calibration_photos_active_admin on public.calibration_photos;
alter table public.calibration_photos disable row level security;
drop policy calibration_measurements_active_admin on public.calibration_measurements;
alter table public.calibration_measurements disable row level security;
commit;
