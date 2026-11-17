-- See a Send a — the black box
-- Anonymous notes, read out at chapter. Notes are stored with NO author and NO timestamp
-- (only the date), so nobody, admins and the database owner included, can tell who wrote one.
-- Members can drop notes and see how many are waiting; only admins can read them.
-- Safe to re-run.

create table if not exists public.black_box (
  id         uuid primary key default gen_random_uuid(),  -- random, so ids don't reveal order
  body       text not null check (char_length(body) between 1 and 1000),
  dropped_on date not null default (now() at time zone 'America/Los_Angeles')::date,
  read_at    timestamptz
);
alter table public.black_box enable row level security;
revoke all on public.black_box from anon, authenticated;   -- everything goes through the functions below

create or replace function public.black_box_drop(p_body text) returns void
language plpgsql security definer set search_path = public as $$
declare b text := btrim(p_body);
begin
  if not is_member() then raise exception 'not_member'; end if;
  if b is null or char_length(b) = 0 then raise exception 'empty'; end if;
  if char_length(b) > 1000 then raise exception 'too_long'; end if;
  insert into black_box (body) values (b);
end;
$$;

-- How many notes are waiting (no content). Any member.
create or replace function public.black_box_waiting() returns int
language sql stable security definer set search_path = public as $$
  select case when is_member() then (select count(*)::int from black_box where read_at is null) else 0 end;
$$;

-- Admins only from here down.
create or replace function public.black_box_list(p_include_read boolean default false)
returns table (id uuid, body text, dropped_on date, read_at timestamptz)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not is_admin() then raise exception 'admins_only'; end if;
  return query
    select b.id, b.body, b.dropped_on, b.read_at from black_box b
    where p_include_read or b.read_at is null
    order by (b.read_at is not null), b.dropped_on, b.id;
end;
$$;

create or replace function public.black_box_mark(p_id uuid, p_read boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admins_only'; end if;
  update black_box set read_at = case when p_read then now() end where id = p_id;
end;
$$;

create or replace function public.black_box_delete(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admins_only'; end if;
  delete from black_box where id = p_id;
end;
$$;

revoke all on function public.black_box_drop(text), public.black_box_waiting(), public.black_box_list(boolean),
  public.black_box_mark(uuid, boolean), public.black_box_delete(uuid) from public, anon;
grant execute on function public.black_box_drop(text), public.black_box_waiting(), public.black_box_list(boolean),
  public.black_box_mark(uuid, boolean), public.black_box_delete(uuid) to authenticated;
