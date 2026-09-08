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

### 3. Qgenda shift import (Edge Function)

The `import-shifts` function fetches each user's Qgenda ICS feed. Deploying
it uses the Supabase CLI (no install needed, `npx` fetches it):

```bash
npx supabase login                                  # opens a browser, once
npx supabase link --project-ref tdctzjjjxojgoavybmtn
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
    url := 'https://tdctzjjjxojgoavybmtn.supabase.co/functions/v1/import-shifts',
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

## Not wired yet

- Push / email notifications (prefs are stored; nothing sends yet).
