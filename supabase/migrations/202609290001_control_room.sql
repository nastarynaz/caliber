-- Governed equipment parameters and field readings for the Control Room pilot.
-- The workbook seed is loaded with `pnpm import:parameters` after this migration.
begin;

create table public.equipment_parameter (
  id text primary key,
  equipment_id text not null references public.equipment(id),
  group_name text not null,
  instrument_tag text not null,
  name text not null,
  unit text not null default '',
  base_value double precision,
  current_value double precision,
  normal_min double precision,
  normal_max double precision,
  advisory double precision,
  critical double precision,
  direction text not null check(direction in ('HIGH','LOW','N/A')),
  voting text not null default '', sil text not null default '',
  source_class text not null, engineering_note text not null default '',
  model_driver text not null check(model_driver in ('MANUAL','LOAD','CALCULATED','CONNECTOR')),
  priority_21 double precision not null default 0 check(priority_21 between 0 and 21),
  source_document text not null, source_locator text not null,
  review_status text not null check(review_status in ('candidate','published')),
  data_mode text not null check(data_mode in ('imported_workbook','manual_field','connector')),
  valid_from timestamptz, updated_at timestamptz, updated_by text not null default '',
  archived_at timestamptz,
  check(normal_min is null or normal_max is null or normal_min < normal_max),
  unique(equipment_id,instrument_tag)
);
create table public.parameter_revision (
  id text primary key, parameter_id text not null references public.equipment_parameter(id),
  revision integer not null check(revision > 0), before_value jsonb not null, after_value jsonb not null,
  created_at timestamptz not null default now(), actor_id uuid not null references auth.users(id), actor_name text not null, comment text not null,
  unique(parameter_id,revision)
);
create table public.parameter_reading (
  id uuid primary key default gen_random_uuid(), parameter_id text not null references public.equipment_parameter(id),
  value double precision not null, observed_at timestamptz not null default now(), source text not null check(source in ('manual_field','connector')),
  actor_id uuid references auth.users(id), actor_name text not null, note text not null, created_at timestamptz not null default now()
);
create table public.equipment_locator (
  id uuid primary key default gen_random_uuid(), equipment_id text not null references public.equipment(id),
  provider text not null check(provider in ('qr','ble','uwb','nfc','manual')), external_identity text not null,
  zone text, enabled boolean not null default true, safety_clearance_m double precision,
  unique(provider,external_identity)
);

alter table public.audit_event add column if not exists parameter_id text references public.equipment_parameter(id);
alter table public.audit_event drop constraint if exists audit_event_one_target;
alter table public.audit_event add constraint audit_event_one_target check(num_nonnulls(version_id,case_id,issue_id,parameter_id)=1);

alter table public.equipment_parameter enable row level security;
alter table public.parameter_revision enable row level security;
alter table public.parameter_reading enable row level security;
alter table public.equipment_locator enable row level security;
create policy parameter_scope on public.equipment_parameter for select to authenticated using(hub_private.can_equipment(equipment_id));
create policy parameter_revision_scope on public.parameter_revision for select to authenticated using(exists(select 1 from public.equipment_parameter p where p.id=parameter_id and hub_private.can_equipment(p.equipment_id)));
create policy parameter_reading_scope on public.parameter_reading for select to authenticated using(exists(select 1 from public.equipment_parameter p where p.id=parameter_id and hub_private.can_equipment(p.equipment_id)));
create policy locator_scope on public.equipment_locator for select to authenticated using(hub_private.can_equipment(equipment_id));
revoke all on public.equipment_parameter,public.parameter_revision,public.parameter_reading,public.equipment_locator from public,anon,authenticated;
grant select on public.equipment_parameter,public.parameter_revision,public.parameter_reading,public.equipment_locator to authenticated;

create or replace function public.hub_control_room_snapshot() returns jsonb
language sql stable security invoker set search_path='' as $$
select jsonb_build_object(
  'parameters',coalesce((select jsonb_agg(jsonb_build_object(
    'id',p.id,'equipmentId',p.equipment_id,'group',p.group_name,'instrumentTag',p.instrument_tag,'name',p.name,'unit',p.unit,
    'baseValue',p.base_value,'currentValue',p.current_value,'normalMin',p.normal_min,'normalMax',p.normal_max,'advisory',p.advisory,'critical',p.critical,
    'direction',p.direction,'voting',p.voting,'sil',p.sil,'sourceClass',p.source_class,'engineeringNote',p.engineering_note,
    'modelDriver',p.model_driver,'priority21',p.priority_21,'sourceDocument',p.source_document,'sourceLocator',p.source_locator,
    'reviewStatus',p.review_status,'dataMode',p.data_mode,'validFrom',p.valid_from,'updatedAt',p.updated_at,'updatedBy',p.updated_by
  ) order by p.equipment_id,p.instrument_tag) from public.equipment_parameter p where p.archived_at is null),'[]'::jsonb),
  'parameterRevisions',coalesce((select jsonb_agg(jsonb_build_object(
    'id',r.id,'parameterId',r.parameter_id,'revision',r.revision,'before',r.before_value,'after',r.after_value,'at',r.created_at,'actor',r.actor_name,'comment',r.comment
  ) order by r.created_at) from public.parameter_revision r),'[]'::jsonb)
);
$$;
revoke all on function public.hub_control_room_snapshot() from public,anon;
grant execute on function public.hub_control_room_snapshot() to authenticated;

-- Layer Control Room records onto the existing ACL-filtered snapshot.
do $$ begin
  if to_regprocedure('public.hub_snapshot_operations()') is null then alter function public.hub_snapshot() rename to hub_snapshot_operations; end if;
end $$;
create or replace function public.hub_snapshot() returns jsonb
language sql stable security invoker set search_path='' as $$
  select public.hub_snapshot_operations() || public.hub_control_room_snapshot();
$$;
revoke all on function public.hub_snapshot() from public,anon;
grant execute on function public.hub_snapshot() to authenticated;
grant execute on function public.hub_snapshot_operations() to authenticated;

-- Add parameter actions without weakening the existing command function.
do $$ begin
  if to_regprocedure('public.hub_command_operations(text,text,jsonb,bigint)') is null then alter function public.hub_command(text,text,jsonb,bigint) rename to hub_command_operations; end if;
end $$;
create or replace function public.hub_command(p_action text,p_id text,p_data jsonb,p_expected_revision bigint) returns bigint
language plpgsql security definer set search_path='' as $$
declare p public.equipment_parameter%rowtype; actor text:=hub_private.actor_name(); role_name text:=hub_private.current_role(); next_rev bigint; snapshot_before jsonb; snapshot_after jsonb; comment_text text:=btrim(coalesce(p_data->>'comment',''));
begin
  if p_action not in ('parameter.update','parameter.reading') then return public.hub_command_operations(p_action,p_id,p_data,p_expected_revision); end if;
  select * into p from public.equipment_parameter where id=p_id for update;
  if p.id is null or not hub_private.can_equipment(p.equipment_id) then raise exception 'Parameter unavailable.'; end if;
  if comment_text='' then raise exception 'comment is required.'; end if;
  next_rev:=hub_private.next_revision(p_expected_revision);
  if p_action='parameter.update' then
    if role_name<>'controller' then raise exception 'Controller role is required.'; end if;
    snapshot_before:=to_jsonb(p);
    update public.equipment_parameter set
      unit=coalesce(nullif(btrim(p_data->>'unit'),''),unit),
      base_value=case when p_data ? 'baseValue' then nullif(p_data->>'baseValue','')::double precision else base_value end,
      normal_min=case when p_data ? 'normalMin' then nullif(p_data->>'normalMin','')::double precision else normal_min end,
      normal_max=case when p_data ? 'normalMax' then nullif(p_data->>'normalMax','')::double precision else normal_max end,
      advisory=case when p_data ? 'advisory' then nullif(p_data->>'advisory','')::double precision else advisory end,
      critical=case when p_data ? 'critical' then nullif(p_data->>'critical','')::double precision else critical end,
      engineering_note=coalesce(nullif(btrim(p_data->>'engineeringNote'),''),engineering_note),review_status='published',updated_at=now(),updated_by=actor
    where id=p_id returning * into p;
    snapshot_after:=to_jsonb(p);
    insert into public.parameter_revision(id,parameter_id,revision,before_value,after_value,actor_id,actor_name,comment)
      values('PRV-'||gen_random_uuid()::text,p_id,coalesce((select max(revision)+1 from public.parameter_revision where parameter_id=p_id),1),snapshot_before,snapshot_after,auth.uid(),actor,comment_text);
  else
    if role_name not in ('engineer','reviewer') then raise exception 'Field contributor role is required.'; end if;
    insert into public.parameter_reading(parameter_id,value,source,actor_id,actor_name,note) values(p_id,(p_data->>'currentValue')::double precision,'manual_field',auth.uid(),actor,comment_text);
    update public.equipment_parameter set current_value=(p_data->>'currentValue')::double precision,data_mode='manual_field',updated_at=now(),updated_by=actor where id=p_id;
  end if;
  insert into public.audit_event(actor_id,actor_name,action,comment,parameter_id) values(auth.uid(),actor,p_action,comment_text,p_id);
  return next_rev;
end $$;
revoke all on function public.hub_command(text,text,jsonb,bigint) from public,anon;
grant execute on function public.hub_command(text,text,jsonb,bigint) to authenticated;
grant execute on function public.hub_command_operations(text,text,jsonb,bigint) to authenticated;

commit;
