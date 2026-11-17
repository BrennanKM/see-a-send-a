-- See a Send a — the Golden Snipe
-- Each week (Mon–Sun, Pacific) one secret position is picked, e.g. "the 7th snipe of the week".
-- Whoever posts that snipe hits the Golden Snipe: a gold frame and +5 🏆 points.
-- Safe to re-run.

alter table public.snipes add column if not exists is_golden boolean not null default false;

-- Secret per-week state. No client access at all.
create table if not exists public.golden_weeks (
  week_start date primary key,
  target_n   int not null,
  seen       int not null default 0,
  snipe_id   uuid,
  awarded_at timestamptz
);
alter table public.golden_weeks enable row level security;
revoke all on public.golden_weeks from anon, authenticated;

create or replace function public.golden_check() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  today date := (now() at time zone 'America/Los_Angeles')::date;
  wk date := today - (extract(isodow from today)::int - 1);
  last_week int;
  gw golden_weeks;
begin
  new.is_golden := false; -- never trust the client on this
  select count(*) into last_week from snipes
   where (created_at at time zone 'America/Los_Angeles')::date between wk - 7 and wk - 1;
  insert into golden_weeks (week_start, target_n)
  values (wk, 1 + floor(random() * greatest(3, round(last_week * 0.8)))::int)
  on conflict (week_start) do nothing;
  update golden_weeks set seen = seen + 1 where week_start = wk returning * into gw;
  if gw.snipe_id is null and gw.seen = gw.target_n then
    new.is_golden := true;
    update golden_weeks set snipe_id = new.id, awarded_at = now() where week_start = wk;
  end if;
  return new;
end;
$$;
drop trigger if exists golden_check on public.snipes;
create trigger golden_check before insert on public.snipes
  for each row execute function public.golden_check();

-- 🏆 points now = bounty claims + 5 per Golden Snipe (deleted snipes drop out automatically).
create or replace function public.bounty_board(since timestamptz default '-infinity')
returns table (user_id uuid, points bigint, claims bigint)
language sql stable security invoker set search_path = public as $$
  select x.user_id, sum(x.points)::bigint, sum(x.claims)::bigint
  from (
    select claimed_by as user_id, points, 1 as claims
      from bounties where status = 'claimed' and claimed_by is not null and ended_at >= since
    union all
    select sniper_id, 5, 0 from snipes where is_golden and created_at >= since
  ) x
  group by x.user_id;
$$;
grant execute on function public.bounty_board(timestamptz) to authenticated;
