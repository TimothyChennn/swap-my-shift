# Swap My Shift

Expo (React Native) app backed by Supabase. See `CLAUDE.md` for the product
spec and conventions.

## Run it

```bash
npm install
cp .env.example .env   # then fill in the two values
npx expo start
```

Scan the QR code with Expo Go on your phone (same Wi-Fi as this machine).

## One-time Supabase setup

Do these in the Supabase dashboard for the project in `.env`.

### 1. Database

SQL Editor → New query → paste the whole of
`supabase/migrations/20260907000000_init.sql` → Run.

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
3. Supabase → Authentication → URL Configuration → Redirect URLs → add:
   - `exp://**` (Expo Go during development)
   - `swapmyshift://**` (dev / production builds)

The app opens Google in the system browser and comes back through
`Linking.createURL("auth/callback")`, so the redirect URL changes with your
machine's IP in Expo Go — the wildcard above covers that.

### 3. Realtime

Database → Publications → `supabase_realtime` should list `swap_requests`,
`join_requests` and `profiles` (the migration adds them). If it doesn't,
toggle them on there.

## Not wired yet

- Push / email notifications (prefs are stored; nothing sends yet).
- Qgenda ICS import (the URL is saved on the profile; no fetcher yet).
