-- Run after all migrations. A successful run returns one row with ready=true.
-- Any missing table, RLS setting, policy, trigger or function raises an error.

do $$
declare
  missing text;
begin
  select string_agg(expected.name, ', ')
  into missing
  from (
    values
      ('profiles'), ('trips'), ('searches'),
      ('ai_generations'), ('geocode_cache'), ('api_rate_limits')
  ) as expected(name)
  where to_regclass('public.' || expected.name) is null;

  if missing is not null then
    raise exception 'Missing tables: %', missing;
  end if;

  select string_agg(c.relname, ', ')
  into missing
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in (
      'profiles', 'trips', 'searches',
      'ai_generations', 'geocode_cache', 'api_rate_limits'
    )
    and not c.relrowsecurity;

  if missing is not null then
    raise exception 'RLS is disabled on: %', missing;
  end if;

  select string_agg(c.relname, ', ')
  into missing
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in (
      'profiles', 'trips', 'searches', 'ai_generations',
      'geocode_cache', 'api_rate_limits'
    )
    and not c.relforcerowsecurity;

  if missing is not null then
    raise exception 'Forced RLS is disabled on: %', missing;
  end if;

  if to_regprocedure('public.consume_api_quota(text,integer,integer)') is null then
    raise exception 'consume_api_quota function is missing';
  end if;

  if to_regprocedure('public.purge_sidequest_operational_data()') is null then
    raise exception 'purge_sidequest_operational_data function is missing';
  end if;

  if to_regprocedure('public.merge_profile_preferences(jsonb)') is null then
    raise exception 'merge_profile_preferences function is missing';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'on_auth_user_created' and not tgisinternal
  ) then
    raise exception 'Profile creation trigger is missing';
  end if;

  select string_agg(expected.policy_name, ', ')
  into missing
  from (
    values
      ('profiles', 'Users can view own profile'),
      ('profiles', 'Users can insert own profile'),
      ('profiles', 'Users can update own profile'),
      ('trips', 'Users can view own trips'),
      ('trips', 'Users can create own trips'),
      ('trips', 'Users can update own trips'),
      ('trips', 'Users can delete own trips'),
      ('searches', 'Users can view own searches'),
      ('searches', 'Users can create own searches'),
      ('ai_generations', 'Users can view own ai generations')
  ) as expected(table_name, policy_name)
  where not exists (
    select 1
    from pg_policies p
    where p.schemaname = 'public'
      and p.tablename = expected.table_name
      and p.policyname = expected.policy_name
  );

  if missing is not null then
    raise exception 'Missing RLS policies: %', missing;
  end if;
end;
$$;

select
  true as ready,
  current_database() as database_name,
  count(*) filter (where relrowsecurity) as rls_table_count
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'profiles', 'trips', 'searches',
    'ai_generations', 'geocode_cache', 'api_rate_limits'
  );