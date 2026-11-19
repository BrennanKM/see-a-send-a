-- See a Send a — senior messages in the ticker
-- Seniors post one short anonymous message that scrolls in the feed's ticker for 24 hours.
-- Members never see who wrote a message, or even who the seniors are (so a lone senior
-- can't be singled out). Admins can see authors and take any message down.
-- Everything goes through the functions below; the tables are closed to clients. Safe to re-run.

create table if not exists public.seniors (
  user_id    uuid primary key references public.profiles on delete cascade,
  added_at   timestamptz not null default now()
);

create table if not exists public.senior_posts (
  id          uuid primary key default gen_random_uuid(),
  author_id   uuid not null references public.profiles on delete cascade,
  body        text not null check (char_length(body) between 1 and 140),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '24 hours',
  removed_at  timestamptz,
  removed_by  uuid references public.profiles on delete set null
);
create index if not exists senior_posts_live_idx on public.senior_posts (expires_at) where removed_at is null;

alter table public.seniors enable row level security;
alter table public.senior_posts enable row level security;
revoke all on public.seniors, public.senior_posts from anon, authenticated;

create or replace function public.is_senior() returns boolean
language sql stable security definer set search_path = public as $$
  select is_member() and exists (select 1 from seniors where user_id = auth.uid());
$$;

-- What the profile box needs: am I a senior, and what's my live message (if any)?
create or replace function public.senior_status() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when not is_senior() then jsonb_build_object('is_senior', false)
  else jsonb_build_object('is_senior', true, 'post',
    (select jsonb_build_object('id', id, 'body', body, 'expires_at', expires_at)
       from senior_posts
      where author_id = auth.uid() and removed_at is null and expires_at > now()
      order by created_at desc limit 1))
  end;
$$;

-- Post a message. Each senior has at most one live message; a new one replaces it.
create or replace function public.senior_post(p_body text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare b text := btrim(regexp_replace(coalesce(p_body, ''), '\s+', ' ', 'g'));
        r senior_posts;
begin
  if not is_senior() then raise exception 'seniors_only'; end if;
  if char_length(b) = 0 then raise exception 'empty'; end if;
  if char_length(b) > 140 then raise exception 'too_long'; end if;
  update senior_posts set removed_at = now(), removed_by = auth.uid()
   where author_id = auth.uid() and removed_at is null and expires_at > now();
  insert into senior_posts (author_id, body) values (auth.uid(), b) returning * into r;
  return jsonb_build_object('id', r.id, 'body', r.body, 'expires_at', r.expires_at);
end;
$$;

-- Take down my own live message early.
create or replace function public.senior_withdraw() returns void
language sql security definer set search_path = public as $$
  update senior_posts set removed_at = now(), removed_by = auth.uid()
   where author_id = auth.uid() and removed_at is null and expires_at > now() and is_senior();
$$;

-- Live messages for the ticker: text only, never the author. Any member.
create or replace function public.senior_live() returns table (id uuid, body text)
language sql stable security definer set search_path = public as $$
  select id, body from senior_posts
   where is_member() and removed_at is null and expires_at > now()
   order by created_at desc;
$$;

-- ── Admins only ────────────────────────────────────────────
create or replace function public.senior_list() returns table (user_id uuid)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admins_only'; end if;
  return query select s.user_id from seniors s;
end;
$$;

create or replace function public.set_senior(p_user uuid, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admins_only'; end if;
  if p_on then
    insert into seniors (user_id) values (p_user) on conflict do nothing;
  else
    delete from seniors where user_id = p_user;
    -- Losing senior status takes their live message down too.
    update senior_posts set removed_at = now(), removed_by = auth.uid()
     where author_id = p_user and removed_at is null and expires_at > now();
  end if;
end;
$$;

-- Live messages with their authors, for moderation.
create or replace function public.senior_posts_admin()
returns table (id uuid, body text, author_id uuid, created_at timestamptz, expires_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not is_admin() then raise exception 'admins_only'; end if;
  return query select p.id, p.body, p.author_id, p.created_at, p.expires_at from senior_posts p
    where p.removed_at is null and p.expires_at > now() order by p.created_at desc;
end;
$$;

create or replace function public.senior_remove(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admins_only'; end if;
  update senior_posts set removed_at = now(), removed_by = auth.uid() where id = p_id and removed_at is null;
end;
$$;

revoke all on function public.is_senior(), public.senior_status(), public.senior_post(text), public.senior_withdraw(),
  public.senior_live(), public.senior_list(), public.set_senior(uuid, boolean), public.senior_posts_admin(),
  public.senior_remove(uuid) from public, anon;
grant execute on function public.is_senior(), public.senior_status(), public.senior_post(text), public.senior_withdraw(),
  public.senior_live(), public.senior_list(), public.set_senior(uuid, boolean), public.senior_posts_admin(),
  public.senior_remove(uuid) to authenticated;
