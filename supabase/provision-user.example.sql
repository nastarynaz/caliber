-- Run manually in the Supabase SQL editor after the user has signed up.
-- Replace both placeholders. Review the resulting scope before commit.
begin;

do $$
declare
  target_email text := 'engineer@example.com'; -- replace
  target_role text := 'engineer';               -- reader | engineer | controller | reviewer
  target_user uuid;
begin
  if target_email = 'engineer@example.com' then
    raise exception 'Replace target_email before running this script.';
  end if;
  if target_role not in ('reader','engineer','controller','reviewer') then
    raise exception 'Unknown workspace role.';
  end if;

  select id into target_user from auth.users where lower(email)=lower(target_email);
  if target_user is null then raise exception 'Auth user not found for %',target_email; end if;

  insert into public.app_user(auth_user_id,display_name,role)
  values(target_user,split_part(target_email,'@',1),target_role)
  on conflict(auth_user_id) do update set role=excluded.role;

  -- Example pilot grant: Set 01 / GA-1201A only. Add rows deliberately for
  -- other assets; never grant a whole workspace implicitly.
  insert into public.equipment_access(user_id,equipment_id)
  values(target_user,'EQP-000001') on conflict do nothing;

  -- A document becomes visible only when the user has its ACL and every
  -- linked equipment grant. This grants documents linked exclusively to
  -- equipment already in the user's equipment scope.
  insert into public.document_acl(user_id,document_id)
  select distinct target_user,v.document_id
  from public.document_version v
  where exists (
    select 1 from public.document_equipment de
    where de.version_id=v.id
  ) and not exists (
    select 1 from public.document_equipment de
    where de.version_id=v.id
      and not exists (
        select 1 from public.equipment_access ea
        where ea.user_id=target_user and ea.equipment_id=de.equipment_id
      )
  )
  on conflict do nothing;
end $$;

commit;
