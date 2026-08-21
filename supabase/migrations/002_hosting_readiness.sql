-- Hosting support tables are server-only. The service role bypasses RLS;
-- browser clients receive no policies and therefore no access.

create table if not exists geocode_cache (
  cache_key text primary key,
  place_name text not null,
  city text not null,
  country text,
  latitude double precision not null,
  longitude double precision not null,
  updated_at timestamptz not null default now()
);

alter table geocode_cache enable row level security;

drop policy if exists "Users can create own searches" on searches;
create policy "Users can create own searches"
  on searches for insert
  with check (auth.uid() = user_id);

create table if not exists api_rate_limits (
  key_hash text primary key,
  request_count integer not null default 0,
  window_started_at timestamptz not null default now()
);

alter table api_rate_limits enable row level security;

create or replace function consume_api_quota(
  p_key_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  next_count integer;
begin
  -- Serialize requests for one hashed client key across all serverless instances.
  perform pg_advisory_xact_lock(hashtextextended(p_key_hash, 0));

  insert into api_rate_limits (key_hash, request_count, window_started_at)
  values (p_key_hash, 1, now())
  on conflict (key_hash) do update
  set
    request_count = case
      when api_rate_limits.window_started_at <= now() - make_interval(secs => p_window_seconds)
        then 1
      else api_rate_limits.request_count + 1
    end,
    window_started_at = case
      when api_rate_limits.window_started_at <= now() - make_interval(secs => p_window_seconds)
        then now()
      else api_rate_limits.window_started_at
    end
  returning request_count into next_count;

  return next_count <= p_limit;
end;
$$;

revoke all on function consume_api_quota(text, integer, integer) from public;
revoke all on function consume_api_quota(text, integer, integer) from anon;
revoke all on function consume_api_quota(text, integer, integer) from authenticated;
grant execute on function consume_api_quota(text, integer, integer) to service_role;