# See a Send a

A chapter-only, BeReal-style feed for photo snipes. Brothers sign in with an email code, snap a brother from a distance, tag him, and the whole chapter gets a push notification. It also has emoji reactions, comments, a leaderboard (top snipers / most wanted), profiles, and an admin roster that controls who can get in.

**Live** for my Delta Sigma Pi chapter since September 2026 at [see-a-send-a.pages.dev](https://see-a-send-a.pages.dev) (members only), with 50+ daily users.

Beyond the feed, it has a rolling bounty on one brother at a time, a hidden "Golden Snipe" each week, a daily anonymous superlative vote with a weekly reveal, 13 achievements computed from existing data, a live stats ticker, and an anonymous suggestion box that only admins can read. Most of the game logic lives in Postgres (triggers and RPCs behind row-level security), so the client stays a static site.

**Built with:** vanilla JavaScript PWA (no build step), Supabase (Postgres, Auth, Storage, Edge Functions), Web Push with VAPID, Cloudflare Pages.

It's a web app that brothers add to their Home Screen, so there's no App Store. Everything is static files in `public/`, with Supabase handling logins, photos, and data.

```
public/        ← the whole site (deploy this folder only)
supabase/      ← database schema + push-notification function
vapid-keys.local.txt  ← PRIVATE push key. Never deploy or commit it.
```

## Try it locally (demo mode)

With `SUPABASE_URL` empty in `public/config.js` the app runs on fake data:

```bash
python3 -m http.server 8743 -d public
```

Open http://localhost:8743. Any email and any 6 digits will sign you in.

## Going live (about 30 minutes)

### 1. Supabase project
1. Create a free project at https://supabase.com.
2. **SQL Editor → New query**: paste all of `supabase/schema.sql` and run it.
3. Add yourself as the first admin (use your real email):
   ```sql
   insert into public.allowed_emails (email, is_admin) values ('you@school.edu', true);
   ```
4. **Project Settings → API**: copy the *Project URL* and the *anon / publishable* key into `public/config.js`.

### 2. Email codes
Supabase's built-in mailer only sends to your own team's addresses, a few per hour, so brothers won't get codes until you add real SMTP.
1. **Authentication → Emails → SMTP Settings**: turn on custom SMTP. Resend's free tier works well (host `smtp.resend.com`, port 465, user `resend`, password = a Resend API key, sender on a domain you've verified there).
2. **Authentication → Emails → Templates**: in both **Magic Link** and **Confirm signup**, replace the body with something like:
   ```html
   <h2>Your See a Send a code</h2>
   <p style="font-size:28px;letter-spacing:6px"><b>{{ .Token }}</b></p>
   ```
   The app uses the code, not the link. On iPhone a link would open Safari instead of the Home Screen app.
3. **Authentication → Sign In / Providers → Email**: set the email OTP length to match `OTP_LENGTH` in `public/config.js` (8 here).
4. **Authentication → URL Configuration**: set Site URL to your live URL once you have it (step 4).

### 3. Push notifications
1. **Edge Functions → Deploy a new function → Via editor**: name it `notify` and paste in `supabase/functions/notify/index.ts`.
2. **Edge Functions → Secrets**: add
   - `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` from `vapid-keys.local.txt`
   - `VAPID_SUBJECT` = `mailto:you@school.edu`

The public key is already in `public/config.js`. If you ever regenerate the keys, update both places.

### 4. Deploy the site
Cloudflare: **Workers & Pages → Create → Pages → Upload assets**, then upload **only the `public` folder**. You'll get a `*.pages.dev` URL. You can add a custom domain later.

### 5. Bring in the chapter
1. Sign in yourself, then go to **Settings → Chapter roster**. Copy the chapter join code shown there (or tap *New code*). Brothers enter it once on their first sign-in, so you don't need their emails. You can still add emails by hand on the same page.
2. Post the link in the GroupMe with these instructions:
   > **iPhone:** open the link in Safari → Share → **Add to Home Screen** → open it from your Home Screen → sign in → turn on alerts.
   > **Android:** open in Chrome → ⋮ → **Install app**.

   iPhones can only receive notifications once the app has been added to the Home Screen (iOS 16.4+).

## How access works
- Only emails on the roster can create an account; anyone else gets bounced at sign-up.
- Removing someone from the roster locks them out right away. Their old snipes stay up.
- Photos are in a private bucket and only served to signed-in members through short-lived links.
- Everyone can delete their own snipes and comments. Admins can delete anyone's.
