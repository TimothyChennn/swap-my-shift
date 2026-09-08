-- Leaving a group and withdrawing a pending join request.

-- Employees can leave any time. An admin has to hand off admin first,
-- unless they're the only member, in which case the group is deleted.
create or replace function leave_group()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_group_id uuid := my_group_id();
  v_others integer;
begin
  if v_uid is null then raise exception 'Not signed in'; end if;
  if v_group_id is null then raise exception 'You are not in a group'; end if;

  select count(*) into v_others
  from profiles where group_id = v_group_id and id <> v_uid;

  if is_group_admin(v_group_id) and v_others > 0 then
    raise exception 'Transfer admin to another member before leaving';
  end if;

  -- Close anything you left open so nobody accepts a ghost request.
  update swap_requests
  set status = 'cancelled'
  where user_id = v_uid and status = 'open';

  update profiles set group_id = null, role = null where id = v_uid;

  -- Last one out deletes the group; everything under it cascades.
  if v_others = 0 then
    delete from groups where id = v_group_id;
  end if;
end;
$$;

create or replace function withdraw_join_request()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from join_requests where user_id = auth.uid() and status = 'pending';
end;
$$;
