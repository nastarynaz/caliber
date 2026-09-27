-- Run against an authorized, migrated LOCAL/DEV Supabase database only.
-- Uses synthetic fixtures and rolls back every change. No pgTAP required.
begin;
insert into auth.users(id) values('00000000-0000-4000-8000-000000000091');
insert into public.app_user values('00000000-0000-4000-8000-000000000091','Synthetic RLS reader','reader')
on conflict(auth_user_id) do update set display_name=excluded.display_name,role=excluded.role;
insert into public.equipment values
 ('DEMO-RLS-A','DEMO-RLS-A','Synthetic A','','','RLS-A'),
 ('DEMO-RLS-B','DEMO-RLS-B','Synthetic B','','','RLS-B');
insert into public.equipment_access values('00000000-0000-4000-8000-000000000091','DEMO-RLS-A');
insert into public.document values('DEMO-RLS-DOC');
insert into public.document_version(id,document_id,title,number,type,source,filename,mime,checksum)
values('DEMO-RLS-VER','DEMO-RLS-DOC','Synthetic multi-asset document','DEMO-RLS','TEST','Synthetic RLS test','test.pdf','application/pdf',repeat('0',64));
insert into public.document_equipment values('DEMO-RLS-VER','DEMO-RLS-A'),('DEMO-RLS-VER','DEMO-RLS-B');
insert into public.document_acl values('00000000-0000-4000-8000-000000000091','DEMO-RLS-DOC');

set local role authenticated;
set local request.jwt.claim.sub='00000000-0000-4000-8000-000000000091';
do $$ begin
  if (select count(*) from public.equipment)<>1 then raise exception 'Equipment scope leaked'; end if;
  if exists(select 1 from public.document_version) then raise exception 'Multi-asset document bypass'; end if;
  if (select jsonb_array_length(public.hub_snapshot()->'documents'))<>0 then raise exception 'Snapshot bypass'; end if;
  if has_table_privilege(current_user,'public.audit_event','UPDATE') then raise exception 'Audit is writable'; end if;
  if has_table_privilege(current_user,'public.app_user','UPDATE') then raise exception 'Self role elevation'; end if;
  if has_table_privilege(current_user,'public.document_version','INSERT') then raise exception 'Unreviewed direct writes enabled'; end if;
end $$;
reset role;
insert into public.equipment_access values('00000000-0000-4000-8000-000000000091','DEMO-RLS-B');
set local role authenticated;
do $$ begin
  if (select count(*) from public.document_version)<>1 then raise exception 'Explicit grants did not allow source'; end if;
end $$;
reset role;
update public.document_version set access='reviewers' where id='DEMO-RLS-VER';
set local role authenticated;
do $$ begin
  if exists(select 1 from public.document_version) then raise exception 'Restricted document leaked'; end if;
end $$;
reset role;
delete from public.document_acl where document_id='DEMO-RLS-DOC';
set local role authenticated;
do $$ begin
  if exists(select 1 from public.document_version) then raise exception 'Revoked document leaked'; end if;
  if has_function_privilege('anon','public.hub_snapshot()','EXECUTE') then raise exception 'Anonymous RPC is exposed'; end if;
end $$;
reset role;
rollback;
