create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function private.admin_list_auth_users()
returns table (
  id uuid,
  email text,
  name text,
  avatar text,
  provider text,
  created_at timestamptz,
  last_sign_in_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, auth, public, private
as $$
declare
  caller_id uuid := auth.uid();
  caller_email text := '';
begin
  if caller_id is null then
    raise exception 'admin_forbidden' using errcode = '42501';
  end if;

  select lower(coalesce(u.email, ''))
    into caller_email
  from auth.users u
  where u.id = caller_id;

  if caller_email <> 'luyudong1136@gmail.com' then
    raise exception 'admin_forbidden' using errcode = '42501';
  end if;

  return query
  select
    u.id,
    lower(coalesce(u.email, ''))::text as email,
    coalesce(
      u.raw_user_meta_data ->> 'full_name',
      u.raw_user_meta_data ->> 'name',
      u.raw_user_meta_data ->> 'user_name',
      ''
    )::text as name,
    coalesce(
      u.raw_user_meta_data ->> 'avatar_url',
      u.raw_user_meta_data ->> 'picture',
      ''
    )::text as avatar,
    coalesce(
      u.raw_app_meta_data ->> 'provider',
      case
        when jsonb_typeof(u.raw_app_meta_data -> 'providers') = 'array'
          then u.raw_app_meta_data -> 'providers' ->> 0
        else ''
      end,
      ''
    )::text as provider,
    u.created_at,
    u.last_sign_in_at
  from auth.users u
  order by u.created_at desc;
end;
$$;

revoke all on function private.admin_list_auth_users() from public;
revoke all on function private.admin_list_auth_users() from anon;
grant execute on function private.admin_list_auth_users() to authenticated;

drop function if exists public.admin_list_auth_users();

create function public.admin_list_auth_users()
returns table (
  id uuid,
  email text,
  name text,
  avatar text,
  provider text,
  created_at timestamptz,
  last_sign_in_at timestamptz
)
language sql
security invoker
set search_path = pg_catalog, public, private
as $$
  select * from private.admin_list_auth_users();
$$;

revoke all on function public.admin_list_auth_users() from public;
revoke all on function public.admin_list_auth_users() from anon;
grant execute on function public.admin_list_auth_users() to authenticated;
