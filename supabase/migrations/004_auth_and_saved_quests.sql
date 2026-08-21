-- Defense in depth for verified JWT-owned user data and saved itineraries.

alter table profiles force row level security;
alter table trips force row level security;
alter table searches force row level security;
alter table ai_generations force row level security;
alter table geocode_cache force row level security;
alter table api_rate_limits force row level security;

update trips
set itinerary = '[]'::jsonb
where itinerary is null or jsonb_typeof(itinerary) <> 'array';

update trips
set status = 'saved'
where status not in ('active', 'saved', 'upcoming', 'completed');

alter table trips alter column itinerary set default '[]'::jsonb;

alter table trips drop constraint if exists trips_itinerary_array_check;
alter table trips add constraint trips_itinerary_array_check
  check (jsonb_typeof(itinerary) = 'array');

alter table trips drop constraint if exists trips_status_check;
alter table trips add constraint trips_status_check
  check (status in ('active', 'saved', 'upcoming', 'completed'));

alter table trips drop constraint if exists trips_title_length_check;
alter table trips add constraint trips_title_length_check
  check (char_length(trim(title)) between 1 and 200);

create index if not exists trips_user_status_created_idx
  on trips(user_id, status, created_at desc);

create or replace function merge_profile_preferences(p_patch jsonb)
returns setof profiles
language sql
security invoker
set search_path = public
as $$
  update profiles
  set preferences = coalesce(preferences, '{}'::jsonb) || coalesce(p_patch, '{}'::jsonb)
  where id = auth.uid()
  returning *;
$$;

revoke all on function merge_profile_preferences(jsonb) from public;
revoke all on function merge_profile_preferences(jsonb) from anon;
grant execute on function merge_profile_preferences(jsonb) to authenticated;