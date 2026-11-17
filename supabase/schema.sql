-- See a Send a — database schema
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- Safe to re-run: every statement is idempotent.

create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────────────────────
-- Roster: only emails listed here can create an account.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.allowed_emails (
  email      text primary key check (email = lower(email)),
  is_admin   boolean not null default false,
  added_at   timestamptz not null default now()
);

create table if not exists public.profiles (
  id           uuid primary key references auth.users on delete cascade,
  email        text not null unique,
  display_name text not null check (char_length(display_name) between 1 and 40),
  avatar_path  text,
  created_at   timestamptz not null default now()
);

create table if not exists public.snipes (
  id          uuid primary key default gen_random_uuid(),
  sniper_id   uuid not null default auth.uid() references public.profiles on delete cascade,
  photo_path  text not null,
  caption     text check (char_length(caption) <= 280),
  location    text check (char_length(location) <= 60),
  notified_at timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists snipes_created_at_idx on public.snipes (created_at desc);
create index if not exists snipes_sniper_idx on public.snipes (sniper_id, created_at desc);

create table if not exists public.snipe_targets (
  snipe_id  uuid not null references public.snipes on delete cascade,
  target_id uuid not null references public.profiles on delete cascade,
  primary key (snipe_id, target_id)
);
create index if not exists snipe_targets_target_idx on public.snipe_targets (target_id);

create table if not exists public.reactions (
  snipe_id   uuid not null references public.snipes on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles on delete cascade,
  emoji      text not null check (emoji in ('🎯','🔥','😂','💀','👀')),
  created_at timestamptz not null default now(),
  primary key (snipe_id, user_id, emoji)
);

create table if not exists public.comments (
  id         uuid primary key default gen_random_uuid(),
  snipe_id   uuid not null references public.snipes on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles on delete cascade,
  body       text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists comments_snipe_idx on public.comments (snipe_id, created_at);

create table if not exists public.push_subscriptions (
  endpoint   text primary key,
  user_id    uuid not null default auth.uid() references public.profiles on delete cascade,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- Helpers
-- ─────────────────────────────────────────────────────────────
create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  -- Removing someone from the roster revokes their access immediately.
  select exists (
    select 1 from profiles p join allowed_emails a on a.email = p.email
    where p.id = auth.uid()
  );
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p join allowed_emails a on a.email = p.email
    where p.id = auth.uid() and a.is_admin
  );
$$;

-- Block sign-ups from anyone not on the roster. The profile is created later, on
-- confirmation (see supabase/fix-ghost-profiles.sql), so abandoned sign-ups stay invisible.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from allowed_emails where email = lower(new.email)) then
    raise exception 'not_on_roster';
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Leaderboard: snipes taken and times sniped since a given moment.
create or replace function public.leaderboard(since timestamptz default '-infinity')
returns table (user_id uuid, snipes bigint, sniped bigint)
language sql stable security invoker set search_path = public as $$
  select p.id,
         (select count(*) from snipes s where s.sniper_id = p.id and s.created_at >= since),
         (select count(*) from snipe_targets t join snipes s on s.id = t.snipe_id
            where t.target_id = p.id and s.created_at >= since)
  from profiles p;
$$;

-- Table privileges for signed-in users (RLS below decides which rows).
-- Explicit so it works even when "automatically expose new tables" is off.
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on function public.is_member(), public.is_admin(), public.leaderboard(timestamptz) to authenticated;
revoke all on all tables in schema public from anon;

-- ─────────────────────────────────────────────────────────────
-- Row-level security: members see everything, change only their own.
-- ─────────────────────────────────────────────────────────────
alter table public.allowed_emails     enable row level security;
alter table public.profiles           enable row level security;
alter table public.snipes             enable row level security;
alter table public.snipe_targets      enable row level security;
alter table public.reactions          enable row level security;
alter table public.comments           enable row level security;
alter table public.push_subscriptions enable row level security;

drop policy if exists "admins manage roster" on public.allowed_emails;
create policy "admins manage roster" on public.allowed_emails
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "members read profiles" on public.profiles;
create policy "members read profiles" on public.profiles
  for select to authenticated using (public.is_member());
drop policy if exists "edit own profile" on public.profiles;
create policy "edit own profile" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
-- Only the name and avatar are editable from the app.
revoke update on public.profiles from authenticated;
grant update (display_name, avatar_path) on public.profiles to authenticated;

drop policy if exists "members read snipes" on public.snipes;
create policy "members read snipes" on public.snipes
  for select to authenticated using (public.is_member());
drop policy if exists "post own snipes" on public.snipes;
create policy "post own snipes" on public.snipes
  for insert to authenticated with check (sniper_id = auth.uid() and public.is_member());
drop policy if exists "delete own snipes" on public.snipes;
create policy "delete own snipes" on public.snipes
  for delete to authenticated using (sniper_id = auth.uid() or public.is_admin());
revoke update on public.snipes from authenticated;

drop policy if exists "members read targets" on public.snipe_targets;
create policy "members read targets" on public.snipe_targets
  for select to authenticated using (public.is_member());
drop policy if exists "sniper tags targets" on public.snipe_targets;
create policy "sniper tags targets" on public.snipe_targets
  for insert to authenticated
  with check (exists (select 1 from public.snipes s where s.id = snipe_id and s.sniper_id = auth.uid()));

drop policy if exists "members read reactions" on public.reactions;
create policy "members read reactions" on public.reactions
  for select to authenticated using (public.is_member());
drop policy if exists "react as self" on public.reactions;
create policy "react as self" on public.reactions
  for insert to authenticated with check (user_id = auth.uid() and public.is_member());
drop policy if exists "unreact as self" on public.reactions;
create policy "unreact as self" on public.reactions
  for delete to authenticated using (user_id = auth.uid());

drop policy if exists "members read comments" on public.comments;
create policy "members read comments" on public.comments
  for select to authenticated using (public.is_member());
drop policy if exists "comment as self" on public.comments;
create policy "comment as self" on public.comments
  for insert to authenticated with check (user_id = auth.uid() and public.is_member());
drop policy if exists "delete own comments" on public.comments;
create policy "delete own comments" on public.comments
  for delete to authenticated using (user_id = auth.uid() or public.is_admin());

drop policy if exists "manage own push subs" on public.push_subscriptions;
create policy "manage own push subs" on public.push_subscriptions
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────
-- Photo storage: private bucket, members read, each uploads to their own folder.
-- ─────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('snipes', 'snipes', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

drop policy if exists "members view photos" on storage.objects;
create policy "members view photos" on storage.objects
  for select to authenticated using (bucket_id = 'snipes' and public.is_member());
drop policy if exists "members upload own photos" on storage.objects;
create policy "members upload own photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'snipes' and public.is_member()
              and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "members delete own photos" on storage.objects;
create policy "members delete own photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'snipes' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- Live "new snipe" banner in the feed.
do $$ begin
  alter publication supabase_realtime add table public.snipes;
exception when duplicate_object then null;
end $$;

-- ─────────────────────────────────────────────────────────────
-- Chapter join code: anyone with the code can add their own email to the roster.
-- Admins set or rotate it in the app (Settings → Chapter roster). NULL turns it off.
-- ─────────────────────────────────────────────────────────────
alter table public.allowed_emails add column if not exists via_code boolean not null default false;

create table if not exists public.chapter_settings (
  id        int primary key default 1 check (id = 1),
  join_code text check (join_code is null or char_length(join_code) between 6 and 40)
);
insert into public.chapter_settings (id) values (1) on conflict (id) do nothing;
alter table public.chapter_settings enable row level security;
grant select, update on public.chapter_settings to authenticated;
drop policy if exists "admins read settings" on public.chapter_settings;
create policy "admins read settings" on public.chapter_settings
  for select to authenticated using (public.is_admin());
drop policy if exists "admins update settings" on public.chapter_settings;
create policy "admins update settings" on public.chapter_settings
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create or replace function public.join_with_code(p_email text, p_code text) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  c text;
begin
  select join_code into c from chapter_settings where id = 1;
  if c is null or p_code is null or lower(trim(p_code)) <> lower(c) then
    perform pg_sleep(1); -- slow down guessing
    return false;
  end if;
  if p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return false;
  end if;
  insert into allowed_emails (email, via_code) values (lower(trim(p_email)), true)
  on conflict (email) do nothing;
  return true;
end;
$$;
revoke all on function public.join_with_code(text, text) from public;
grant execute on function public.join_with_code(text, text) to anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- LAST STEP: put yourself on the roster as an admin (edit the email).
-- ─────────────────────────────────────────────────────────────
-- insert into public.allowed_emails (email, is_admin) values ('you@school.edu', true)
--   on conflict (email) do update set is_admin = true;
