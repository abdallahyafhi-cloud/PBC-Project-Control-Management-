
-- PBC Project Control Management: shared database foundation
-- Run in Supabase SQL Editor after creating a Supabase project.
create extension if not exists pgcrypto;

create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role text not null default 'Viewer'
    check (role in ('Administrator','Project Manager','Technical Engineer','Site Engineer','QS / Commercial','Finance','Consultant / Viewer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  asset_key text unique not null,
  asset_name text not null,
  asset_type text,
  field_id text,
  asset_ref_id text,
  latitude double precision,
  longitude double precision,
  source_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id)
);

-- Unified register preserves original Excel column names in data JSON.
create table if not exists public.project_records (
  id uuid primary key default gen_random_uuid(),
  module text not null check (module in (
    'work_orders','daily_updates','civil_mep','payments','ncr','risks',
    'issues','change_requests','client_satisfaction','deadlines','other'
  )),
  record_key text,
  asset_id uuid references public.assets(id) on delete set null,
  work_order_id uuid references public.project_records(id) on delete set null,
  discipline text,
  status text,
  record_date date,
  source_sheet text,
  source_row integer,
  data jsonb not null default '{}'::jsonb,
  is_imported boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id)
);
create index if not exists project_records_module_idx on public.project_records(module);
create index if not exists project_records_asset_idx on public.project_records(asset_id);
create index if not exists project_records_key_idx on public.project_records(record_key);
create index if not exists project_records_date_idx on public.project_records(record_date);

create table if not exists public.record_attachments (
  id uuid primary key default gen_random_uuid(),
  record_id uuid references public.project_records(id) on delete cascade,
  asset_id uuid references public.assets(id) on delete cascade,
  file_name text not null,
  storage_path text not null,
  mime_type text,
  description text,
  uploaded_at timestamptz not null default now(),
  uploaded_by uuid references auth.users(id)
);

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  table_name text not null,
  record_id text not null,
  action text not null check (action in ('INSERT','UPDATE','DELETE')),
  old_data jsonb,
  new_data jsonb,
  changed_at timestamptz not null default now(),
  changed_by uuid references auth.users(id)
);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;

drop trigger if exists assets_set_updated_at on public.assets;
create trigger assets_set_updated_at before update on public.assets
for each row execute function public.set_updated_at();
drop trigger if exists records_set_updated_at on public.project_records;
create trigger records_set_updated_at before update on public.project_records
for each row execute function public.set_updated_at();

create or replace function public.audit_row_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  rid text;
begin
  if TG_OP = 'DELETE' then
    rid := old.id::text;
    insert into public.audit_logs(table_name,record_id,action,old_data,changed_by)
    values (TG_TABLE_NAME,rid,TG_OP,to_jsonb(old),auth.uid());
    return old;
  elsif TG_OP = 'UPDATE' then
    rid := new.id::text;
    insert into public.audit_logs(table_name,record_id,action,old_data,new_data,changed_by)
    values (TG_TABLE_NAME,rid,TG_OP,to_jsonb(old),to_jsonb(new),auth.uid());
    return new;
  else
    rid := new.id::text;
    insert into public.audit_logs(table_name,record_id,action,new_data,changed_by)
    values (TG_TABLE_NAME,rid,TG_OP,to_jsonb(new),auth.uid());
    return new;
  end if;
end; $$;

drop trigger if exists assets_audit on public.assets;
create trigger assets_audit after insert or update or delete on public.assets
for each row execute function public.audit_row_change();
drop trigger if exists project_records_audit on public.project_records;
create trigger project_records_audit after insert or update or delete on public.project_records
for each row execute function public.audit_row_change();

alter table public.user_profiles enable row level security;
alter table public.assets enable row level security;
alter table public.project_records enable row level security;
alter table public.record_attachments enable row level security;
alter table public.audit_logs enable row level security;

-- Initial shared-workspace policies: signed-in project users can work in the workspace.
-- Restrict role-specific permissions before inviting external users.
create policy "signed in users read profiles" on public.user_profiles for select to authenticated using (true);
create policy "users update own profile" on public.user_profiles for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "signed in users read assets" on public.assets for select to authenticated using (true);
create policy "signed in users create assets" on public.assets for insert to authenticated with check (true);
create policy "signed in users update assets" on public.assets for update to authenticated using (true) with check (true);
create policy "signed in users delete assets" on public.assets for delete to authenticated using (true);
create policy "signed in users read records" on public.project_records for select to authenticated using (true);
create policy "signed in users create records" on public.project_records for insert to authenticated with check (true);
create policy "signed in users update records" on public.project_records for update to authenticated using (true) with check (true);
create policy "signed in users delete records" on public.project_records for delete to authenticated using (true);
create policy "signed in users read attachments" on public.record_attachments for select to authenticated using (true);
create policy "signed in users create attachments" on public.record_attachments for insert to authenticated with check (true);
create policy "signed in users delete attachments" on public.record_attachments for delete to authenticated using (true);
create policy "signed in users read audit" on public.audit_logs for select to authenticated using (true);

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('pbc-attachments','pbc-attachments',false,26214400,
  array['image/jpeg','image/png','image/webp','application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do nothing;

create policy "authenticated users read PBC files" on storage.objects
for select to authenticated using (bucket_id = 'pbc-attachments');
create policy "authenticated users upload PBC files" on storage.objects
for insert to authenticated with check (bucket_id = 'pbc-attachments');
create policy "authenticated users delete PBC files" on storage.objects
for delete to authenticated using (bucket_id = 'pbc-attachments');
