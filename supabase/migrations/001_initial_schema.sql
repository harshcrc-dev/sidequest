-- ===========================================================================
-- Sidequest initial schema
-- Tables: profiles, trips, searches, ai_generations
-- Security: Row Level Security enabled on every user-owned table.
-- ===========================================================================

-- --- profiles --------------------------------------------------------------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  home_city text,
  home_country text,
  home_lat double precision,
  home_lng double precision,
  onboarding_completed boolean default false,
  preferences jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- --- trips -----------------------------------------------------------------
create table if not exists trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  city text,
  country text,
  latitude double precision,
  longitude double precision,
  start_date date,
  end_date date,
  duration_days integer,
  budget text,
  travel_style text,
  preferences jsonb default '{}'::jsonb,
  itinerary jsonb not null default '{}'::jsonb,
  ai_model text,
  status text default 'active',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- --- searches --------------------------------------------------------------
create table if not exists searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  query text,
  city text,
  country text,
  latitude double precision,
  longitude double precision,
  filters jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- --- ai_generations --------------------------------------------------------
create table if not exists ai_generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  trip_id uuid references trips(id) on delete set null,
  provider text,
  model text,
  request_type text,
  input jsonb default '{}'::jsonb,
  output jsonb default '{}'::jsonb,
  status text default 'completed',
  error_message text,
  latency_ms integer,
  created_at timestamptz default now()
);

-- ===========================================================================
-- Indexes
-- ===========================================================================
create index if not exists trips_user_id_idx on trips(user_id);
create index if not exists trips_created_at_idx on trips(created_at desc);
create index if not exists searches_user_id_idx on searches(user_id);
create index if not exists searches_created_at_idx on searches(created_at desc);
create index if not exists ai_generations_user_id_idx on ai_generations(user_id);

-- ===========================================================================
-- updated_at maintenance
-- ===========================================================================
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on profiles;
create trigger profiles_set_updated_at
  before update on profiles
  for each row execute function set_updated_at();

drop trigger if exists trips_set_updated_at on trips;
create trigger trips_set_updated_at
  before update on trips
  for each row execute function set_updated_at();

-- ===========================================================================
-- Auto-create a profile row when a new auth user signs up.
-- Pulls full_name from the signup metadata when present.
-- ===========================================================================
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ===========================================================================
-- Row Level Security
-- ===========================================================================
alter table profiles enable row level security;
alter table trips enable row level security;
alter table searches enable row level security;
alter table ai_generations enable row level security;

-- --- profiles policies -----------------------------------------------------
drop policy if exists "Users can view own profile" on profiles;
create policy "Users can view own profile"
  on profiles for select
  using (auth.uid() = id);

drop policy if exists "Users can insert own profile" on profiles;
create policy "Users can insert own profile"
  on profiles for insert
  with check (auth.uid() = id);

drop policy if exists "Users can update own profile" on profiles;
create policy "Users can update own profile"
  on profiles for update
  using (auth.uid() = id);

-- --- trips policies --------------------------------------------------------
drop policy if exists "Users can view own trips" on trips;
create policy "Users can view own trips"
  on trips for select
  using (auth.uid() = user_id);

drop policy if exists "Users can create own trips" on trips;
create policy "Users can create own trips"
  on trips for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own trips" on trips;
create policy "Users can update own trips"
  on trips for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete own trips" on trips;
create policy "Users can delete own trips"
  on trips for delete
  using (auth.uid() = user_id);

-- --- searches policies -----------------------------------------------------
drop policy if exists "Users can view own searches" on searches;
create policy "Users can view own searches"
  on searches for select
  using (auth.uid() = user_id);

drop policy if exists "Users can create own searches" on searches;
create policy "Users can create own searches"
  on searches for insert
  with check (auth.uid() = user_id or user_id is null);

-- --- ai_generations policies -----------------------------------------------
-- Rows are written by the server (service role, which bypasses RLS). Users may
-- read their own generation history.
drop policy if exists "Users can view own ai generations" on ai_generations;
create policy "Users can view own ai generations"
  on ai_generations for select
  using (auth.uid() = user_id);
