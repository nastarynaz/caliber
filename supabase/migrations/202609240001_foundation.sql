-- Read-only connected pilot foundation. No authenticated write grants.
-- Apply only to an explicitly selected Supabase development project.
begin;
create schema if not exists hub_private;
revoke all on schema hub_private from public;
grant usage on schema hub_private to authenticated;
create extension if not exists vector with schema extensions;

create table public.app_user (
  auth_user_id uuid primary key references auth.users(id),
  display_name text not null,
  role text not null check (role in ('engineer','controller','reviewer','reader'))
);
create table public.equipment (
  id text primary key, tag text not null unique, name text not null,
  location text not null default '', area text not null default '', set_number text not null unique
);
create table public.equipment_access (
  user_id uuid references public.app_user(auth_user_id), equipment_id text references public.equipment(id),
  primary key (user_id, equipment_id)
);
create table public.role_membership (
  user_id uuid references public.app_user(auth_user_id), equipment_id text references public.equipment(id),
  role text check (role in ('engineer','controller','reviewer','reader')),
  primary key(user_id, equipment_id, role)
);
create table public.document (id text primary key);
create table public.document_acl (
  user_id uuid references public.app_user(auth_user_id), document_id text references public.document(id),
  primary key(user_id, document_id)
);
create table public.document_version (
  id text primary key, document_id text not null references public.document(id),
  title text not null, number text not null, type text not null, revision text,
  source text not null, filename text not null, mime text not null check(mime in ('application/pdf','image/png')),
  checksum text not null check(length(checksum)=64),
  storage_path text unique, preview_path text unique,
  processing text not null default 'queued' check(processing in ('queued','succeeded','failed')),
  metadata text not null default 'incomplete' check(metadata in ('incomplete','confirmed')),
  review text not null default 'not_submitted' check(review in ('not_submitted','pending','changes_requested','approved')),
  publication text not null default 'unpublished' check(publication in ('unpublished','published','withdrawn')),
  indexing text not null default 'not_started' check(indexing in ('not_started','queued','ready','failed')),
  applicability text not null default 'candidate' check(applicability in ('candidate','current','superseded')),
  access text not null default 'team' check(access in ('team','reviewers')),
  owner text not null default '', purpose text not null default '', extracted_text text not null default '',
  unique(document_id,checksum),
  check(applicability <> 'current' or (review='approved' and publication='published' and indexing='ready'))
);
create unique index document_one_current on public.document_version(document_id) where applicability='current';
create table public.document_equipment (
  version_id text references public.document_version(id), equipment_id text references public.equipment(id),
  primary key(version_id,equipment_id)
);
create table public.maintenance_event (
  id text primary key, equipment_id text not null references public.equipment(id), wo text not null unique,
  source_date date not null, source_precision text not null default 'date' check(source_precision='date'),
  type text not null, symptom text not null, cause text, action text,
  downtime numeric check(downtime>=0), cost numeric check(cost>=0), source text not null
);
create table public.investigation (
  id text primary key, equipment_id text not null references public.equipment(id),
  title text not null, symptom text not null, type text not null,
  observed_at timestamptz not null, submitted_at timestamptz not null default now(),
  reporter_id uuid not null references public.app_user(auth_user_id), assigned_to text,
  status text not null check(status in ('submitted','triage','awaiting_clarification','investigating','resolved_pending_review','closure_changes_requested','verified_closed')),
  cause_status text not null default 'not_established' check(cause_status in ('not_established','established')),
  cause text, action text not null default '', outcome text not null default '', lesson text not null default '', evidence text not null default '',
  downtime_start timestamptz, downtime_end timestamptz, closure_revision integer not null default 0,
  knowledge text not null default 'not_started' check(knowledge in ('not_started','pending','ready','failed')),
  check((cause_status='not_established' and cause is null) or (cause_status='established' and length(cause)>0)),
  check(downtime_end is null or (downtime_start is not null and downtime_end>=downtime_start)),
  check(knowledge='not_started' or status='verified_closed')
);
create table public.closure_submission (
  case_id text references public.investigation(id), revision integer check(revision>0),
  cause text, action text not null, outcome text not null, evidence text not null, at timestamptz not null default now(),
  primary key(case_id, revision)
);
create table public.audit_event (
  id uuid primary key default gen_random_uuid(), at timestamptz not null default now(),
  actor_id uuid not null references public.app_user(auth_user_id), actor_name text not null,
  action text not null, comment text not null default '',
  version_id text references public.document_version(id), case_id text references public.investigation(id),
  check(num_nonnulls(version_id,case_id)=1)
);
create table public.quality_issue (
  id text primary key, title text not null, status text not null check(status in ('open','resolved')),
  comment text not null, at timestamptz not null default now()
);
create table public.quality_issue_source (
  issue_id text references public.quality_issue(id), version_id text references public.document_version(id),
  primary key(issue_id,version_id)
);
create table public.processing_job (
  id uuid primary key default gen_random_uuid(), idempotency_key text not null unique,
  version_id text references public.document_version(id), case_id text references public.investigation(id),
  closure_revision integer, kind text not null check(kind in ('extract','index','case_refresh')),
  status text not null default 'queued' check(status in ('queued','running','succeeded','failed')),
  attempts integer not null default 0 check(attempts between 0 and 3),
  error text, next_attempt_at timestamptz, lease_expires_at timestamptz,
  check(num_nonnulls(version_id,case_id)=1),
  foreign key(case_id,closure_revision) references public.closure_submission(case_id,revision)
);
create table public.extraction_run (
  id uuid primary key default gen_random_uuid(), version_id text not null references public.document_version(id),
  job_id uuid not null references public.processing_job(id), method text not null,
  at timestamptz not null default now(), raw_output jsonb not null default '{}'
);
create table public.document_chunk (
  id uuid primary key default gen_random_uuid(), version_id text not null references public.document_version(id),
  extraction_id uuid not null references public.extraction_run(id), page integer not null check(page>0), ordinal integer not null,
  content text not null, embedding extensions.vector, embedding_model text, embedding_dimensions integer,
  unique(version_id,extraction_id,ordinal),
  check((embedding is null and embedding_model is null and embedding_dimensions is null) or
    (embedding is not null and embedding_model is not null and embedding_dimensions>0 and extensions.vector_dims(embedding)=embedding_dimensions))
);
create index document_equipment_asset on public.document_equipment(equipment_id);
create index maintenance_equipment_date on public.maintenance_event(equipment_id,source_date desc);
create index investigation_equipment_status on public.investigation(equipment_id,status);
create index audit_version on public.audit_event(version_id,at);
create index audit_case on public.audit_event(case_id,at);

-- Fixed search_path; helpers only return access decisions for auth.uid().
create function hub_private.can_equipment(target text) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.equipment_access where user_id=auth.uid() and equipment_id=target);
$$;
create function hub_private.can_version(target text) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from public.document_version v join public.document_acl a on a.document_id=v.document_id
    join public.app_user u on u.auth_user_id=a.user_id
    where v.id=target and a.user_id=auth.uid()
    and (v.access='team' or u.role in ('controller','reviewer'))
    and exists(select 1 from public.document_equipment de where de.version_id=v.id)
    and not exists(select 1 from public.document_equipment de where de.version_id=v.id and not hub_private.can_equipment(de.equipment_id))
  );
$$;
create function hub_private.can_case(target text) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.investigation where id=target and hub_private.can_equipment(equipment_id));
$$;
create function hub_private.can_issue(target text) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.quality_issue_source where issue_id=target)
    and not exists(select 1 from public.quality_issue_source where issue_id=target and not hub_private.can_version(version_id));
$$;
revoke all on all functions in schema hub_private from public;
grant execute on all functions in schema hub_private to authenticated;

-- RLS and SELECT-only grants: browser/client cannot overwrite records or audit history.
do $$ declare t text; begin
  foreach t in array array['app_user','equipment','equipment_access','role_membership','document','document_acl','document_version','document_equipment','maintenance_event','investigation','closure_submission','audit_event','quality_issue','quality_issue_source','processing_job','extraction_run','document_chunk'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on table public.%I from anon, authenticated',t);
    execute format('grant select on table public.%I to authenticated',t);
  end loop;
end $$;
create policy own_profile on public.app_user for select to authenticated using(auth_user_id=auth.uid());
create policy own_equipment_grants on public.equipment_access for select to authenticated using(user_id=auth.uid());
create policy own_roles on public.role_membership for select to authenticated using(user_id=auth.uid());
create policy own_document_grants on public.document_acl for select to authenticated using(user_id=auth.uid());
create policy scoped_equipment on public.equipment for select to authenticated using(hub_private.can_equipment(id));
create policy scoped_documents on public.document for select to authenticated using(exists(select 1 from public.document_version v where v.document_id=document.id and hub_private.can_version(v.id)));
create policy scoped_versions on public.document_version for select to authenticated using(hub_private.can_version(id));
create policy scoped_document_links on public.document_equipment for select to authenticated using(hub_private.can_version(version_id));
create policy scoped_history on public.maintenance_event for select to authenticated using(hub_private.can_equipment(equipment_id));
create policy scoped_cases on public.investigation for select to authenticated using(hub_private.can_equipment(equipment_id));
create policy scoped_closures on public.closure_submission for select to authenticated using(hub_private.can_case(case_id));
create policy scoped_events on public.audit_event for select to authenticated using(hub_private.can_version(version_id) or hub_private.can_case(case_id));
create policy scoped_issues on public.quality_issue for select to authenticated using(hub_private.can_issue(id));
create policy scoped_issue_sources on public.quality_issue_source for select to authenticated using(hub_private.can_issue(issue_id));
create policy scoped_jobs on public.processing_job for select to authenticated using(hub_private.can_version(version_id) or hub_private.can_case(case_id));
create policy scoped_extraction on public.extraction_run for select to authenticated using(hub_private.can_version(version_id));
create policy scoped_chunks on public.document_chunk for select to authenticated using(hub_private.can_version(version_id));

-- Source bucket is private. The application uses authenticated downloads, not signed URLs.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('hub-sources','hub-sources',false,10000000,array['application/pdf','image/png']) on conflict(id) do nothing;
do $$ begin
  if exists(select 1 from storage.buckets where id='hub-sources' and public) then
    raise exception 'hub-sources already exists as a public bucket. Review and secure it before migration.';
  end if;
end $$;
create policy hub_source_read on storage.objects for select to authenticated using(
  bucket_id='hub-sources' and exists(select 1 from public.document_version v
    where (v.storage_path=name or v.preview_path=name) and hub_private.can_version(v.id))
);

-- security invoker is intentional: every nested SELECT observes the caller's RLS.
create function public.hub_snapshot() returns jsonb
language sql stable security invoker set search_path='' as $$
select jsonb_build_object(
  'revision',0,
  'equipment',coalesce((select jsonb_agg(jsonb_build_object('id',id,'tag',tag,'name',name,'location',location,'area',area,'set',set_number) order by set_number) from public.equipment),'[]'::jsonb),
  'documents',coalesce((select jsonb_agg(jsonb_build_object(
    'id',v.id,'documentId',v.document_id,'title',v.title,'number',v.number,'type',v.type,'revision',v.revision,
    'equipmentIds',coalesce((select jsonb_agg(equipment_id) from public.document_equipment where version_id=v.id),'[]'::jsonb),
    'source',v.source,'filename',v.filename,'mime',v.mime,'checksum',v.checksum,'processing',v.processing,'metadata',v.metadata,
    'review',v.review,'publication',v.publication,'indexing',v.indexing,'applicability',v.applicability,'access',v.access,
    'owner',v.owner,'purpose',v.purpose,'text',v.extracted_text,
    'events',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'at',a.at,'actor',a.actor_name,'action',a.action,'comment',a.comment) order by a.at) from public.audit_event a where a.version_id=v.id),'[]'::jsonb)
  ) order by v.id) from public.document_version v),'[]'::jsonb),
  'history',coalesce((select jsonb_agg(jsonb_build_object('id',id,'equipmentId',equipment_id,'wo',wo,'date',source_date,'type',type,'symptom',symptom,'cause',coalesce(cause,''),'action',coalesce(action,''),'downtime',downtime,'cost',cost,'source',source) order by source_date desc) from public.maintenance_event),'[]'::jsonb),
  'cases',coalesce((select jsonb_agg(jsonb_build_object(
    'id',c.id,'equipmentId',c.equipment_id,'title',c.title,'symptom',c.symptom,'type',c.type,'observedAt',c.observed_at,'submittedAt',c.submitted_at,
    'reporter',c.reporter_id,'status',c.status,'assignedTo',coalesce(c.assigned_to::text,''),'causeStatus',c.cause_status,'cause',c.cause,'action',c.action,'outcome',c.outcome,'lesson',c.lesson,'evidence',c.evidence,
    'downtimeStart',c.downtime_start,'downtimeEnd',c.downtime_end,'closureRevision',c.closure_revision,'knowledge',c.knowledge,
    'closures',coalesce((select jsonb_agg(jsonb_build_object('revision',revision,'cause',cause,'action',action,'outcome',outcome,'evidence',evidence,'at',at) order by revision) from public.closure_submission where case_id=c.id),'[]'::jsonb),
    'events',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'at',a.at,'actor',a.actor_name,'action',a.action,'comment',a.comment) order by a.at) from public.audit_event a where a.case_id=c.id),'[]'::jsonb)
  ) order by c.submitted_at desc) from public.investigation c),'[]'::jsonb),
  'issues',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'title',i.title,'status',i.status,'comment',i.comment,'at',i.at,'sourceIds',(select jsonb_agg(version_id) from public.quality_issue_source where issue_id=i.id))) from public.quality_issue i),'[]'::jsonb),
  'audit','[]'::jsonb
);
$$;
revoke all on function public.hub_snapshot() from public,anon;
grant execute on function public.hub_snapshot() to authenticated;
commit;
