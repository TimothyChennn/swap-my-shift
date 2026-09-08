-- Users who signed in before the profile trigger existed have no profile row.
-- Safe to re-run: skips anyone who already has one.
insert into profiles (id, display_name, email, avatar_url)
select
  u.id,
  coalesce(
    u.raw_user_meta_data ->> 'full_name',
    u.raw_user_meta_data ->> 'name',
    split_part(coalesce(u.email, ''), '@', 1)
  ),
  u.email,
  coalesce(u.raw_user_meta_data ->> 'avatar_url', u.raw_user_meta_data ->> 'picture')
from auth.users u
on conflict (id) do nothing;

insert into notification_prefs (user_id)
select id from profiles
on conflict (user_id) do nothing;
