-- Users can belong to several groups. Membership and role move from
-- profiles to a memberships table; profiles.current_group_id remembers the
-- group they're looking at. Qgenda links and notification prefs are per
-- membership. Existing data is carried across.
--
-- Runs as one transaction: if any statement fails, nothing is applied.

begin;

-- ---------------------------------------------------------------------------
-- Memberships
-- ---------------------------------------------------------------------------
create table memberships (
  group_id uuid not null references groups (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  role user_role not null default 'employee',
  calendar_url text,
  calendar_synced_at timestamptz,
  calendar_error text,
  created_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index memberships_user on memberships (user_id);

insert into memberships (group_id, user_id, role, calendar_url, calendar_synced_at, calendar_error)
select group_id, id, coalesce(role, 'employee'), calendar_url, calendar_synced_at, calendar_error
from profiles
where group_id is not null;

-- ---------------------------------------------------------------------------
-- Retire everything that depended on profiles.group_id / role
-- ---------------------------------------------------------------------------
drop policy if exists "profiles: read self and group" on profiles;
drop policy if exists "join_requests: read own or as admin" on join_requests;
drop policy if exists "shifts: read group" on shifts;
drop policy if exists "shifts: write own" on shifts;
drop policy if exists "swap_requests: read group" on swap_requests;
drop policy if exists "star_transactions: read group" on star_transactions;
drop policy if exists "notification_prefs: own" on notification_prefs;
drop view if exists star_balances;
drop function if exists create_group(text);
drop function if exists request_join(uuid);
drop function if exists review_join_request(uuid, boolean);
drop function if exists grant_stars(uuid, integer, text);
drop function if exists transfer_admin(uuid);
drop function if exists post_swap_request(swap_kind, date, text, text, text, integer, uuid);
drop function if exists accept_swap_request(uuid);
drop function if exists cancel_swap_request(uuid);
drop function if exists leave_group();
drop function if exists withdraw_join_request();
drop function if exists star_balance(uuid);
drop function if exists my_group_id();

alter table profiles rename column group_id to current_group_id;
alter table profiles
  drop column role,
  drop column calendar_url,
  drop column calendar_synced_at,
  drop column calendar_error,
  add column phone text,
  add column notify_channel notify_channel not null default 'push';

-- Notification prefs are now per group.
drop table notification_prefs;
create table notification_prefs (
  user_id uuid not null references profiles (id) on delete cascade,
  group_id uuid not null references groups (id) on delete cascade,
  enabled boolean not null default true,
  notify_offers boolean not null default true,
  min_stars integer not null default 0,
  supervisor_emails_enabled boolean not null default false,
  supervisor_emails text not null default '',
  primary key (user_id, group_id)
);
insert into notification_prefs (user_id, group_id)
select user_id, group_id from memberships;

-- The same Qgenda event may be imported into more than one group.
alter table shifts drop constraint shifts_user_id_external_id_key;
alter table shifts add constraint shifts_group_user_external_key
  unique (group_id, user_id, external_id);

-- ---------------------------------------------------------------------------
-- Triggers and helpers
-- ---------------------------------------------------------------------------
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into profiles (id, display_name, email, avatar_url)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(coalesce(new.email, ''), '@', 1)
    ),
    new.email,
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture')
  );
  return new;
end;
$$;

create or replace function handle_new_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into notification_prefs (user_id, group_id)
  values (new.user_id, new.group_id)
  on conflict do nothing;
  return new;
end;
$$;

create trigger on_membership_created
after insert on memberships
for each row execute function handle_new_membership();

create or replace function is_member(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from memberships where group_id = p_group_id and user_id = auth.uid()
  );
$$;

create or replace function shares_group_with(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_user_id = auth.uid() or exists (
    select 1
    from memberships a
    join memberships b on a.group_id = b.group_id
    where a.user_id = auth.uid() and b.user_id = p_user_id
  );
$$;

create or replace function star_balance(p_user_id uuid, p_group_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce((select sum(amount) from star_transactions
              where to_user = p_user_id and group_id = p_group_id), 0)
    - coalesce((select sum(amount) from star_transactions
                where from_user = p_user_id and group_id = p_group_id), 0);
$$;

create view star_balances
with (security_invoker = true)
as
select m.user_id, m.group_id, star_balance(m.user_id, m.group_id) as balance
from memberships m;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table memberships enable row level security;
alter table notification_prefs enable row level security;

create policy "memberships: read own groups" on memberships
  for select to authenticated
  using (user_id = auth.uid() or is_member(group_id));

create policy "profiles: read self and groupmates" on profiles
  for select to authenticated using (shares_group_with(id));

revoke update on profiles from authenticated;
grant update (display_name, push_token, phone, notify_channel) on profiles to authenticated;

create policy "join_requests: read own or as admin" on join_requests
  for select to authenticated
  using (user_id = auth.uid() or is_group_admin(group_id));

create policy "shifts: read group" on shifts
  for select to authenticated using (is_member(group_id));
create policy "shifts: write own" on shifts
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and is_member(group_id));

create policy "swap_requests: read group" on swap_requests
  for select to authenticated using (is_member(group_id));

create policy "star_transactions: read group" on star_transactions
  for select to authenticated using (is_member(group_id));

create policy "notification_prefs: own" on notification_prefs
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and is_member(group_id));

-- ---------------------------------------------------------------------------
-- RPC functions
-- ---------------------------------------------------------------------------
create or replace function set_current_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_member(p_group_id) then raise exception 'You are not in that group'; end if;
  update profiles set current_group_id = p_group_id where id = auth.uid();
end;
$$;

create or replace function create_group(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := trim(p_name);
  v_group_id uuid;
begin
  if v_uid is null then raise exception 'Not signed in'; end if;
  if v_name = '' then raise exception 'Group name is required'; end if;
  if exists (select 1 from groups where lower(name) = lower(v_name)) then
    raise exception 'A group with that name already exists';
  end if;

  insert into groups (name, admin_id) values (v_name, v_uid) returning id into v_group_id;
  insert into memberships (group_id, user_id, role) values (v_group_id, v_uid, 'admin');
  update profiles set current_group_id = v_group_id where id = v_uid;
  insert into star_transactions (group_id, to_user, amount, reason)
  values (v_group_id, v_uid, 10, 'Created the group');
  return v_group_id;
end;
$$;

create or replace function request_join(p_group_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_request_id uuid;
begin
  if v_uid is null then raise exception 'Not signed in'; end if;
  if not exists (select 1 from groups where id = p_group_id) then
    raise exception 'Group not found';
  end if;
  if is_member(p_group_id) then raise exception 'You are already in that group'; end if;

  select id into v_request_id from join_requests
  where user_id = v_uid and group_id = p_group_id and status = 'pending';
  if v_request_id is not null then return v_request_id; end if;

  insert into join_requests (group_id, user_id) values (p_group_id, v_uid)
  returning id into v_request_id;
  return v_request_id;
end;
$$;

create or replace function withdraw_join_request(p_group_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from join_requests
  where user_id = auth.uid() and status = 'pending'
    and (p_group_id is null or group_id = p_group_id);
end;
$$;

create or replace function review_join_request(p_request_id uuid, p_approve boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req join_requests%rowtype;
begin
  select * into v_req from join_requests where id = p_request_id for update;
  if not found then raise exception 'Request not found'; end if;
  if not is_group_admin(v_req.group_id) then raise exception 'Admins only'; end if;
  if v_req.status <> 'pending' then raise exception 'Request already reviewed'; end if;

  if p_approve then
    insert into memberships (group_id, user_id, role)
    values (v_req.group_id, v_req.user_id, 'employee')
    on conflict do nothing;
    update profiles set current_group_id = v_req.group_id
    where id = v_req.user_id and current_group_id is null;
    update join_requests set status = 'approved' where id = p_request_id;
  else
    update join_requests set status = 'denied' where id = p_request_id;
  end if;
end;
$$;

create or replace function grant_stars(p_group_id uuid, p_to_user uuid, p_amount integer, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_group_admin(p_group_id) then raise exception 'Admins only'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be positive'; end if;
  if not exists (select 1 from memberships where group_id = p_group_id and user_id = p_to_user) then
    raise exception 'That person is not in this group';
  end if;

  insert into star_transactions (group_id, from_user, to_user, amount, reason)
  values (p_group_id, null, p_to_user, p_amount,
          coalesce(nullif(trim(p_reason), ''), 'Granted by admin'));
end;
$$;

create or replace function transfer_admin(p_group_id uuid, p_to_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if not is_group_admin(p_group_id) then raise exception 'Admins only'; end if;
  if p_to_user = v_uid then raise exception 'You are already the admin'; end if;
  if not exists (select 1 from memberships where group_id = p_group_id and user_id = p_to_user) then
    raise exception 'That person is not in this group';
  end if;

  update groups set admin_id = p_to_user where id = p_group_id;
  update memberships set role = 'employee' where group_id = p_group_id and user_id = v_uid;
  update memberships set role = 'admin' where group_id = p_group_id and user_id = p_to_user;
end;
$$;

-- Only drops carry stars; pickups are free.
create or replace function post_swap_request(
  p_group_id uuid,
  p_kind swap_kind,
  p_date date,
  p_shift_type text,
  p_notes text,
  p_stars integer,
  p_shift_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_stars integer := case when p_kind = 'pickup' then 0 else coalesce(p_stars, 0) end;
  v_id uuid;
begin
  if v_uid is null then raise exception 'Not signed in'; end if;
  if not is_member(p_group_id) then raise exception 'You are not in that group'; end if;
  if v_stars < 0 then raise exception 'Stars cannot be negative'; end if;
  if v_stars > star_balance(v_uid, p_group_id) then
    raise exception 'You only have % stars in this group', star_balance(v_uid, p_group_id);
  end if;
  if p_shift_id is not null and not exists (
    select 1 from shifts where id = p_shift_id and user_id = v_uid and group_id = p_group_id
  ) then
    raise exception 'That shift is not yours';
  end if;

  insert into swap_requests (group_id, user_id, shift_id, kind, date, shift_type, notes, stars)
  values (p_group_id, v_uid, p_shift_id, p_kind, p_date,
          coalesce(trim(p_shift_type), ''), left(coalesce(trim(p_notes), ''), 30), v_stars)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function accept_swap_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_req swap_requests%rowtype;
begin
  if v_uid is null then raise exception 'Not signed in'; end if;
  select * into v_req from swap_requests where id = p_request_id for update;
  if not found then raise exception 'Request not found'; end if;
  if not is_member(v_req.group_id) then raise exception 'Not your group'; end if;
  if v_req.status <> 'open' then raise exception 'This request is no longer open'; end if;
  if v_req.user_id = v_uid then raise exception 'You cannot accept your own request'; end if;
  if v_req.stars > star_balance(v_req.user_id, v_req.group_id) then
    raise exception 'The poster no longer has enough stars';
  end if;

  update swap_requests set status = 'accepted', accepted_by = v_uid where id = p_request_id;

  if v_req.stars > 0 then
    insert into star_transactions (group_id, from_user, to_user, amount, reason)
    values (v_req.group_id, v_req.user_id, v_uid, v_req.stars,
            'Covered a ' || v_req.shift_type || ' shift on ' || to_char(v_req.date, 'Mon DD'));
  end if;
end;
$$;

create or replace function cancel_swap_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update swap_requests set status = 'cancelled'
  where id = p_request_id and user_id = auth.uid() and status = 'open';
  if not found then raise exception 'Request not found or already closed'; end if;
end;
$$;

create or replace function leave_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_others integer;
begin
  if v_uid is null then raise exception 'Not signed in'; end if;
  if not is_member(p_group_id) then raise exception 'You are not in that group'; end if;

  select count(*) into v_others from memberships
  where group_id = p_group_id and user_id <> v_uid;

  if is_group_admin(p_group_id) and v_others > 0 then
    raise exception 'Transfer admin to another member before leaving';
  end if;

  update swap_requests set status = 'cancelled'
  where user_id = v_uid and group_id = p_group_id and status = 'open';
  delete from shifts where user_id = v_uid and group_id = p_group_id;
  delete from notification_prefs where user_id = v_uid and group_id = p_group_id;
  delete from memberships where user_id = v_uid and group_id = p_group_id;

  update profiles
  set current_group_id = (select group_id from memberships where user_id = v_uid
                          order by created_at limit 1)
  where id = v_uid and current_group_id = p_group_id;

  if v_others = 0 then
    delete from groups where id = p_group_id;
  end if;
end;
$$;

create or replace function save_calendar_url(p_group_id uuid, p_url text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_member(p_group_id) then raise exception 'You are not in that group'; end if;
  update memberships
  set calendar_url = nullif(trim(p_url), ''), calendar_error = null
  where group_id = p_group_id and user_id = auth.uid();
end;
$$;

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table memberships;

commit;
