-- See a Send a — daily superlatives
-- A new "most likely to…" question every day (Pacific time). Members vote anonymously,
-- once per question (changeable until it closes). Each week's winners are revealed
-- together on Sunday at 6 PM Pacific; Sunday's question closes at the reveal.
-- Safe to re-run.

alter table public.profiles add column if not exists superlative_opt_out boolean not null default false;
grant update (display_name, avatar_path, bounty_opt_out, superlative_opt_out) on public.profiles to authenticated;

create table if not exists public.superlative_prompts (
  id     serial primary key,
  text   text not null unique,
  tone   text not null check (tone in ('good', 'bad', 'fun')),
  active boolean not null default true
);

create table if not exists public.superlative_days (
  day        date primary key,
  prompt_id  int not null references public.superlative_prompts,
  created_at timestamptz not null default now()
);

create table if not exists public.superlative_votes (
  day        date not null references public.superlative_days on delete cascade,
  voter_id   uuid not null references public.profiles on delete cascade,
  nominee_id uuid not null references public.profiles on delete cascade,
  voted_at   timestamptz not null default now(),
  primary key (day, voter_id)
);
create index if not exists superlative_votes_day_idx on public.superlative_votes (day, nominee_id);

-- Prompts and days are readable by members; votes only by the person who cast them.
-- All writes go through the functions below.
alter table public.superlative_prompts enable row level security;
alter table public.superlative_days    enable row level security;
alter table public.superlative_votes   enable row level security;
revoke all on public.superlative_prompts, public.superlative_days, public.superlative_votes from anon, authenticated;
grant select on public.superlative_prompts, public.superlative_days, public.superlative_votes to authenticated;
drop policy if exists "members read prompts" on public.superlative_prompts;
create policy "members read prompts" on public.superlative_prompts for select to authenticated using (public.is_member());
drop policy if exists "members read days" on public.superlative_days;
create policy "members read days" on public.superlative_days for select to authenticated using (public.is_member());
drop policy if exists "read own votes" on public.superlative_votes;
create policy "read own votes" on public.superlative_votes for select to authenticated using (voter_id = auth.uid());

-- Chapter time is Pacific.
create or replace function public.sl_today() returns date
language sql stable as $$ select (now() at time zone 'America/Los_Angeles')::date; $$;

-- Results for a day are revealed the Sunday on/after it, at 6 PM Pacific.
create or replace function public.sl_reveal_at(d date) returns timestamptz
language sql stable as $$
  select ((d + ((7 - extract(isodow from d)::int) % 7)) + time '18:00') at time zone 'America/Los_Angeles';
$$;

-- Pick the day's question once: not used in the last 60 days, and a different tone from yesterday's.
create or replace function public.sl_ensure_day(d date) returns int
language plpgsql security definer set search_path = public as $$
declare
  p int;
  prev_tone text;
begin
  select prompt_id into p from superlative_days where day = d;
  if found then return p; end if;
  select sp.tone into prev_tone from superlative_days sd join superlative_prompts sp on sp.id = sd.prompt_id where sd.day = d - 1;
  select sp.id into p from superlative_prompts sp
   where sp.active
     and not exists (select 1 from superlative_days x where x.prompt_id = sp.id and x.day > d - 60)
   order by (sp.tone = coalesce(prev_tone, '')), random()
   limit 1;
  if p is null then -- every question used recently: fall back to the least recently used
    select sp.id into p from superlative_prompts sp where sp.active
     order by (select max(x.day) from superlative_days x where x.prompt_id = sp.id) nulls first, random()
     limit 1;
  end if;
  insert into superlative_days (day, prompt_id) values (d, p) on conflict (day) do nothing;
  select prompt_id into p from superlative_days where day = d;
  return p;
end;
$$;
revoke all on function public.sl_ensure_day(date) from public, anon, authenticated;

create or replace function public.superlative_today()
returns table (day date, prompt text, tone text, votes int, my_vote uuid, voting_open boolean, reveal_at timestamptz)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare d date := sl_today();
begin
  if not is_member() then return; end if;
  perform sl_ensure_day(d);
  return query
    select d, sp.text, sp.tone,
           (select count(*)::int from superlative_votes v where v.day = d),
           (select v.nominee_id from superlative_votes v where v.day = d and v.voter_id = auth.uid()),
           now() < sl_reveal_at(d),
           sl_reveal_at(d)
    from superlative_days sd join superlative_prompts sp on sp.id = sd.prompt_id
    where sd.day = d;
end;
$$;

create or replace function public.cast_superlative_vote(p_nominee uuid) returns void
language plpgsql security definer set search_path = public as $$
declare d date := sl_today();
begin
  if not is_member() then raise exception 'not_member'; end if;
  perform sl_ensure_day(d);
  if now() >= sl_reveal_at(d) then raise exception 'voting_closed'; end if;
  if p_nominee = auth.uid() then raise exception 'no_self_vote'; end if;
  if not exists (select 1 from profiles p join allowed_emails a on a.email = p.email
                 where p.id = p_nominee and not p.superlative_opt_out) then
    raise exception 'not_eligible';
  end if;
  insert into superlative_votes (day, voter_id, nominee_id) values (d, auth.uid(), p_nominee)
  on conflict (day, voter_id) do update set nominee_id = excluded.nominee_id, voted_at = now();
end;
$$;

-- Admins can swap today's question, but only before anyone has voted on it.
create or replace function public.swap_superlative() returns void
language plpgsql security definer set search_path = public as $$
declare d date := sl_today();
begin
  if not is_admin() then raise exception 'admins_only'; end if;
  if exists (select 1 from superlative_votes where day = d) then raise exception 'already_has_votes'; end if;
  delete from superlative_days where day = d;
  perform sl_ensure_day(d);
end;
$$;

-- One week (Mon–Sun) of questions. Results (top 3, with vote counts) only after the reveal.
create or replace function public.superlative_week(p_ref date default null)
returns table (day date, prompt text, tone text, revealed boolean, reveal_at timestamptz, total_votes int, my_vote uuid, results jsonb)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  ref date := coalesce(p_ref, sl_today());
  mon date := ref - (extract(isodow from ref)::int - 1);
begin
  if not is_member() then return; end if;
  return query
    select sd.day, sp.text, sp.tone,
           now() >= sl_reveal_at(sd.day),
           sl_reveal_at(sd.day),
           (select count(*)::int from superlative_votes v where v.day = sd.day),
           (select v.nominee_id from superlative_votes v where v.day = sd.day and v.voter_id = auth.uid()),
           case when now() >= sl_reveal_at(sd.day) then
             (select jsonb_agg(jsonb_build_object('nominee_id', x.nominee_id, 'votes', x.n) order by x.n desc)
                from (select v.nominee_id, count(*) n from superlative_votes v where v.day = sd.day
                      group by v.nominee_id order by count(*) desc limit 3) x)
           end
    from superlative_days sd join superlative_prompts sp on sp.id = sd.prompt_id
    where sd.day between mon and mon + 6
    order by sd.day;
end;
$$;

revoke all on function public.superlative_today(), public.cast_superlative_vote(uuid), public.swap_superlative(), public.superlative_week(date) from public, anon;
grant execute on function public.superlative_today(), public.cast_superlative_vote(uuid), public.swap_superlative(), public.superlative_week(date) to authenticated;

-- The questions. Mostly lighthearted; a mix of compliments and roasts.
insert into public.superlative_prompts (text, tone) values
 ('Most likely to become a CEO', 'good'),
 ('Most likely to start a business before 25', 'good'),
 ('Most likely to end up on a billboard', 'good'),
 ('Most likely to give a TED talk', 'good'),
 ('Most likely to become a millionaire', 'good'),
 ('Most likely to help you move apartments', 'good'),
 ('Most likely to remember everyone''s birthday', 'good'),
 ('Best advice giver', 'good'),
 ('Most likely to make the whole chapter laugh', 'good'),
 ('Most likely to get the first job offer', 'good'),
 ('Most likely to run for office', 'good'),
 ('Most likely to be famous on LinkedIn', 'good'),
 ('Most likely to write a bestselling book', 'good'),
 ('Most likely to show up with snacks for everyone', 'good'),
 ('Best hype person before an interview', 'good'),
 ('Most likely to ace a test without studying', 'good'),
 ('Best dressed at career fair', 'good'),
 ('Best playlist', 'good'),
 ('Most likely to give a speech that makes people cry', 'good'),
 ('Most likely to know a guy for everything', 'good'),
 ('Most likely to finish the semester with a 4.0', 'good'),
 ('Most likely to travel to every continent', 'good'),
 ('Most likely to become DSP national president', 'good'),
 ('Best laugh', 'good'),
 ('Most likely to be your emergency contact', 'good'),
 ('Most likely to be a future boss you''d actually like', 'good'),
 ('Most likely to show up late to chapter', 'bad'),
 ('Most likely to fall asleep in class', 'bad'),
 ('Most likely to reply-all by accident', 'bad'),
 ('Most likely to get lost on campus', 'bad'),
 ('Most likely to spend all their money on DoorDash', 'bad'),
 ('Most likely to submit an assignment at 11:59', 'bad'),
 ('Most likely to laugh at the worst possible moment', 'bad'),
 ('Most likely to trip walking across the stage at graduation', 'bad'),
 ('Most likely to have 400 unread emails', 'bad'),
 ('Most likely to start drama in the group chat', 'bad'),
 ('Most likely to text the wrong person', 'bad'),
 ('Most likely to forget their own birthday', 'bad'),
 ('Most likely to lose their keys this week', 'bad'),
 ('Most likely to take a 3-hour "nap"', 'bad'),
 ('Most likely to buy something useless on Amazon at 2am', 'bad'),
 ('Most likely to be on their phone during a meeting', 'bad'),
 ('Most likely to say "per my last email"', 'bad'),
 ('Most likely to get a parking ticket', 'bad'),
 ('Most likely to walk into the wrong classroom', 'bad'),
 ('Most likely to get sunburned on a cloudy day', 'bad'),
 ('Most likely to binge a whole series in one night', 'bad'),
 ('Most likely to overshare on LinkedIn', 'bad'),
 ('Most likely to start the group project the night before', 'bad'),
 ('Most likely to get kicked out of the library for being loud', 'bad'),
 ('Most likely to be the last one to leave the party', 'bad'),
 ('Most likely to get sniped this week', 'bad'),
 ('Most likely to cry at a movie', 'fun'),
 ('Most likely to talk their way out of anything', 'fun'),
 ('Most likely to accidentally go viral', 'fun'),
 ('Most likely to survive a zombie apocalypse', 'fun'),
 ('Most likely to believe a conspiracy theory', 'fun'),
 ('Most likely to make friends with a stranger in line', 'fun'),
 ('Most likely to go to Disneyland on a Tuesday', 'fun'),
 ('Most likely to have a secret talent', 'fun'),
 ('Most likely to end up on a reality TV show', 'fun'),
 ('Most likely to be at the gym at 5am', 'fun'),
 ('Most likely to still be in the GroupMe in 20 years', 'fun'),
 ('Most likely to snipe someone from 100 yards away', 'fun'),
 ('Most likely to win a hot dog eating contest', 'fun'),
 ('Most likely to adopt five dogs', 'fun'),
 ('Most likely to become a professor', 'fun'),
 ('Most likely to own a boat', 'fun'),
 ('Most likely to have a podcast', 'fun'),
 ('Most likely to be famous for something random', 'fun')
on conflict (text) do nothing;
