-- Only drop requests carry stars: the person dropping pays whoever covers.
-- Picking up a shift is free for everyone involved.
create or replace function post_swap_request(
  p_kind swap_kind,
  p_date date,
  p_shift_type text,
  p_shift_time text,
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
  v_group_id uuid := my_group_id();
  v_stars integer := case when p_kind = 'pickup' then 0 else coalesce(p_stars, 0) end;
  v_id uuid;
begin
  if v_uid is null then raise exception 'Not signed in'; end if;
  if v_group_id is null then raise exception 'Join a group first'; end if;
  if v_stars < 0 then raise exception 'Stars cannot be negative'; end if;
  if v_stars > star_balance(v_uid) then
    raise exception 'You only have % stars', star_balance(v_uid);
  end if;
  if p_shift_id is not null and not exists (
    select 1 from shifts where id = p_shift_id and user_id = v_uid
  ) then
    raise exception 'That shift is not yours';
  end if;

  insert into swap_requests (group_id, user_id, shift_id, kind, date, shift_type, shift_time, notes, stars)
  values (
    v_group_id, v_uid, p_shift_id, p_kind, p_date,
    coalesce(trim(p_shift_type), ''), coalesce(trim(p_shift_time), ''),
    coalesce(trim(p_notes), ''), v_stars
  )
  returning id into v_id;
  return v_id;
end;
$$;
