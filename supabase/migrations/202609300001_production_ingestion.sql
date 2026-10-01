-- Production source ingestion, page provenance, candidate review, and RAG.
-- Apply after 202609290001_control_room.sql.
begin;

-- Extend immutable source metadata without rewriting existing revisions.
alter table public.document_version add column if not exists byte_size bigint check(byte_size is null or byte_size >= 0);
alter table public.document_version add column if not exists original_relative_path text;
alter table public.document_version add column if not exists imported_at timestamptz;

do $$ declare constraint_name text; begin
  select conname into constraint_name from pg_constraint
  where conrelid='public.document_version'::regclass and contype='c'
    and pg_get_constraintdef(oid) like '%mime%application/pdf%';
  if constraint_name is not null then
    execute format('alter table public.document_version drop constraint %I', constraint_name);
  end if;
end $$;
alter table public.document_version add constraint document_version_supported_mime check(mime in (
  'application/pdf',
  'image/png',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation'
));

create or replace function public.hub_create_upload(
  p_version_id text, p_document_id text, p_existing_document boolean,
  p_filename text, p_mime text, p_checksum text, p_storage_path text,
  p_equipment_id text, p_expected_revision bigint
) returns bigint
language plpgsql security definer set search_path='' as $$
declare new_revision bigint; prior public.document_version%rowtype; actor text; extension text;
begin
  if hub_private.current_role() <> 'controller' then raise exception 'Controller role is required for upload.'; end if;
  if not hub_private.can_equipment(p_equipment_id) then raise exception 'Equipment access unavailable.'; end if;
  extension := case p_mime
    when 'application/pdf' then 'pdf'
    when 'image/png' then 'png'
    when 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' then 'xlsx'
    when 'application/vnd.openxmlformats-officedocument.presentationml.presentation' then 'pptx'
    else null end;
  if extension is null or length(p_checksum)<>64 then raise exception 'Invalid upload metadata.'; end if;
  if p_version_id !~ '^VER-[a-f0-9-]{36}$' or (not p_existing_document and p_document_id !~ '^DOC-[a-f0-9-]{36}$') then raise exception 'Invalid immutable identifier.'; end if;
  if p_storage_path <> 'sources/'||p_document_id||'/'||p_version_id||'.'||extension then raise exception 'Invalid private Storage path.'; end if;
  new_revision := hub_private.next_revision(p_expected_revision); actor := hub_private.actor_name();
  if p_existing_document then
    if not exists(select 1 from public.document_acl where user_id=auth.uid() and document_id=p_document_id) then raise exception 'Document access unavailable.'; end if;
    select v.* into prior from public.document_version v where v.document_id=p_document_id order by v.id desc limit 1;
    if prior.id is null then raise exception 'Existing document is unavailable.'; end if;
  else
    if exists(select 1 from public.document where id=p_document_id) then raise exception 'Document identifier already exists.'; end if;
    insert into public.document(id) values(p_document_id);
  end if;
  insert into public.document_version(id,document_id,title,number,type,revision,source,filename,mime,checksum,storage_path,processing,metadata,review,publication,indexing,applicability,access,owner,purpose,extracted_text,byte_size,imported_at)
  values(p_version_id,p_document_id,coalesce(prior.title,p_filename),coalesce(prior.number,''),coalesce(prior.type,'REFERENCE'),null,'Manual connected upload',p_filename,p_mime,p_checksum,p_storage_path,'queued','incomplete','not_submitted','unpublished','not_started','candidate',coalesce(prior.access,'team'),'','','',null,now());
  insert into public.document_equipment(version_id,equipment_id) values(p_version_id,p_equipment_id);
  insert into public.document_acl(user_id,document_id)
    select user_id,p_document_id from public.equipment_access where equipment_id=p_equipment_id on conflict do nothing;
  insert into public.document_acl(user_id,document_id) values(auth.uid(),p_document_id) on conflict do nothing;
  insert into public.audit_event(actor_id,actor_name,action,comment,version_id)
    values(auth.uid(),actor,'document.upload','File stored in private Supabase Storage. Processing and technical review are still required.',p_version_id);
  insert into public.processing_job(idempotency_key,version_id,kind,status,next_attempt_at)
    values(
      case when p_mime in ('application/pdf','image/png') then 'ocr:' else 'extract:' end || p_version_id || ':' || p_checksum || ':production-v1',
      p_version_id,
      case when p_mime in ('application/pdf','image/png') then 'ocr' else 'extract' end,
      'queued',
      now()
    ) on conflict(idempotency_key) do nothing;
  return new_revision;
end $$;

create table public.ingestion_batch (
  id uuid primary key default gen_random_uuid(),
  manifest_checksum text not null unique check(length(manifest_checksum)=64),
  source_root_label text not null,
  environment text not null check(environment in ('development','staging','production')),
  project_ref text not null,
  status text not null default 'draft' check(status in ('draft','approved','running','partially_failed','completed','cancelled')),
  total_files integer not null check(total_files>=0),
  total_bytes bigint not null check(total_bytes>=0),
  created_by uuid references auth.users(id),
  created_by_name text not null,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  check(completed_at is null or started_at is not null)
);

create table public.ingestion_item (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.ingestion_batch(id),
  manifest_item_id text not null,
  relative_path text not null,
  filename text not null,
  mime text not null,
  byte_size bigint not null check(byte_size>=0),
  sha256 text not null check(length(sha256)=64),
  equipment_id text references public.equipment(id),
  proposed_document_type text not null,
  status text not null default 'inventoried' check(status in ('inventoried','uploading','uploaded','parsing','ocr_processing','extracted','needs_attention','awaiting_review','approved','indexed','blocked','failed')),
  storage_path text,
  version_id text references public.document_version(id),
  attempts integer not null default 0 check(attempts between 0 and 3),
  error_code text,
  error_message text,
  deduplication_decision text check(deduplication_decision is null or deduplication_decision in ('new','reused_checksum','existing_version','conflict')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(batch_id,manifest_item_id),
  unique(batch_id,relative_path)
);
create index ingestion_item_status on public.ingestion_item(batch_id,status);
create index ingestion_item_checksum on public.ingestion_item(sha256);

alter table public.document_version add column if not exists ingestion_item_id uuid references public.ingestion_item(id);
create unique index if not exists document_version_ingestion_item on public.document_version(ingestion_item_id) where ingestion_item_id is not null;

create table public.document_page (
  id uuid primary key default gen_random_uuid(),
  version_id text not null references public.document_version(id),
  locator_type text not null check(locator_type in ('pdf_page','image','pptx_slide','xlsx_range')),
  locator_label text not null,
  page_number integer check(page_number is null or page_number>0),
  raw_text text not null default '',
  normalized_text text not null default '',
  extraction_state text not null default 'queued' check(extraction_state in ('queued','processing','succeeded','needs_attention','failed')),
  confidence double precision check(confidence is null or confidence between 0 and 1),
  regions jsonb not null default '[]'::jsonb,
  derivative_storage_path text,
  derivative_checksum text check(derivative_checksum is null or length(derivative_checksum)=64),
  processor text not null,
  provider text,
  model text,
  prompt_version text,
  schema_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(version_id,locator_type,locator_label)
);
create index document_page_version_number on public.document_page(version_id,page_number);

-- Processing jobs now distinguish OCR and embedding work and expose terminal attention states.
do $$ declare constraint_name text; begin
  select conname into constraint_name from pg_constraint
  where conrelid='public.processing_job'::regclass and contype='c'
    and pg_get_constraintdef(oid) like '%kind%extract%index%';
  if constraint_name is not null then execute format('alter table public.processing_job drop constraint %I',constraint_name); end if;
end $$;
alter table public.processing_job add constraint processing_job_kind check(kind in ('extract','ocr','index','embed','case_refresh'));

do $$ declare constraint_name text; begin
  select conname into constraint_name from pg_constraint
  where conrelid='public.processing_job'::regclass and contype='c'
    and pg_get_constraintdef(oid) like '%status%queued%running%succeeded%failed%';
  if constraint_name is not null then execute format('alter table public.processing_job drop constraint %I',constraint_name); end if;
end $$;
alter table public.processing_job add constraint processing_job_status check(status in ('queued','running','succeeded','failed','needs_attention','cancelled'));
alter table public.processing_job add column if not exists lease_owner text;
alter table public.processing_job add column if not exists started_at timestamptz;
alter table public.processing_job add column if not exists completed_at timestamptz;
alter table public.processing_job add column if not exists error_code text;

alter table public.extraction_run add column if not exists provider text;
alter table public.extraction_run add column if not exists model text;
alter table public.extraction_run add column if not exists prompt_version text;
alter table public.extraction_run add column if not exists schema_version text;
alter table public.extraction_run add column if not exists input_checksum text check(input_checksum is null or length(input_checksum)=64);
alter table public.extraction_run add column if not exists status text not null default 'succeeded' check(status in ('running','succeeded','failed'));
alter table public.extraction_run add column if not exists started_at timestamptz;
alter table public.extraction_run add column if not exists completed_at timestamptz;
alter table public.extraction_run add column if not exists usage_metadata jsonb not null default '{}'::jsonb;
create unique index if not exists extraction_run_one_per_job on public.extraction_run(job_id);

create table public.extraction_candidate (
  id uuid primary key default gen_random_uuid(),
  extraction_id uuid not null references public.extraction_run(id),
  version_id text not null references public.document_version(id),
  page_id uuid references public.document_page(id),
  candidate_type text not null check(candidate_type in ('equipment_identity','instrument_tag','parameter','limit','procedure','failure_mode','safeguard','inspection_step','topology_relation','maintenance_fact')),
  raw_text text not null,
  normalized_value jsonb,
  unit text,
  equipment_tag text,
  instrument_tag text,
  locator_type text not null,
  locator_label text not null,
  source_excerpt text not null,
  fingerprint text not null check(length(fingerprint)=64),
  confidence double precision check(confidence is null or confidence between 0 and 1),
  ambiguity_note text,
  requires_engineering_review boolean not null default true,
  review_status text not null default 'pending' check(review_status in ('pending','accepted','rejected','needs_clarification')),
  reviewer_id uuid references auth.users(id),
  reviewed_at timestamptz,
  review_note text,
  published_record_type text,
  published_record_id text,
  created_at timestamptz not null default now(),
  check((review_status='pending' and reviewer_id is null and reviewed_at is null) or review_status<>'pending')
);
create index extraction_candidate_review on public.extraction_candidate(review_status,candidate_type);
create index extraction_candidate_version on public.extraction_candidate(version_id);
create unique index extraction_candidate_identity on public.extraction_candidate(version_id,fingerprint);

create table public.parameter_source (
  id uuid primary key default gen_random_uuid(),
  parameter_id text not null references public.equipment_parameter(id),
  version_id text not null references public.document_version(id),
  page_id uuid references public.document_page(id),
  locator_label text not null,
  source_excerpt text not null default '',
  source_class text not null,
  created_at timestamptz not null default now(),
  unique(parameter_id,version_id,locator_label)
);

alter table public.document_chunk add column if not exists page_end integer;
alter table public.document_chunk add column if not exists content_checksum text;
alter table public.document_chunk add column if not exists chunking_strategy text not null default 'legacy';
alter table public.document_chunk add column if not exists token_count integer check(token_count is null or token_count>=0);
alter table public.document_chunk add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.document_chunk add column if not exists rag_eligible boolean not null default false;
alter table public.document_chunk add column if not exists active boolean not null default true;
alter table public.document_chunk add constraint document_chunk_page_range check(page_end is null or page_end>=page);
create unique index if not exists document_chunk_content_identity on public.document_chunk(version_id,content_checksum) where content_checksum is not null;

do $$ begin
  if exists(select 1 from public.document_chunk where embedding is not null and extensions.vector_dims(embedding)<>768) then
    raise exception 'Existing document_chunk embeddings are not 768-dimensional. Reconcile before applying production ingestion migration.';
  end if;
end $$;
alter table public.document_chunk alter column embedding type extensions.vector(768) using embedding::extensions.vector(768);
create index if not exists document_chunk_embedding_hnsw on public.document_chunk using hnsw (embedding extensions.vector_cosine_ops) where embedding is not null and rag_eligible and active;

-- RLS: normal clients remain read-only; privileged workers use the service role.
do $$ declare t text; begin
  foreach t in array array['ingestion_batch','ingestion_item','document_page','extraction_candidate','parameter_source'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on table public.%I from public,anon,authenticated',t);
    execute format('grant select on table public.%I to authenticated',t);
  end loop;
end $$;
create policy ingestion_batch_governance on public.ingestion_batch for select to authenticated
  using(hub_private.current_role() in ('controller','reviewer'));
create policy ingestion_item_governance on public.ingestion_item for select to authenticated
  using(hub_private.current_role() in ('controller','reviewer') and (equipment_id is null or hub_private.can_equipment(equipment_id)));
create policy document_page_scope on public.document_page for select to authenticated using(hub_private.can_version(version_id));
create policy extraction_candidate_scope on public.extraction_candidate for select to authenticated using(hub_private.can_version(version_id));
create policy parameter_source_scope on public.parameter_source for select to authenticated using(
  exists(select 1 from public.equipment_parameter p where p.id=parameter_id and hub_private.can_equipment(p.equipment_id))
  and hub_private.can_version(version_id)
);

-- Authorized vector search. SECURITY INVOKER keeps all nested table RLS active.
create or replace function public.hub_match_document_chunks(
  p_query_embedding extensions.vector(768),
  p_match_count integer default 8,
  p_equipment_id text default null
) returns table(
  chunk_id uuid,
  version_id text,
  page integer,
  page_end integer,
  content text,
  metadata jsonb,
  similarity double precision
)
language sql stable security invoker set search_path='' as $$
  select c.id,c.version_id,c.page,c.page_end,c.content,c.metadata,
    (1-(c.embedding operator(extensions.<=>) p_query_embedding))::double precision as similarity
  from public.document_chunk c
  where c.embedding is not null and c.rag_eligible and c.active
    and hub_private.can_version(c.version_id)
    and (p_equipment_id is null or exists(
      select 1 from public.document_equipment de where de.version_id=c.version_id and de.equipment_id=p_equipment_id
    ))
  order by c.embedding operator(extensions.<=>) p_query_embedding
  limit greatest(1,least(p_match_count,20));
$$;
revoke all on function public.hub_match_document_chunks(extensions.vector,integer,text) from public,anon;
grant execute on function public.hub_match_document_chunks(extensions.vector,integer,text) to authenticated;

create or replace function public.hub_worker_activate_version(p_version_id text) returns void
language plpgsql security definer set search_path='' as $$
declare target public.document_version%rowtype;
begin
  select * into target from public.document_version where id=p_version_id for update;
  if target.id is null then raise exception 'Document version unavailable.'; end if;
  if target.review<>'approved' or target.publication<>'published' then raise exception 'Only approved, published content can be activated.'; end if;
  if not exists(select 1 from public.document_chunk where version_id=p_version_id and active and rag_eligible and embedding is not null) then
    raise exception 'No eligible embedded chunks are available.';
  end if;
  update public.document_version set applicability='superseded'
    where document_id=target.document_id and id<>p_version_id and applicability='current';
  update public.document_version set indexing='ready',applicability='current' where id=p_version_id;
  update public.ingestion_item set status='indexed',updated_at=now() where version_id=p_version_id;
end $$;
revoke all on function public.hub_worker_activate_version(text) from public,anon,authenticated;
grant execute on function public.hub_worker_activate_version(text) to service_role;

-- Originals are retained privately. Ten minutes is the application signed-URL policy;
-- the bucket itself has no automatic deletion policy.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('hub-sources','hub-sources',false,10000000,array[
  'application/pdf','image/png',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation'
])
on conflict(id) do update set
  public=false,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

commit;
