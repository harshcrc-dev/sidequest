-- Admin access, privacy-conscious traffic analytics, and editable site settings.

alter table profiles
  add column if not exists is_admin boolean not null default false;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and is_admin = true
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

create table if not exists page_views (
  id uuid primary key default gen_random_uuid(),
  path text not null,
  referrer text,
  session_id text not null,
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint page_views_path_length_check check (char_length(path) between 1 and 200),
  constraint page_views_session_length_check check (char_length(session_id) between 16 and 128)
);

create index if not exists page_views_created_at_idx on page_views(created_at desc);
create index if not exists page_views_path_created_at_idx on page_views(path, created_at desc);

alter table page_views enable row level security;
alter table page_views force row level security;

drop policy if exists "Anyone can record page views" on page_views;
create policy "Anyone can record page views"
  on page_views for insert
  to anon, authenticated
  with check (true);

drop policy if exists "Admins can view page views" on page_views;
create policy "Admins can view page views"
  on page_views for select
  to authenticated
  using (public.is_admin());

create table if not exists site_settings (
  id text primary key default 'default',
  site_name text not null default 'Sidequest',
  announcement text not null default '',
  maintenance_mode boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint site_settings_singleton_check check (id = 'default')
);

insert into site_settings (id)
values ('default')
on conflict (id) do nothing;

alter table site_settings enable row level security;
alter table site_settings force row level security;

drop policy if exists "Anyone can read site settings" on site_settings;
create policy "Anyone can read site settings"
  on site_settings for select
  to anon, authenticated
  using (true);

drop policy if exists "Admins can manage site settings" on site_settings;
create policy "Admins can manage site settings"
  on site_settings for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Admins can inspect operational/user activity from the dashboard, while
-- normal users remain restricted to their own rows by existing policies.
drop policy if exists "Admins can view profiles" on profiles;
create policy "Admins can view profiles"
  on profiles for select
  to authenticated
  using (public.is_admin());

drop policy if exists "Admins can view trips" on trips;
create policy "Admins can view trips"
  on trips for select
  to authenticated
  using (public.is_admin());

drop policy if exists "Admins can view searches" on searches;
create policy "Admins can view searches"
  on searches for select
  to authenticated
  using (public.is_admin());

drop policy if exists "Admins can view ai generations" on ai_generations;
create policy "Admins can view ai generations"
  on ai_generations for select
  to authenticated
  using (public.is_admin());

-- Keep the site settings timestamp accurate without exposing a write path to
-- non-admin users.
drop trigger if exists site_settings_set_updated_at on site_settings;
create trigger site_settings_set_updated_at
  before update on site_settings
  for each row execute function set_updated_at();
