-- Synthetic local fixture, mirrored from live column/FK/view definitions.
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth;
create table auth.users(id uuid primary key); create table public.profiles(id uuid primary key,role text,is_active boolean);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
CREATE OR REPLACE FUNCTION public.is_admin_user()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$;
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin' and is_active is true
  );
$function$;

revoke all on function public.is_admin_user() from public; grant execute on function public.is_admin_user() to authenticated,service_role; grant usage on schema public,auth to anon,authenticated,service_role;
create table public.calibration_sessions (id uuid default gen_random_uuid() not null, created_by uuid, photographer_name text, camera_model text, lens_type text, laser_setup text, default_scale_m numeric(6,3) default 0.60 not null, notes text, created_at timestamp with time zone default now() not null, measurement_date date);
create table public.calibration_photos (id uuid default gen_random_uuid() not null, session_id uuid not null, storage_path text not null, width_px integer, height_px integer, scale_m_override numeric(6,3), actual_length_m numeric(8,3), created_at timestamp with time zone default now() not null);
create table public.calibration_measurements (id uuid default gen_random_uuid() not null, photo_id uuid not null, scale_px numeric(10,3) not null, object_px numeric(10,3) not null, scale_p0 jsonb not null, scale_p1 jsonb not null, object_p0 jsonb not null, object_p1 jsonb not null, scale_m numeric(6,3) not null, est_length_m numeric(8,3) not null, error_pct numeric(6,3) not null, created_at timestamp with time zone default now() not null);
alter table public.calibration_sessions add constraint calibration_sessions_pkey PRIMARY KEY (id);
alter table public.calibration_sessions add constraint calibration_sessions_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.calibration_photos add constraint calibration_photos_pkey PRIMARY KEY (id);
alter table public.calibration_photos add constraint calibration_photos_session_id_fkey FOREIGN KEY (session_id) REFERENCES calibration_sessions(id) ON DELETE CASCADE;
alter table public.calibration_measurements add constraint calibration_measurements_pkey PRIMARY KEY (id);
alter table public.calibration_measurements add constraint calibration_measurements_photo_id_fkey FOREIGN KEY (photo_id) REFERENCES calibration_photos(id) ON DELETE CASCADE;
grant select,insert,update,delete on public.calibration_sessions,public.calibration_photos,public.calibration_measurements to authenticated;
grant all on public.calibration_sessions,public.calibration_photos,public.calibration_measurements to service_role;
create view public.calibration_session_stats as  SELECT s.id AS session_id,
    count(m.id) AS n_measurements,
    round(avg(m.error_pct), 3) AS mean_error_pct,
    s.created_at,
    s.measurement_date,
    s.photographer_name,
    s.camera_model,
    s.lens_type,
    s.laser_setup,
    count(p.id) AS photos
   FROM calibration_sessions s
     LEFT JOIN calibration_photos p ON p.session_id = s.id
     LEFT JOIN calibration_measurements m ON m.photo_id = p.id
  GROUP BY s.id, s.created_at, s.measurement_date, s.photographer_name, s.camera_model, s.lens_type, s.laser_setup;
grant all on public.calibration_session_stats to authenticated,service_role;
insert into auth.users values ('00000001-0000-4000-8000-000000000000'); insert into profiles values ('00000001-0000-4000-8000-000000000000','admin',true);
insert into auth.users values ('00000002-0000-4000-8000-000000000000'); insert into profiles values ('00000002-0000-4000-8000-000000000000','user',true);
insert into auth.users values ('00000003-0000-4000-8000-000000000000'); insert into profiles values ('00000003-0000-4000-8000-000000000000','admin',false);

CREATE INDEX idx_calib_measure_photo ON public.calibration_measurements USING btree (photo_id);

CREATE INDEX idx_calib_photos_session ON public.calibration_photos USING btree (session_id);
