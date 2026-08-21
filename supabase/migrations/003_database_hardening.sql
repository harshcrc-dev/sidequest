-- Final constraints and maintenance for production operation.

update profiles set
  onboarding_completed = coalesce(onboarding_completed, false),
  preferences = coalesce(preferences, '{}'::jsonb),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now())
where onboarding_completed is null or preferences is null or created_at is null or updated_at is null;

update trips set
  preferences = coalesce(preferences, '{}'::jsonb),
  itinerary = coalesce(itinerary, '{}'::jsonb),
  status = coalesce(status, 'active'),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now())
where preferences is null or itinerary is null or status is null or created_at is null or updated_at is null;

update searches set
  filters = coalesce(filters, '{}'::jsonb),
  created_at = coalesce(created_at, now())
where filters is null or created_at is null;

update ai_generations set
  input = coalesce(input, '{}'::jsonb),
  output = coalesce(output, '{}'::jsonb),
  status = coalesce(status, 'completed'),
  created_at = coalesce(created_at, now())
where input is null or output is null or status is null or created_at is null;

alter table profiles
  alter column onboarding_completed set not null,
  alter column preferences set not null,
  alter column created_at set not null,
  alter column updated_at set not null;

alter table trips
  alter column preferences set not null,
  alter column itinerary set not null,
  alter column status set not null,
  alter column created_at set not null,
  alter column updated_at set not null;

alter table searches
  alter column filters set not null,
  alter column created_at set not null;

alter table ai_generations
  alter column input set not null,
  alter column output set not null,
  alter column status set not null,
  alter column created_at set not null;

create index if not exists geocode_cache_updated_at_idx on geocode_cache(updated_at);
create index if not exists api_rate_limits_window_started_at_idx on api_rate_limits(window_started_at);

revoke all on function set_updated_at() from public;
revoke all on function set_updated_at() from anon;
revoke all on function set_updated_at() from authenticated;
revoke all on function handle_new_user() from public;
revoke all on function handle_new_user() from anon;
revoke all on function handle_new_user() from authenticated;

create or replace function purge_sidequest_operational_data()
returns void
language sql
security definer
set search_path = public
as $$
  delete from api_rate_limits
  where window_started_at < now() - interval '1 day';

  delete from geocode_cache
  where updated_at < now() - interval '180 days';
$$;

revoke all on function purge_sidequest_operational_data() from public;
revoke all on function purge_sidequest_operational_data() from anon;
revoke all on function purge_sidequest_operational_data() from authenticated;
grant execute on function purge_sidequest_operational_data() to service_role;

-- Make update ownership checks explicit even if PostgreSQL would reuse USING.
drop policy if exists "Users can update own profile" on profiles;
create policy "Users can update own profile"
  on profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "Users can update own trips" on trips;
create policy "Users can update own trips"
  on trips for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);