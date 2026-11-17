-- See a Send a — the ticker
-- One call returns a list of fun, current chapter stats for the scrolling ticker:
-- [{ icon, text, href }]. Members only. Safe to re-run.

create or replace function public.ticker_ago(t timestamptz) returns text
language sql stable as $$
  select case
    when now() - t < interval '1 minute' then 'just now'
    when now() - t < interval '1 hour' then floor(extract(epoch from now() - t) / 60)::int || 'm ago'
    when now() - t < interval '1 day' then floor(extract(epoch from now() - t) / 3600)::int || 'h ago'
    else floor(extract(epoch from now() - t) / 86400)::int || 'd ago' end;
$$;

create or replace function public.ticker() returns jsonb
language plpgsql volatile security definer set search_path = public as $$
#variable_conflict use_column
declare
  tz text := 'America/Los_Angeles';
  today date := (now() at time zone tz)::date;
  wk date := today - (extract(isodow from today)::int - 1);
  wk_start timestamptz := wk::timestamp at time zone tz;
  items jsonb := '[]'::jsonb;
  r record;
  n int;
begin
  if not is_member() then return '[]'::jsonb; end if;

  -- Snipes today
  select count(*) into n from snipes where (created_at at time zone tz)::date = today;
  items := items || jsonb_build_object('icon', '🎯', 'href', '#/', 'text',
    case when n = 0 then 'No snipes yet today. Someone get it started.'
         when n = 1 then '1 snipe so far today' else n || ' snipes so far today' end);

  -- Latest snipe
  select s.id, s.created_at, p.display_name sniper,
         (select string_agg(tp.display_name, ' & ') from snipe_targets t join profiles tp on tp.id = t.target_id where t.snipe_id = s.id) targets
    into r from snipes s join profiles p on p.id = s.sniper_id order by s.created_at desc limit 1;
  if found then
    items := items || jsonb_build_object('icon', '⏱️', 'href', '#/snipe/' || r.id,
      'text', 'Latest: ' || r.sniper || ' sniped ' || coalesce(r.targets, 'someone') || ' · ' || ticker_ago(r.created_at));
  end if;

  -- Top sniper this week
  select p.id, p.display_name, count(*) n into r from snipes s join profiles p on p.id = s.sniper_id
   where s.created_at >= wk_start group by p.id, p.display_name order by count(*) desc, max(s.created_at) desc limit 1;
  if found and r.n >= 2 then
    items := items || jsonb_build_object('icon', '🔥', 'href', '#/u/' || r.id, 'text', 'Top sniper this week: ' || r.display_name || ' (' || r.n || ')');
  end if;

  -- Most sniped this week
  select p.id, p.display_name, count(*) n into r from snipe_targets t join snipes s on s.id = t.snipe_id join profiles p on p.id = t.target_id
   where s.created_at >= wk_start and s.sniper_id <> t.target_id group by p.id, p.display_name order by count(*) desc, max(s.created_at) desc limit 1;
  if found and r.n >= 2 then
    items := items || jsonb_build_object('icon', '👀', 'href', '#/u/' || r.id, 'text', 'Most wanted this week: ' || r.display_name || ', caught ' || r.n || ' times');
  end if;

  -- Current bounty
  select b.started_at, bounty_value(b.started_at) pts, p.display_name into r
    from bounties b join profiles p on p.id = b.target_id where b.status = 'active';
  if found then
    items := items || jsonb_build_object('icon', '🏆', 'href', '#/bounty',
      'text', 'Bounty: ' || r.display_name || ' is worth ' || r.pts || ' pts · on the run ' || replace(ticker_ago(r.started_at), ' ago', ''));
  end if;

  -- Today's Daily question
  select sp.text, (select count(*) from superlative_votes v where v.day = today) votes into r
    from superlative_days sd join superlative_prompts sp on sp.id = sd.prompt_id where sd.day = today;
  if found then
    items := items || jsonb_build_object('icon', '🗳️', 'href', '#/daily',
      'text', 'Today''s Daily: ' || r.text || ' · ' || r.votes || case when r.votes = 1 then ' vote' else ' votes' end);
  end if;

  -- Two winners from the most recently revealed superlatives
  for r in
    with c as (select day, nominee_id, count(*) n from superlative_votes group by day, nominee_id),
    latest as (select max(day) d from superlative_days where now() >= sl_reveal_at(day)),
    wins as (
      select c.day, sp.text, string_agg(p.display_name, ' & ') names
      from c join superlative_days sd on sd.day = c.day join superlative_prompts sp on sp.id = sd.prompt_id
      join profiles p on p.id = c.nominee_id, latest
      where c.day > latest.d - 7 and c.day <= latest.d
        and c.n = (select max(n) from c c2 where c2.day = c.day)
      group by c.day, sp.text)
    select * from wins order by random() limit 2
  loop
    items := items || jsonb_build_object('icon', '👑', 'href', '#/daily', 'text',
      case when r.text ilike 'Most likely to %' then r.names || ' was voted most likely to ' || substr(r.text, 16)
           else r.text || ': ' || r.names end);
  end loop;

  -- Golden Snipe (never reveals the secret number)
  select p.display_name, s.id into r from snipes s join profiles p on p.id = s.sniper_id
   where s.is_golden and s.created_at >= wk_start limit 1;
  items := items || case when found
    then jsonb_build_object('icon', '✨', 'href', '#/snipe/' || r.id, 'text', r.display_name || ' hit this week''s Golden Snipe')
    else jsonb_build_object('icon', '✨', 'href', '#/', 'text', 'This week''s Golden Snipe is still out there…') end;

  -- Busiest spot this week
  select initcap(lower(location)) loc, count(*) n into r from snipes
   where created_at >= wk_start and nullif(trim(location), '') is not null
   group by initcap(lower(location)) order by count(*) desc limit 1;
  if found and r.n >= 2 then
    items := items || jsonb_build_object('icon', '📍', 'href', '#/', 'text', 'Sniper hotspot this week: ' || r.loc || ' (' || r.n || ')');
  end if;

  -- Most-reacted snipe this week
  select s.id, p.display_name sniper, count(x.*) n into r
    from snipes s join profiles p on p.id = s.sniper_id join reactions x on x.snipe_id = s.id
   where s.created_at >= wk_start group by s.id, p.display_name order by count(x.*) desc limit 1;
  if found and r.n >= 3 then
    items := items || jsonb_build_object('icon', '💥', 'href', '#/snipe/' || r.id, 'text', 'Snipe of the week so far: ' || r.sniper || '''s, with ' || r.n || ' reactions');
  end if;

  -- Revenge: someone sniped back the person who got them, within 48h, in the last week
  select pb.display_name avenger, pa.display_name victim, b.created_at - a.created_at gap, b.id into r
    from snipes a join snipe_targets ta on ta.snipe_id = a.id
    join snipes b on b.sniper_id = ta.target_id and b.created_at > a.created_at and b.created_at < a.created_at + interval '48 hours'
    join snipe_targets tb on tb.snipe_id = b.id and tb.target_id = a.sniper_id
    join profiles pa on pa.id = a.sniper_id join profiles pb on pb.id = b.sniper_id
   where b.created_at > now() - interval '7 days' and a.sniper_id <> ta.target_id
   order by b.created_at desc limit 1;
  if found then
    items := items || jsonb_build_object('icon', '🔁', 'href', '#/snipe/' || r.id, 'text', 'Revenge: ' || r.avenger || ' got ' || r.victim || ' back '
      || case when r.gap < interval '1 hour' then floor(extract(epoch from r.gap) / 60)::int || ' minutes later'
              else floor(extract(epoch from r.gap) / 3600)::int || 'h later' end);
  end if;

  -- Longest current posting streak (days in a row, ending today or yesterday)
  select p.id, p.display_name, x.len into r from (
    select sniper_id, count(*) len from (
      select sniper_id, d, d - (row_number() over (partition by sniper_id order by d))::int grp
      from (select distinct sniper_id, (created_at at time zone tz)::date d from snipes) days) g
    group by sniper_id, grp having max(d) >= today - 1) x
    join profiles p on p.id = x.sniper_id order by x.len desc limit 1;
  if found and r.len >= 3 then
    items := items || jsonb_build_object('icon', '📆', 'href', '#/u/' || r.id, 'text', r.display_name || ' has posted ' || r.len || ' days in a row');
  end if;

  -- Newest achievement in the last 3 days
  select p.id, p.display_name, a.key into r from profiles p cross join lateral achievements(p.id) a
   where a.earned_at > now() - interval '3 days' order by a.earned_at desc limit 1;
  if found then
    items := items || jsonb_build_object('icon', '🏅', 'href', '#/u/' || r.id, 'text', r.display_name || ' just unlocked ' || case r.key
      when 'first_blood' then 'First Blood' when 'sharpshooter' then 'Sharpshooter' when 'hat_trick' then 'Hat Trick'
      when 'double_tap' then 'Double Tap' when 'night_owl' then 'Night Owl' when 'speedrun' then 'Speedrun'
      when 'bounty_hunter' then 'Bounty Hunter' when 'midas' then 'Midas Touch' when 'most_wanted' then 'Magnet'
      when 'ghost' then 'Ghost' when 'civic_duty' then 'Civic Duty' when 'chapters_choice' then 'Chapter''s Choice'
      when 'self_aware' then 'Self-Aware' else 'an achievement' end);
  end if;

  -- All time
  select count(*) into n from snipes;
  if n > 0 then items := items || jsonb_build_object('icon', '📈', 'href', '#/leaders', 'text', n || ' snipes all time'); end if;

  return items;
end;
$$;
revoke all on function public.ticker() from public, anon;
grant execute on function public.ticker() to authenticated;
