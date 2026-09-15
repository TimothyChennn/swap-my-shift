@AGENTS.md

# Shift Swap

Mobile app for a healthcare group to trade shifts using an internal "stars"
currency. Admins run a group, employees join it, and everyone sees a shared
calendar of shifts people want to pick up or drop.

## Stack

- **App:** Expo (React Native) with TypeScript and Expo Router. Ships to iOS and
  Android from one codebase.
- **Backend:** Supabase (Postgres, Auth, Row Level Security, Realtime, Edge
  Functions).
- **Auth:** Supabase Auth with Google sign-in only for v1. Phone number login is v2.
- **Notifications:** Expo push notifications plus email via Resend. SMS is v2.
- **Schedule import:** Each user pastes their Qgenda calendar subscription URL
  (ICS feed). A Supabase Edge Function fetches and parses it on a schedule.
  Direct Qgenda API sync is v2 and depends on the org granting credentials.
- **Styling:** NativeWind (Tailwind for React Native).

Keep the code simple. This is a small team app, not a platform. Prefer boring,
well-documented libraries.

## Roles

- **Admin:** creates a group, gets 10 stars on creation, approves join requests,
  grants stars manually, can transfer admin to another member. Admin-only UI
  lives in Settings and is hidden from employees.
- **Employee:** searches for a group by name, requests to join, sees the group
  calendar once approved.

A user can belong to several groups (memberships table, one role per
group). `profiles.current_group_id` is the group they're viewing; the calendar
header switches it. Stars, Qgenda links and notification prefs are all per
group and never cross groups.

## Screens

1. **Welcome.** "SHIFT SWAP" splash with the pitch, only for signed-out users;
   anyone with a session lands on the calendar. Log on / sign up = Google.
   First-time users then create a group or search for one to join.
2. **Calendar.** Header shows the current group (tap to switch). Green Add
   button opens the post popup. Calendar on top (peach), scrollable list below
   with notes and a red "Pick up" button that opens the Contact Poster page
   (drafts an email; the app never changes anyone's schedule). Days with a pickup request
   show a "+" badge, days with a drop request show a "−" badge. Tapping a day
   opens a sheet showing that day's shifts and any open requests, with a button to
   post a new request (pick up or drop) with a shift type, time, notes, and number
   of stars offered. Posted requests appear in the list below.
3. **Leaderboard.** Everyone in the group ranked by star balance.
4. **Your Stars.** Per group. Activity list plus copy about trading stars and
   buying more from the star seller in `lib/config.ts`. Admin grants stars from
   group settings.
5. **Settings.** Account (name, email, phone, preferred notification channel),
   list of groups → per-group popup (notifications, supervisor emails, Qgenda
   link + sync, admin tools when admin, leave group), sign out.

## Data model

- `profiles` (id, display_name, email, avatar_url, push_token, group_id, role:
  admin | employee, calendar_url)
- `groups` (id, name, admin_id, created_at)
- `join_requests` (id, group_id, user_id, status: pending | approved | denied,
  created_at)
- `shifts` (id, group_id, user_id, starts_at, ends_at, shift_type, source: import
  | manual, external_id)
- `swap_requests` (id, group_id, user_id, shift_id nullable, kind: pickup | drop,
  date, shift_type, notes, stars, status: open | accepted | cancelled,
  accepted_by nullable, created_at)
- `star_transactions` (id, group_id, from_user nullable, to_user, amount, reason,
  created_at). Balance is the sum of a user's transactions. Never store balance as
  a mutable column.
- `notification_prefs` (user_id, enabled, min_stars, notify_pickups,
  notify_drops, channel: push | email | both)

Use Row Level Security so users can only read rows where `group_id` matches their
own group. Admin-only writes (approving requests, granting stars, transferring
admin) and star transfers never happen as direct table writes: they go through
`security definer` Postgres functions called via RPC (see
`supabase/migrations/`), which check `auth.uid()` themselves and run in one
transaction. Edge Functions are reserved for work that needs the outside world
(sending notifications, fetching Qgenda feeds).

## Star rules

- New admin gets 10 stars when they create a group.
- Only drop requests carry stars. Accepting a drop moves the offered stars from
  the person dropping to the person covering, in one transaction. Pickup
  requests are free: giving someone your shift earns nothing.
- Stars are a number in the app. Do not show a dollar value anywhere in the UI.

## Notifications

When a swap request is posted, notify every group member whose prefs match
(enabled, stars >= min_stars, kind matches). When a request is accepted, notify
the requester. Send through push if a token exists, email otherwise (or both if
the user chose both).

## Out of scope for v1

Phone login, SMS, in-app purchases, Qgenda API sync, multi-group membership, chat.

## Conventions

- Commit after each working feature with a descriptive message.
- Ask before adding a new dependency.
- Keep Supabase migrations in `supabase/migrations/`.
- Put secrets in `.env` and never commit them.

## Current state

Auth, groups, join approval, swap requests (post / accept / cancel), star
grants and transfers, leaderboard and notification prefs all run against
Supabase. Setup steps are in `README.md`. Qgenda import runs in the
`import-shifts` Edge Function (`supabase/functions/`), called by the app
for the current user and optionally by pg_cron for everyone. Not built
yet: sending notifications (push/email).

Layout: `lib/supabase.ts` (client), `lib/auth.tsx` (session, profile,
memberships, current group, Google sign-in), `lib/types.ts` (row types, keep
in sync with the migration), `lib/config.ts` (product copy and constants),
`app/_layout.tsx` (auth gate via `Stack.Protected`), `app/onboarding.tsx`
(create / find group), `components/AddShiftModal.tsx` and `DayModal.tsx`
(posting and per-day actions), `components/GroupSettingsModal.tsx`.
