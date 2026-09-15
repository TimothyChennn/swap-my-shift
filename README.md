# Shift Swap

Shift-swapping app for a small healthcare team. Members post shifts they want to drop or pick up, cover each other, and settle up in an internal "stars" currency. Expo (React Native) on the front, Supabase on the back.

**Status: actively in development.** Auth, groups, join approval, swap requests, star transfers, leaderboard, and Qgenda schedule import all work against Supabase. Push and email notifications are not wired yet. Expect breaking changes.

## What it does

- An admin creates a group and approves join requests. Employees find the group by name and request to join. One group per user.
- Home is a month calendar. Days with an open pickup request show a "+" badge, days with a drop request show a "−". Tapping a day opens a sheet with that day's shifts and requests, and a form to post a new one.
- Drop requests carry stars. Accepting one moves the offered stars from the dropper to the person covering, in a single transaction. Pickup requests are free.
- Leaderboard ranks the group by star balance. Balance is always the sum of a user's transactions, never a stored column.
- Settings holds notification preferences, the user's Qgenda calendar link, and the admin panel: pending requests, grant stars, transfer admin.
- Shifts import from each user's Qgenda ICS feed through a Supabase Edge Function, on demand from the app and optionally on a schedule via pg_cron.

## How it works

```
Expo Router app (TypeScript, NativeWind)
  ├── lib/auth.tsx        session + profile provider, Google sign-in via system browser
  ├── lib/supabase.ts     client, SQLite-backed session storage, syncShifts()
  └── app/(tabs)/         home, leaderboard, stars, settings
             │
             ▼  supabase-js
Supabase
  ├── Postgres + Row Level Security   users only read rows in their own group
  ├── security definer RPCs           create_group, request_join, review_join_request,
  │                                   grant_stars, transfer_admin, post/accept/cancel_swap_request
  ├── Realtime                        swap_requests, join_requests, profiles
  └── Edge Function import-shifts     fetches and parses each user's Qgenda ICS feed
```

Anything that changes money-like state (stars, admin role, approvals) never happens as a direct table write. It goes through a Postgres function that checks `auth.uid()` itself and runs in one transaction. Edge Functions are reserved for work that needs the outside world.

## Tech stack

- Expo SDK 57, Expo Router, React Native 0.86, TypeScript
- NativeWind (Tailwind for React Native)
- Supabase: Postgres, Auth (Google), RLS, Realtime, Edge Functions (Deno)
- expo-sqlite as the localStorage polyfill so sessions persist

## Run it

```bash
git clone https://github.com/TimothyChennn/swap-my-shift.git
cd swap-my-shift
npm install
cp .env.example .env   # EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY
npx expo start
```

Scan the QR code with Expo Go on your phone (same Wi-Fi as this machine). The app throws on launch if the two env values are missing.

## One-time Supabase setup

Do these in the Supabase dashboard for the project in `.env`.

### 1. Database

SQL Editor → New query → paste each file in `supabase/migrations/` in
filename order → Run (one query per file).

This creates the tables, Row Level Security policies, the RPC functions the
app calls (`create_group`, `request_join`, `review_join_request`,
`grant_stars`, `transfer_admin`, `post_swap_request`, `accept_swap_request`,
`cancel_swap_request`), a trigger that creates a profile for every new auth
user, and Realtime on `swap_requests`, `join_requests` and `profiles`.

If you'd rather use the CLI: `supabase link --project-ref <ref>` then
`supabase db push`.

### 2. Google sign-in

1. [Google Cloud Console](https://console.cloud.google.com/apis/credentials) →
   Create credentials → OAuth client ID → **Web application**.
   - Authorized redirect URI:
     `https://<project-ref>.supabase.co/auth/v1/callback`
2. Supabase → Authentication → Providers → Google → enable, paste the client
   ID and secret.
3. Supabase → Authentication → URL Configuration:
   - **Site URL:** `swapmyshift://auth/callback`. Supabase sends any redirect
     it doesn't recognise here, so this makes the store build's sign-in
     work no matter what.
   - **Redirect URLs:** `swapmyshift://**` for builds, plus the **exact**
     Expo Go URL for development, e.g. `exp://192.168.4.88:8081/--/auth/callback`
     (`npx expo start` prints the IP). Supabase's `**` wildcard does not
     match numeric hosts, so `exp://**` never matches an IP address; add
     the exact URL again whenever your Mac's IP changes. Alternatively run
     `npx expo start --tunnel`: tunnel URLs have a named host, which
     `exp://**` does match.

The app opens Google in the system browser and comes back through
`Linking.createURL("auth/callback")`, so the redirect URL changes with your
machine's IP in Expo Go — the wildcard above covers that.

### 3. Qgenda shift import (Edge Function)

The `import-shifts` function fetches each user's Qgenda ICS feed. Deploying
it uses the Supabase CLI (no install needed, `npx` fetches it):

```bash
npx supabase login                                  # opens a browser, once
npx supabase link --project-ref <project-ref>
npx supabase functions deploy import-shifts
```

The app syncs the signed-in user's feed when Home opens (at most hourly)
and from Settings → **Sync now**. To also refresh everyone in the
background, schedule the function from SQL Editor (fill in your service
role key from Project Settings → API; it lives in Vault, not in the job):

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;
select vault.create_secret('<service-role-key>', 'service_role_key');

select cron.schedule('import-shifts', '0 */6 * * *', $$
  select net.http_post(
    url := 'https://<project-ref>.supabase.co/functions/v1/import-shifts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'
      )
    ),
    body := '{}'::jsonb
  );
$$);
```

### 4. Realtime

Database → Publications → `supabase_realtime` should list `swap_requests`,
`join_requests` and `profiles` (the migration adds them). If it doesn't,
toggle them on there.

## Screenshots

<!-- Add captures of the Home calendar, a day sheet with an open request, and the admin panel. -->
![Home calendar placeholder](docs/screenshot-home.png)

## Project layout

| Path | Role |
|---|---|
| `app/_layout.tsx` | Auth gate via `Stack.Protected` |
| `app/sign-in.tsx`, `app/onboarding.tsx` | Google sign-in, create or find a group |
| `app/(tabs)/` | Home, Leaderboard, Stars, Settings |
| `components/DaySheet.tsx` | Day detail and request actions |
| `lib/` | Supabase client, auth provider, date helpers, row types |
| `supabase/migrations/` | Schema, RLS policies, RPC functions, Realtime publication |
| `supabase/functions/import-shifts/` | Qgenda ICS import Edge Function |
| `CLAUDE.md` | Product spec and conventions |

## Not wired yet

- Push / email notifications (prefs are stored; nothing sends yet).
- Phone login, SMS, in-app purchases, direct Qgenda API sync, multi-group membership, chat (all v2).
