-- Profiles are created when someone actually signs in (confirms their code),
-- not when a code is first requested. Stops typo'd / abandoned sign-ups from
-- showing up in the Brothers list, the tag picker and the bounty pool.

-- 1. Sign-up still requires being on the roster, but no longer creates the profile.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from allowed_emails where email = lower(new.email)) then
    raise exception 'not_on_roster';
  end if;
  return new;
end;
$$;

-- 2. Create the profile the moment the email is confirmed.
create or replace function public.handle_user_confirmed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email_confirmed_at is not null and old.email_confirmed_at is null then
    insert into profiles (id, email, display_name)
    values (new.id, lower(new.email), initcap(split_part(split_part(new.email, '@', 1), '.', 1)))
    on conflict (id) do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists on_auth_user_confirmed on auth.users;
create trigger on_auth_user_confirmed
  after update of email_confirmed_at on auth.users
  for each row execute function public.handle_user_confirmed();

-- 3. Remove existing ghost profiles: never confirmed and nothing attached to them.
--    (If one of these people finishes signing in later, step 2 recreates their profile.)
delete from public.profiles p
using auth.users u
where u.id = p.id
  and u.email_confirmed_at is null
  and not exists (select 1 from public.snipes s where s.sniper_id = p.id)
  and not exists (select 1 from public.snipe_targets t where t.target_id = p.id)
  and not exists (select 1 from public.comments c where c.user_id = p.id)
  and not exists (select 1 from public.reactions r where r.user_id = p.id)
  and not exists (select 1 from public.bounties b where b.target_id = p.id or b.claimed_by = p.id);
