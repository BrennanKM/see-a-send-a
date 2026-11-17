-- Security Advisor cleanup (Oct 20 2026). Safe to re-run.
-- 1) Pin search_path on helper functions.
alter function public.bounty_value(timestamptz) set search_path = public;
alter function public.sl_today()                set search_path = public;
alter function public.sl_reveal_at(date)        set search_path = public;
alter function public.ticker_ago(timestamptz)   set search_path = public;

-- 2) Trigger functions should never be callable over the API. Triggers still fire:
--    they run as the table owner, not the caller.
revoke execute on function public.claim_bounty()          from public, anon, authenticated;
revoke execute on function public.golden_check()          from public, anon, authenticated;
revoke execute on function public.handle_new_user()       from public, anon, authenticated;
revoke execute on function public.handle_user_confirmed() from public, anon, authenticated;
