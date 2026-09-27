-- Authenticated, transactional Knowledge Hub operations.
-- Apply after 202609240001_foundation.sql.
begin;

create table if not exists public.workspace_state (
  singleton boolean primary key default true check(singleton),
  revision bigint not null default 0 check(revision >= 0)
);
insert into public.workspace_state(singleton,revision) values(true,0) on conflict(singleton) do nothing;
revoke all on public.workspace_state from public,anon,authenticated;

-- Compatibility for a development database that applied the first migration
-- before assigned_to was corrected from UUID to a display-name assignment.
do $$ begin
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='investigation' and column_name='assigned_to' and data_type='uuid') then
    alter table public.investigation drop constraint if exists investigation_assigned_to_fkey;
    alter table public.investigation alter column assigned_to type text using assigned_to::text;
  end if;
end $$;

alter table public.audit_event add column if not exists issue_id text references public.quality_issue(id);
do $$ declare constraint_name text; begin
  select conname into constraint_name from pg_constraint
  where conrelid='public.audit_event'::regclass and contype='c' and pg_get_constraintdef(oid) like '%num_nonnulls%';
  if constraint_name is not null then execute format('alter table public.audit_event drop constraint %I',constraint_name); end if;
end $$;
alter table public.audit_event add constraint audit_event_one_target check(num_nonnulls(version_id,case_id,issue_id)=1);

create or replace function hub_private.current_role() returns text
language sql stable security definer set search_path='' as $$
  select role from public.app_user where auth_user_id=auth.uid();
$$;
create or replace function hub_private.actor_name() returns text
language sql stable security definer set search_path='' as $$
  select display_name from public.app_user where auth_user_id=auth.uid();
$$;
create or replace function hub_private.next_revision(expected bigint) returns bigint
language plpgsql security definer set search_path='' as $$
declare current_revision bigint;
begin
  if auth.uid() is null then raise exception 'Sign in to continue.'; end if;
  select revision into current_revision from public.workspace_state where singleton=true for update;
  if current_revision <> expected then raise exception 'This workspace changed. Refresh before trying again.'; end if;
  update public.workspace_state set revision=revision+1 where singleton=true returning revision into current_revision;
  return current_revision;
end $$;
create or replace function hub_private.current_revision() returns bigint
language sql stable security definer set search_path='' as $$
  select revision from public.workspace_state where singleton=true;
$$;
create or replace function hub_private.required_text(payload jsonb, field_name text, maximum integer default 12000) returns text
language plpgsql immutable set search_path='' as $$
declare result text := btrim(coalesce(payload->>field_name,''));
begin
  if result='' then raise exception '% is required.',field_name; end if;
  if length(result)>maximum then raise exception '% exceeds the character limit.',field_name; end if;
  return result;
end $$;
create or replace function hub_private.case_reporter_name(target text) returns text
language sql stable security definer set search_path='' as $$
  select u.display_name from public.investigation c join public.app_user u on u.auth_user_id=c.reporter_id
  where c.id=target and hub_private.can_case(c.id);
$$;
revoke all on all functions in schema hub_private from public,anon,authenticated;
grant execute on function hub_private.can_equipment(text) to authenticated;
grant execute on function hub_private.can_version(text) to authenticated;
grant execute on function hub_private.can_case(text) to authenticated;
grant execute on function hub_private.can_issue(text) to authenticated;
grant execute on function hub_private.current_revision() to authenticated;
grant execute on function hub_private.case_reporter_name(text) to authenticated;

drop policy if exists scoped_events on public.audit_event;
create policy scoped_events on public.audit_event for select to authenticated using(
  hub_private.can_version(version_id) or hub_private.can_case(case_id) or hub_private.can_issue(issue_id)
);

-- Preserve the RLS-scoped base snapshot and add concurrency/name projection.
do $$ begin
  if to_regprocedure('public.hub_snapshot_base()') is null then
    alter function public.hub_snapshot() rename to hub_snapshot_base;
  end if;
end $$;
create or replace function public.hub_snapshot() returns jsonb
language sql stable security invoker set search_path='' as $$
with source as (select public.hub_snapshot_base() as data), enriched as (
  select jsonb_set(
    jsonb_set(data,'{revision}',to_jsonb(hub_private.current_revision())),
    '{cases}',
    coalesce((select jsonb_agg(item || jsonb_build_object('reporter',coalesce(hub_private.case_reporter_name(item->>'id'),item->>'reporter')))
      from jsonb_array_elements(data->'cases') item),'[]'::jsonb)
  ) as data from source
)
select data from enriched;
$$;
revoke all on function public.hub_snapshot() from public,anon;
grant execute on function public.hub_snapshot() to authenticated;
grant execute on function public.hub_snapshot_base() to authenticated;

create or replace function public.hub_create_upload(
  p_version_id text, p_document_id text, p_existing_document boolean,
  p_filename text, p_mime text, p_checksum text, p_storage_path text,
  p_equipment_id text, p_expected_revision bigint
) returns bigint
language plpgsql security definer set search_path='' as $$
declare new_revision bigint; prior public.document_version%rowtype; actor text;
begin
  if hub_private.current_role() <> 'controller' then raise exception 'Controller role is required for upload.'; end if;
  if not hub_private.can_equipment(p_equipment_id) then raise exception 'Equipment access unavailable.'; end if;
  if p_mime not in ('application/pdf','image/png') or length(p_checksum)<>64 then raise exception 'Invalid upload metadata.'; end if;
  if p_version_id !~ '^VER-[a-f0-9-]{36}$' or (not p_existing_document and p_document_id !~ '^DOC-[a-f0-9-]{36}$') then raise exception 'Invalid immutable identifier.'; end if;
  if p_storage_path <> 'sources/'||p_document_id||'/'||p_version_id||case when p_mime='application/pdf' then '.pdf' else '.png' end then raise exception 'Invalid private Storage path.'; end if;
  new_revision := hub_private.next_revision(p_expected_revision); actor := hub_private.actor_name();
  if p_existing_document then
    if not exists(select 1 from public.document_acl where user_id=auth.uid() and document_id=p_document_id) then raise exception 'Document access unavailable.'; end if;
    select v.* into prior from public.document_version v where v.document_id=p_document_id order by v.id desc limit 1;
    if prior.id is null then raise exception 'Existing document is unavailable.'; end if;
  else
    if exists(select 1 from public.document where id=p_document_id) then raise exception 'Document identifier already exists.'; end if;
    insert into public.document(id) values(p_document_id);
  end if;
  insert into public.document_version(id,document_id,title,number,type,revision,source,filename,mime,checksum,storage_path,processing,metadata,review,publication,indexing,applicability,access,owner,purpose,extracted_text)
  values(p_version_id,p_document_id,coalesce(prior.title,p_filename),coalesce(prior.number,''),coalesce(prior.type,'REFERENCE'),null,'Manual connected upload',p_filename,p_mime,p_checksum,p_storage_path,'queued','incomplete','not_submitted','unpublished','not_started','candidate',coalesce(prior.access,'team'),'','','');
  insert into public.document_equipment(version_id,equipment_id) values(p_version_id,p_equipment_id);
  insert into public.document_acl(user_id,document_id)
    select user_id,p_document_id from public.equipment_access where equipment_id=p_equipment_id on conflict do nothing;
  insert into public.document_acl(user_id,document_id) values(auth.uid(),p_document_id) on conflict do nothing;
  insert into public.audit_event(actor_id,actor_name,action,comment,version_id)
    values(auth.uid(),actor,'document.upload','File stored in private Supabase Storage. Processing and technical review are still required.',p_version_id);
  return new_revision;
end $$;
revoke all on function public.hub_create_upload(text,text,boolean,text,text,text,text,text,bigint) from public,anon;
grant execute on function public.hub_create_upload(text,text,boolean,text,text,text,text,text,bigint) to authenticated;

create or replace function public.hub_command(p_action text, p_id text, p_data jsonb, p_expected_revision bigint) returns bigint
language plpgsql security definer set search_path='' as $$
declare
  role_name text := hub_private.current_role(); actor text := hub_private.actor_name(); new_revision bigint;
  doc public.document_version%rowtype; item public.investigation%rowtype; issue public.quality_issue%rowtype;
  comment_text text := btrim(coalesce(p_data->>'comment','')); generated_id text; cause_status_value text;
  observed timestamptz; downtime_start_value timestamptz; downtime_end_value timestamptz;
begin
  if role_name is null then raise exception 'No workspace role is assigned.'; end if;
  if p_data is null then p_data := '{}'::jsonb; end if;
  new_revision := hub_private.next_revision(p_expected_revision);

  if p_action like 'document.%' then
    if not hub_private.can_version(p_id) then raise exception 'Document access unavailable.'; end if;
    select * into doc from public.document_version where id=p_id for update;
    if p_action in ('document.approve','document.return') then
      if role_name<>'reviewer' then raise exception 'Reviewer role is required.'; end if;
    elsif role_name<>'controller' then raise exception 'Controller role is required.';
    end if;
    if p_action='document.metadata' then
      if doc.review='approved' then raise exception 'Create a new revision to change approved content.'; end if;
      if coalesce(p_data->>'access',doc.access) not in ('team','reviewers') then raise exception 'Unknown access classification.'; end if;
      update public.document_version set title=hub_private.required_text(p_data,'title'),number=hub_private.required_text(p_data,'number'),owner=hub_private.required_text(p_data,'owner'),purpose=hub_private.required_text(p_data,'purpose'),revision=nullif(btrim(coalesce(p_data->>'revision','')),''),access=coalesce(p_data->>'access',access),metadata='confirmed',review='not_submitted' where id=p_id;
      if p_data ? 'equipmentIds' then
        if jsonb_typeof(p_data->'equipmentIds')<>'array' or jsonb_array_length(p_data->'equipmentIds')=0 then raise exception 'Select valid equipment links.'; end if;
        if exists(select 1 from jsonb_array_elements_text(p_data->'equipmentIds') as links(value) where not hub_private.can_equipment(links.value)) then raise exception 'Equipment access unavailable.'; end if;
        delete from public.document_equipment where version_id=p_id;
        insert into public.document_equipment(version_id,equipment_id) select p_id,links.value from jsonb_array_elements_text(p_data->'equipmentIds') as links(value) on conflict do nothing;
      end if;
    elsif p_action='document.submit' then
      if doc.metadata<>'confirmed' or doc.processing<>'succeeded' or doc.review not in ('not_submitted','changes_requested') then raise exception 'Confirm metadata and complete processing before submission.'; end if;
      update public.document_version set review='pending' where id=p_id;
    elsif p_action in ('document.approve','document.return') then
      if doc.review<>'pending' then raise exception 'Only pending submissions can be reviewed.'; end if;
      if comment_text='' then raise exception 'comment is required.'; end if;
      update public.document_version set review=case when p_action='document.approve' then 'approved' else 'changes_requested' end where id=p_id;
    elsif p_action='document.publish' then
      if doc.review<>'approved' or doc.publication<>'unpublished' then raise exception 'An approved, unpublished revision is required.'; end if;
      update public.document_version set publication='published',indexing='queued' where id=p_id;
    elsif p_action in ('document.index','document.fail_index') then
      if doc.review<>'approved' or doc.publication<>'published' or doc.indexing='ready' then raise exception 'An approved published version awaiting indexing is required.'; end if;
      if p_action='document.fail_index' then update public.document_version set indexing='failed' where id=p_id; comment_text := 'Explicit failure scenario; approved content retained.';
      else
        if btrim(doc.extracted_text)='' then raise exception 'No extracted text is available for retrieval.'; end if;
        update public.document_version set applicability='superseded' where document_id=doc.document_id and id<>p_id and applicability='current';
        update public.document_version set indexing='ready',applicability='current' where id=p_id;
        comment_text := 'Governed text retrieval activated. Gemini receives this revision only after ACL filtering.';
      end if;
    elsif p_action='document.withdraw' then
      if comment_text='' then raise exception 'comment is required.'; end if;
      update public.document_version set publication='withdrawn',applicability='candidate' where id=p_id;
    elsif p_action='document.process' then
      if doc.processing='succeeded' or doc.review='approved' then raise exception 'This revision cannot be reprocessed.'; end if;
      update public.document_version set extracted_text=hub_private.required_text(p_data,'text'),processing='succeeded' where id=p_id;
      comment_text := 'Manual transcription recorded; technical review is still required. '||hub_private.required_text(p_data,'comment');
    elsif p_action='document.fail_process' then
      if doc.processing='succeeded' then raise exception 'Processed content cannot be reset.'; end if;
      if comment_text='' then raise exception 'comment is required.'; end if;
      update public.document_version set processing='failed' where id=p_id;
    else raise exception 'Unknown document action.';
    end if;
    insert into public.audit_event(actor_id,actor_name,action,comment,version_id) values(auth.uid(),actor,p_action,comment_text,p_id);

  elsif p_action='case.create' then
    if role_name not in ('engineer','reviewer') then raise exception 'Contributor role is required.'; end if;
    if not hub_private.can_equipment(p_data->>'equipmentId') then raise exception 'Equipment access unavailable.'; end if;
    begin observed := (p_data->>'observedAt')::timestamptz; exception when others then raise exception 'Enter a valid observation time.'; end;
    if observed>now()+interval '5 minutes' then raise exception 'Observation time cannot be in the future.'; end if;
    generated_id := 'CASE-'||gen_random_uuid()::text;
    insert into public.investigation(id,equipment_id,title,symptom,type,observed_at,reporter_id,status)
      values(generated_id,p_data->>'equipmentId',hub_private.required_text(p_data,'title'),hub_private.required_text(p_data,'symptom'),coalesce(nullif(btrim(p_data->>'type'),''),'Observation'),observed,auth.uid(),'submitted');
    insert into public.audit_event(actor_id,actor_name,action,comment,case_id) values(auth.uid(),actor,p_action,comment_text,generated_id);

  elsif p_action like 'case.%' then
    if not hub_private.can_case(p_id) then raise exception 'Case access unavailable.'; end if;
    select * into item from public.investigation where id=p_id for update;
    if p_action in ('case.triage','case.clarify','case.assign','case.verify','case.return','case.refresh','case.fail_refresh') then
      if role_name<>'reviewer' then raise exception 'Reviewer role is required.'; end if;
    elsif role_name not in ('engineer','reviewer') then raise exception 'Contributor role is required.';
    end if;
    if p_action='case.triage' then
      if item.status<>'submitted' then raise exception 'Only submitted reports need triage.'; end if; update public.investigation set status='triage' where id=p_id;
    elsif p_action='case.clarify' then
      if item.status<>'triage' or comment_text='' then raise exception 'Assess the report and provide a clarification request.'; end if; update public.investigation set status='awaiting_clarification' where id=p_id;
    elsif p_action='case.respond' then
      if item.status<>'awaiting_clarification' or comment_text='' then raise exception 'No clarification is pending or the response is empty.'; end if; update public.investigation set status='triage' where id=p_id;
    elsif p_action='case.assign' then
      if item.status<>'triage' then raise exception 'Complete triage before assignment.'; end if; update public.investigation set assigned_to=hub_private.required_text(p_data,'assignedTo',300),status='investigating' where id=p_id;
    elsif p_action='case.update' then
      if item.status<>'investigating' or comment_text='' then raise exception 'This case is not under investigation or findings are empty.'; end if;
    elsif p_action='case.reinvestigate' then
      if item.status<>'closure_changes_requested' or comment_text='' then raise exception 'A returned closure and comment are required.'; end if; update public.investigation set status='investigating' where id=p_id;
    elsif p_action='case.resolve' then
      if item.status not in ('investigating','closure_changes_requested') then raise exception 'This case cannot be submitted for closure.'; end if;
      cause_status_value := case when p_data->>'causeStatus'='established' then 'established' else 'not_established' end;
      begin downtime_start_value := nullif(p_data->>'downtimeStart','')::timestamptz; downtime_end_value := nullif(p_data->>'downtimeEnd','')::timestamptz; exception when others then raise exception 'Enter valid downtime timestamps.'; end;
      if downtime_end_value is not null and (downtime_start_value is null or downtime_end_value<downtime_start_value) then raise exception 'Downtime end must follow its start.'; end if;
      update public.investigation set cause_status=cause_status_value,cause=case when cause_status_value='established' then hub_private.required_text(p_data,'cause') else null end,action=hub_private.required_text(p_data,'action'),outcome=hub_private.required_text(p_data,'outcome'),evidence=hub_private.required_text(p_data,'evidence'),lesson=btrim(coalesce(p_data->>'lesson','')),downtime_start=downtime_start_value,downtime_end=downtime_end_value,closure_revision=closure_revision+1,status='resolved_pending_review' where id=p_id returning * into item;
      insert into public.closure_submission(case_id,revision,cause,action,outcome,evidence) values(p_id,item.closure_revision,item.cause,item.action,item.outcome,item.evidence);
    elsif p_action in ('case.verify','case.return') then
      if item.status<>'resolved_pending_review' or comment_text='' then raise exception 'A pending closure and review comment are required.'; end if;
      update public.investigation set status=case when p_action='case.verify' then 'verified_closed' else 'closure_changes_requested' end,knowledge=case when p_action='case.verify' then 'pending' else knowledge end where id=p_id;
    elsif p_action in ('case.refresh','case.fail_refresh') then
      if item.status<>'verified_closed' or item.knowledge='ready' then raise exception 'Only a verified case awaiting refresh can be processed.'; end if;
      update public.investigation set knowledge=case when p_action='case.refresh' then 'ready' else 'failed' end where id=p_id;
      comment_text := case when p_action='case.refresh' then 'Verified closure enabled for governed retrieval.' else 'Knowledge refresh failed; verified closure retained.' end;
    else raise exception 'Unknown case action.';
    end if;
    insert into public.audit_event(actor_id,actor_name,action,comment,case_id) values(auth.uid(),actor,p_action,comment_text,p_id);

  elsif p_action='issue.create' then
    if role_name='reader' then raise exception 'Contributor role is required.'; end if;
    if jsonb_typeof(p_data->'sourceIds')<>'array' or jsonb_array_length(p_data->'sourceIds')=0 then raise exception 'At least one source is required.'; end if;
    if exists(select 1 from jsonb_array_elements_text(p_data->'sourceIds') as sources(value) where not hub_private.can_version(sources.value)) then raise exception 'Source access unavailable.'; end if;
    if comment_text='' then raise exception 'comment is required.'; end if;
    generated_id := 'ISS-'||gen_random_uuid()::text;
    if exists(select 1 from public.quality_issue where title=hub_private.required_text(p_data,'title') and status='open') then raise exception 'An open issue with this title already exists.'; end if;
    insert into public.quality_issue(id,title,status,comment) values(generated_id,hub_private.required_text(p_data,'title'),'open',comment_text);
    insert into public.quality_issue_source(issue_id,version_id) select generated_id,sources.value from jsonb_array_elements_text(p_data->'sourceIds') as sources(value);
    insert into public.audit_event(actor_id,actor_name,action,comment,issue_id) values(auth.uid(),actor,p_action,comment_text,generated_id);
  elsif p_action='issue.resolve' then
    if role_name<>'reviewer' then raise exception 'Reviewer role is required.'; end if;
    if not hub_private.can_issue(p_id) then raise exception 'Issue access unavailable.'; end if;
    select * into issue from public.quality_issue where id=p_id for update;
    if issue.status<>'open' or comment_text='' then raise exception 'An open issue and resolution comment are required.'; end if;
    update public.quality_issue set status='resolved',comment=comment_text where id=p_id;
    insert into public.audit_event(actor_id,actor_name,action,comment,issue_id) values(auth.uid(),actor,p_action,comment_text,p_id);
  else raise exception 'Unknown action.';
  end if;
  return new_revision;
end $$;
revoke all on function public.hub_command(text,text,jsonb,bigint) from public,anon;
grant execute on function public.hub_command(text,text,jsonb,bigint) to authenticated;

-- New Auth accounts get a deny-by-default reader profile. An administrator must
-- explicitly grant equipment/document rows and elevate responsibility if needed.
create or replace function hub_private.handle_new_user() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into public.app_user(auth_user_id,display_name,role)
  values(new.id,coalesce(nullif(new.raw_user_meta_data->>'display_name',''),split_part(coalesce(new.email,'user'),'@',1)),'reader')
  on conflict(auth_user_id) do nothing;
  return new;
end $$;
revoke all on function hub_private.handle_new_user() from public,anon,authenticated;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function hub_private.handle_new_user();

commit;
