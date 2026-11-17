-- See a Send a — rolling bounty
-- One brother holds the bounty at a time. The first snipe that tags him claims it,
-- awards the sniper points, and hands the bounty to a new random brother.
-- Safe to re-run.

alter table public.profiles add column if not exists bounty_opt_out boolean not null default false;
grant update (display_name, avatar_path, bounty_opt_out) on public.profiles to authenticated;

create table if not exists public.bounties (
  id             uuid primary key default gen_random_uuid(),
  target_id      uuid not null references public.profiles on delete cascade,
  started_at     timestamptz not null default now(),
  ended_at       timestamptz,
  status         text not null default 'active' check (status in ('active','claimed','escaped','cancelled')),
  claimed_by     uuid references public.profiles on delete set null,
  -- Deleting the claiming snipe (e.g. a fake) deletes the claim and its points.
  claim_snipe_id uuid references public.snipes on delete cascade,
  points         int
);
create unique index if not exists bounties_one_active on public.bounties ((true)) where status = 'active';
create index if not exists bounties_claims_idx on public.bounties (claimed_by, ended_at) where status = 'claimed';
create index if not exists bounties_snipe_idx on public.bounties (claim_snipe_id);

alter table public.bounties enable row level security;
revoke all on public.bounties from anon, authenticated;
grant select on public.bounties to authenticated;
drop policy if exists "members read bounties" on public.bounties;
create policy "members read bounties" on public.bounties
  for select to authenticated using (public.is_member());

-- 3 points, +1 for every full day the bounty survives, max 10.
create or replace function public.bounty_value(started timestamptz) returns int
language sql stable as $$
  select least(10, 3 + floor(extract(epoch from (now() - started)) / 86400)::int);
$$;

-- Hand the bounty to a random eligible brother (on the roster, not opted out, not excluded).
create or replace function public.start_new_bounty(exclude uuid[]) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  pick uuid;
begin
  select p.id into pick
  from profiles p join allowed_emails a on a.email = p.email
  where not p.bounty_opt_out and p.id <> all (coalesce(exclude, '{}'))
  order by random() limit 1;
  if pick is null then return null; end if;
  begin
    insert into bounties (target_id) values (pick);
  exception when unique_violation then
    return null; -- someone else started one at the same moment
  end;
  return pick;
end;
$$;
revoke all on function public.start_new_bounty(uuid[]) from public, anon, authenticated;

-- The live bounty. Also rotates it if it's 7 days old or the holder left / opted out.
create or replace function public.current_bounty()
returns table (bounty_id uuid, bounty_target uuid, bounty_started timestamptz, bounty_points int)
language plpgsql security definer set search_path = public as $$
declare
  b bounties;
begin
  if not is_member() then return; end if;
  select * into b from bounties where status = 'active' for update;
  if found and (
       b.started_at < now() - interval '7 days'
       or not exists (select 1 from profiles p join allowed_emails a on a.email = p.email
                      where p.id = b.target_id and not p.bounty_opt_out)) then
    update bounties
       set status = case when b.started_at < now() - interval '7 days' then 'escaped' else 'cancelled' end,
           ended_at = now()
     where id = b.id;
    perform start_new_bounty(array[b.target_id]);
    b := null;
  end if;
  if b.id is null then
    select * into b from bounties where status = 'active';
    if not found then
      perform start_new_bounty('{}');
      select * into b from bounties where status = 'active';
    end if;
  end if;
  if b.id is null then return; end if;
  return query select b.id, b.target_id, b.started_at, bounty_value(b.started_at);
end;
$$;
revoke all on function public.current_bounty() from public, anon;
grant execute on function public.current_bounty() to authenticated;

-- Tagging the bounty holder in a snipe claims it.
create or replace function public.claim_bounty() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  b bounties;
  shooter uuid;
begin
  select sniper_id into shooter from snipes where id = new.snipe_id;
  if shooter is null or shooter = new.target_id then return new; end if;
  select * into b from bounties where status = 'active' and target_id = new.target_id for update;
  if not found then return new; end if;
  update bounties
     set status = 'claimed', ended_at = now(), claimed_by = shooter,
         claim_snipe_id = new.snipe_id, points = bounty_value(b.started_at)
   where id = b.id;
  perform start_new_bounty(array[b.target_id, shooter]);
  return new;
end;
$$;
drop trigger if exists on_snipe_target_claim_bounty on public.snipe_targets;
create trigger on_snipe_target_claim_bounty
  after insert on public.snipe_targets
  for each row execute function public.claim_bounty();

-- Bounty points per brother since a date.
create or replace function public.bounty_board(since timestamptz default '-infinity')
returns table (user_id uuid, points bigint, claims bigint)
language sql stable security invoker set search_path = public as $$
  select claimed_by, sum(points), count(*)
  from bounties
  where status = 'claimed' and claimed_by is not null and ended_at >= since
  group by claimed_by;
$$;
grant execute on function public.bounty_board(timestamptz) to authenticated;
