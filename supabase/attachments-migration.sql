-- PBC Project Control: record attachments and private file storage
-- Run once in Supabase SQL Editor. Safe to re-run.

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

alter table public.record_attachments enable row level security;
grant select, insert, delete on public.record_attachments to authenticated;

drop policy if exists "signed in users read attachments" on public.record_attachments;
create policy "signed in users read attachments" on public.record_attachments
  for select to authenticated using (true);
drop policy if exists "signed in users create attachments" on public.record_attachments;
create policy "signed in users create attachments" on public.record_attachments
  for insert to authenticated with check (true);
drop policy if exists "signed in users delete attachments" on public.record_attachments;
create policy "signed in users delete attachments" on public.record_attachments
  for delete to authenticated using (true);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'pbc-attachments', 'pbc-attachments', false, 26214400,
  array[
    'application/pdf', 'image/jpeg', 'image/png', 'image/webp',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do update set
  public = false,
  file_size_limit = 26214400,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "authenticated users read PBC files" on storage.objects;
create policy "authenticated users read PBC files" on storage.objects
  for select to authenticated using (bucket_id = 'pbc-attachments');
drop policy if exists "authenticated users upload PBC files" on storage.objects;
create policy "authenticated users upload PBC files" on storage.objects
  for insert to authenticated with check (bucket_id = 'pbc-attachments');
drop policy if exists "authenticated users delete PBC files" on storage.objects;
create policy "authenticated users delete PBC files" on storage.objects
  for delete to authenticated using (bucket_id = 'pbc-attachments');
