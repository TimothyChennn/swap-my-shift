-- Swap My Shift: initial schema, RLS, and the RPC functions the app calls.
-- Run this once in the Supabase SQL editor (or `supabase db push`).

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type user_role as enum ('admin', 'employee');
create type join_status as enum ('pending', 'approved', 'denied');
create type swap_kind as enum ('pickup', 'drop');
create type swap_status as enum ('open', 'accepted', 'cancelled');
create type shift_source as enum ('import', 'manual');
create type notify_channel as enum ('push', 'email', 'both');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  admin_id uuid not null,
  created_at timestamptz not null default now()
);
create unique index groups_name_unique on groups (lower(name));

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  email text,
  avatar_url text,
  push_token text,
  group_id uuid references groups (id),
  role user_role,
  calendar_url text,
  created_at timestamptz not null default now()
);
create index profiles_group_id on profiles (group_id);

alter table groups
  add constraint groups_admin_id_fkey foreign key (admin_id) references profiles (id);

create table join_requests (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  status join_status not null default 'pending',
  created_at timestamptz not null default now()
);
create index join_requests_group_status on join_requests (group_id, status);

create table shifts (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  shift_type text not null default '',
  source shift_source not null default 'manual',
  external_id text,
  unique (user_id, external_id)
);
create index shifts_group_starts on shifts (group_id, starts_at);

create table swap_requests (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  shift_id uuid references shifts (id) on delete set null,
  kind swap_kind not null,
  date date not null,
  shift_type text not null default '',
  shift_time text not null default '',
  notes text not null default '',
  stars integer not null default 0 check (stars >= 0),
  status swap_status not null default 'open',
  accepted_by uuid references profiles (id),
  created_at timestamptz not null default now()
);
create index swap_requests_group_date on swap_requests (group_id, date);

-- Balance is always sum(received) - sum(sent). Never a mutable column.
create table star_transactions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups (id) on delete cascade,
  from_user uuid references profiles (id),
  to_user uuid not null references profiles (id),
  amount integer not null check (amount > 0),
  reason text not null default '',
  created_at timestamptz not null default now()
);
create index star_transactions_to on star_transactions (to_user);
create index star_transactions_from on star_transactions (from_user);

create table notification_prefs (
  user_id uuid primary key references profiles (id) on delete cascade,
  enabled boolean not null default true,
  min_stars integer not null default 0,
  notify_pickups boolean not null default true,
  notify_drops boolean not null default true,
  channel notify_channel not null default 'push'
);

-- ---------------------------------------------------------------------------
-- New auth user -> profile + default prefs
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
    coalesce(
      new.raw_user_meta_data ->> 'avatar_url',
      new.raw_user_meta_data ->> 'picture'
    )
  );
  insert into notification_prefs (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function handle_new_user();

-- ---------------------------------------------------------------------------
-- Helpers used by policies and functions
-- ---------------------------------------------------------------------------
create or replace function my_group_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select group_id from profiles where id = auth.uid();
$$;

create or replace function is_group_admin(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from groups where id = p_group_id and admin_id = auth.uid()
  );
$$;

create or replace function star_balance(p_user_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce((select sum(amount) from star_transactions where to_user = p_user_id), 0)
    - coalesce((select sum(amount) from star_transactions where from_user = p_user_id), 0);
$$;

-- One row per group member with their current balance. security_invoker means
-- the caller's RLS applies, so you only ever see your own group.
create view star_balances
with (security_invoker = true)
as
select
  p.id as user_id,
  p.group_id,
  star_balance(p.id) as balance
from profiles p
where p.group_id is not null;

-- ---------------------------------------------------------------------------
-- Row Level Security. Reads are scoped to your group; writes that touch
-- money or membership go through the functions below.
-- ---------------------------------------------------------------------------
alter table groups enable row level security;
alter table profiles enable row level security;
alter table join_requests enable row level security;
alter table shifts enable row level security;
alter table swap_requests enable row level security;
alter table star_transactions enable row level security;
alter table notification_prefs enable row level security;

-- Anyone signed in can search groups by name to join one.
create policy "groups: read" on groups
  for select to authenticated using (true);

create policy "profiles: read self and group" on profiles
  for select to authenticated
  using (id = auth.uid() or group_id = my_group_id());

create policy "profiles: update self" on profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Only these columns are editable from the app; group_id and role change via functions.
revoke update on profiles from authenticated;
grant update (display_name, push_token, calendar_url) on profiles to authenticated;

create policy "join_requests: read own or as admin" on join_requests
  for select to authenticated
  using (user_id = auth.uid() or is_group_admin(group_id));

create policy "shifts: read group" on shifts
  for select to authenticated using (group_id = my_group_id());
create policy "shifts: write own" on shifts
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and group_id = my_group_id());

create policy "swap_requests: read group" on swap_requests
  for select to authenticated using (group_id = my_group_id());

create policy "star_transactions: read group" on star_transactions
  for select to authenticated using (group_id = my_group_id());

create policy "notification_prefs: own" on notification_prefs
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- RPC functions. All security definer: they check auth.uid() themselves and
-- run as one transaction, which is what star transfers need.
-- ---------------------------------------------------------------------------

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
  if (select group_id from profiles where id = v_uid) is not null then
    raise exception 'You already belong to a group';
  end if;
  if exists (select 1 from groups where lower(name) = lower(v_name)) then
    raise exception 'A group with that name already exists';
  end if;

  insert into groups (name, admin_id) values (v_name, v_uid) returning id into v_group_id;
  update profiles set group_id = v_group_id, role = 'admin' where id = v_uid;
  -- New admins start with 10 stars.
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
  if (select group_id from profiles where id = v_uid) is not null then
    raise exception 'You already belong to a group';
  end if;
  if not exists (select 1 from groups where id = p_group_id) then
    raise exception 'Group not found';
  end if;

  -- Re-requesting the same group just returns the pending request.
  select id into v_request_id from join_requests
  where user_id = v_uid and group_id = p_group_id and status = 'pending';
  if v_request_id is not null then return v_request_id; end if;

  -- Only one pending request at a time.
  delete from join_requests where user_id = v_uid and status = 'pending';

  insert into join_requests (group_id, user_id) values (p_group_id, v_uid)
  returning id into v_request_id;
  return v_request_id;
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
    if (select group_id from profiles where id = v_req.user_id) is not null then
      update join_requests set status = 'denied' where id = p_request_id;
      raise exception 'That person already joined another group';
    end if;
    update profiles set group_id = v_req.group_id, role = 'employee' where id = v_req.user_id;
    update join_requests set status = 'approved' where id = p_request_id;
  else
    update join_requests set status = 'denied' where id = p_request_id;
  end if;
end;
$$;

create or replace function grant_stars(p_to_user uuid, p_amount integer, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid := my_group_id();
begin
  if v_group_id is null or not is_group_admin(v_group_id) then
    raise exception 'Admins only';
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be positive'; end if;
  if (select group_id from profiles where id = p_to_user) is distinct from v_group_id then
    raise exception 'That person is not in your group';
  end if;

  insert into star_transactions (group_id, from_user, to_user, amount, reason)
  values (v_group_id, null, p_to_user, p_amount, coalesce(nullif(trim(p_reason), ''), 'Granted by admin'));
end;
$$;

create or replace function transfer_admin(p_to_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_group_id uuid := my_group_id();
begin
  if v_group_id is null or not is_group_admin(v_group_id) then
    raise exception 'Admins only';
  end if;
  if p_to_user = v_uid then raise exception 'You are already the admin'; end if;
  if (select group_id from profiles where id = p_to_user) is distinct from v_group_id then
    raise exception 'That person is not in your group';
  end if;

  update groups set admin_id = p_to_user where id = v_group_id;
  update profiles set role = 'employee' where id = v_uid;
  update profiles set role = 'admin' where id = p_to_user;
end;
$$;

create or replace function post_swap_request(
  p_kind swap_kind,
  p_date date,
  p_shift_type text,
  p_shift_time text,
  p_notes text,
  p_stars integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_group_id uuid := my_group_id();
  v_id uuid;
begin
  if v_uid is null then raise exception 'Not signed in'; end if;
  if v_group_id is null then raise exception 'Join a group first'; end if;
  if p_stars is null or p_stars < 0 then raise exception 'Stars cannot be negative'; end if;
  if p_stars > star_balance(v_uid) then
    raise exception 'You only have % stars', star_balance(v_uid);
  end if;

  insert into swap_requests (group_id, user_id, kind, date, shift_type, shift_time, notes, stars)
  values (
    v_group_id, v_uid, p_kind, p_date,
    coalesce(trim(p_shift_type), ''), coalesce(trim(p_shift_time), ''),
    coalesce(trim(p_notes), ''), p_stars
  )
  returning id into v_id;
  return v_id;
end;
$$;

-- Accepting moves the offered stars from the requester to the acceptor,
-- in the same transaction as the status change.
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
  if v_req.group_id is distinct from my_group_id() then raise exception 'Not your group'; end if;
  if v_req.status <> 'open' then raise exception 'This request is no longer open'; end if;
  if v_req.user_id = v_uid then raise exception 'You cannot accept your own request'; end if;
  if v_req.stars > star_balance(v_req.user_id) then
    raise exception 'The requester no longer has enough stars';
  end if;

  update swap_requests
  set status = 'accepted', accepted_by = v_uid
  where id = p_request_id;

  if v_req.stars > 0 then
    insert into star_transactions (group_id, from_user, to_user, amount, reason)
    values (
      v_req.group_id, v_req.user_id, v_uid, v_req.stars,
      case v_req.kind
        when 'drop' then 'Covered a ' || v_req.shift_type || ' shift on ' || to_char(v_req.date, 'Mon DD')
        else 'Gave up a ' || v_req.shift_type || ' shift on ' || to_char(v_req.date, 'Mon DD')
      end
    );
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
  update swap_requests
  set status = 'cancelled'
  where id = p_request_id and user_id = auth.uid() and status = 'open';
  if not found then raise exception 'Request not found or already closed'; end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Realtime: the app listens for changes on these to refresh without polling.
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table swap_requests;
alter publication supabase_realtime add table join_requests;
alter publication supabase_realtime add table profiles;
