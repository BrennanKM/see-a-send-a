-- See a Send a — achievements
-- Computed on demand from what people have actually done, so nothing has to be tracked
-- separately and existing activity counts. Returns only the achievements a member has
-- earned, with when they first earned each one. Safe to re-run.

create or replace function public.achievements(p_user uuid)
returns table (key text, earned_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  tz text := 'America/Los_Angeles';
begin
  if not is_member() then return; end if;
  return query
  with mine as (select id, created_at, is_golden from snipes where sniper_id = p_user),
  hits as (   -- every time this member was in someone's snipe
    select s.created_at from snipe_targets t join snipes s on s.id = t.snipe_id
    where t.target_id = p_user and s.sniper_id <> p_user
  ),
  claims as (select started_at, ended_at from bounties where claimed_by = p_user and status = 'claimed'),
  sl_counts as (select day, nominee_id, count(*) n from superlative_votes group by day, nominee_id),
  sl_wins as (  -- revealed superlatives this member won (ties count)
    select c.day, sl_reveal_at(c.day) as at
    from sl_counts c
    where c.nominee_id = p_user and now() >= sl_reveal_at(c.day)
      and c.n = (select max(n) from sl_counts c2 where c2.day = c.day)
  ),
  results(key, earned_at) as (
    select 'first_blood', (select min(created_at) from mine)
    union all select 'sharpshooter', (select created_at from mine order by created_at offset 9 limit 1)
    union all select 'night_owl', (select min(created_at) from mine where extract(hour from created_at at time zone tz) between 2 and 4)
    union all select 'hat_trick', (
      select min(created_at) from (
        select created_at, row_number() over (partition by (created_at at time zone tz)::date order by created_at) n from mine) x
      where n = 3)
    union all select 'double_tap', (
      select min(created_at) from (
        select s.created_at, row_number() over (partition by t.target_id, (s.created_at at time zone tz)::date order by s.created_at) n
        from snipes s join snipe_targets t on t.snipe_id = s.id where s.sniper_id = p_user) x
      where n = 2)
    union all select 'speedrun', (select min(ended_at) from claims where ended_at - started_at <= interval '10 minutes')
    union all select 'bounty_hunter', (select ended_at from claims order by ended_at offset 2 limit 1)
    union all select 'midas', (select min(created_at) from mine where is_golden)
    union all select 'most_wanted', (select created_at from hits order by created_at offset 9 limit 1)
    union all select 'ghost', (  -- first time 30 days passed (since joining or last getting sniped) without a snipe
      select min(p + interval '30 days') from (
        select t, lag(t) over (order by t) p from (
          select created_at t from profiles where id = p_user
          union all select created_at from hits
          union all select now()) ev) g
      where t - p >= interval '30 days')
    union all select 'civic_duty', (  -- voted in the Daily 7 days in a row
      select min(day)::timestamp at time zone tz from (
        select day, row_number() over (partition by grp order by day) k from (
          select day, day - (row_number() over (order by day))::int grp from superlative_votes where voter_id = p_user) d) r
      where k = 7)
    union all select 'chapters_choice', (select min(at) from sl_wins)
    union all select 'self_aware', (  -- voted "most likely to get sniped this week", then got sniped that week
      select min(w.at) from sl_wins w
      join superlative_days sd on sd.day = w.day
      join superlative_prompts sp on sp.id = sd.prompt_id
      where sp.text = 'Most likely to get sniped this week'
        and exists (select 1 from hits h
                    where (h.created_at at time zone tz)::date between w.day - (extract(isodow from w.day)::int - 1)
                                                                  and w.day - (extract(isodow from w.day)::int - 1) + 6))
  )
  select r.key, r.earned_at from results r where r.earned_at is not null and r.earned_at <= now()
  order by r.earned_at;
end;
$$;
revoke all on function public.achievements(uuid) from public, anon;
grant execute on function public.achievements(uuid) to authenticated;
