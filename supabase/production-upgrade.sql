-- PBC Project Control Management - production permissions, audit, assets and settings
-- Run once in Supabase SQL Editor after the existing schema.sql.
-- IMPORTANT: after running this file, replace YOUR_ADMIN_EMAIL below with the workspace administrator email.

create extension if not exists pgcrypto;

create table if not exists public.project_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);
insert into public.project_settings(key,value) values ('payment_approval_sla_days','28'::jsonb)
on conflict (key) do nothing;

-- Ensure new accounts receive a least-privilege Viewer profile.
create or replace function public.handle_new_pbc_user()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.user_profiles(user_id,display_name,role)
  values(new.id,coalesce(new.raw_user_meta_data->>'display_name',''),'Consultant / Viewer')
  on conflict(user_id) do nothing;
  return new;
end; $$;
drop trigger if exists on_auth_user_created_pbc on auth.users;
create trigger on_auth_user_created_pbc after insert on auth.users
for each row execute function public.handle_new_pbc_user();

insert into public.user_profiles(user_id,display_name,role)
select id,coalesce(raw_user_meta_data->>'display_name',''),'Consultant / Viewer' from auth.users
on conflict(user_id) do nothing;

create or replace function public.pbc_current_role()
returns text language sql stable security definer set search_path=public as $$
  select coalesce((select role from public.user_profiles where user_id=auth.uid()),'Consultant / Viewer');
$$;

create or replace function public.pbc_can_edit_module(p_module text)
returns boolean language sql stable security definer set search_path=public as $$
 select case public.pbc_current_role()
  when 'Administrator' then true
  when 'Project Manager' then true
  when 'Technical Engineer' then p_module in ('work_orders','daily_updates','civil_mep','ncr','risks','issues','other')
  when 'Site Engineer' then p_module in ('work_orders','daily_updates','civil_mep','ncr')
  when 'QS / Commercial' then p_module in ('payments','change_requests','deadlines')
  when 'Finance' then p_module in ('payments')
  else false end;
$$;

-- Replace permissive starter policies with role-aware policies.
do $$ declare p record; begin
  for p in select policyname,tablename from pg_policies where schemaname='public' and tablename in ('user_profiles','assets','project_records','record_attachments','audit_logs','project_settings') loop
    execute format('drop policy if exists %I on public.%I',p.policyname,p.tablename);
  end loop;
end $$;

alter table public.user_profiles enable row level security;
alter table public.assets enable row level security;
alter table public.project_records enable row level security;
alter table public.record_attachments enable row level security;
alter table public.audit_logs enable row level security;
alter table public.project_settings enable row level security;

grant select,update on public.user_profiles to authenticated;
grant select,insert,update,delete on public.assets,public.project_records to authenticated;
grant select,insert,delete on public.record_attachments to authenticated;
grant select on public.audit_logs to authenticated;
grant select,insert,update on public.project_settings to authenticated;

create policy pbc_profiles_read on public.user_profiles for select to authenticated using (true);
create policy pbc_profiles_update_own_name on public.user_profiles for update to authenticated
using(user_id=auth.uid()) with check(user_id=auth.uid() and role=public.pbc_current_role());
create policy pbc_profiles_admin_update on public.user_profiles for update to authenticated
using(public.pbc_current_role()='Administrator') with check(public.pbc_current_role()='Administrator');

create or replace function public.pbc_admin_user_list()
returns table(user_id uuid,email text,display_name text,role text,created_at timestamptz)
language plpgsql security definer set search_path=public as $$
begin
  if public.pbc_current_role() <> 'Administrator' then raise exception 'Administrator role required'; end if;
  return query select u.id,u.email,p.display_name,p.role,u.created_at from auth.users u
    left join public.user_profiles p on p.user_id=u.id order by u.created_at;
end; $$;

create or replace function public.pbc_admin_set_user_role(p_user_id uuid,p_role text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if public.pbc_current_role() <> 'Administrator' then raise exception 'Administrator role required'; end if;
  if p_role not in ('Administrator','Project Manager','Technical Engineer','Site Engineer','QS / Commercial','Finance','Consultant / Viewer') then raise exception 'Invalid role'; end if;
  update public.user_profiles set role=p_role,updated_at=now() where user_id=p_user_id;
  if not found then raise exception 'User profile not found'; end if;
end; $$;
grant execute on function public.pbc_admin_user_list() to authenticated;
grant execute on function public.pbc_admin_set_user_role(uuid,text) to authenticated;

create policy pbc_assets_read on public.assets for select to authenticated using(true);
create policy pbc_assets_insert on public.assets for insert to authenticated
with check(public.pbc_current_role() in ('Administrator','Project Manager','Technical Engineer','Site Engineer'));
create policy pbc_assets_update on public.assets for update to authenticated
using(public.pbc_current_role() in ('Administrator','Project Manager','Technical Engineer','Site Engineer'))
with check(public.pbc_current_role() in ('Administrator','Project Manager','Technical Engineer','Site Engineer'));
create policy pbc_assets_delete on public.assets for delete to authenticated
using(public.pbc_current_role() in ('Administrator','Project Manager'));

create or replace function public.pbc_link_project_record_asset()
returns trigger language plpgsql security definer set search_path=public as $$
declare fid text;
begin
  fid:=coalesce(nullif(trim(new.data->>'Field ID'),''),nullif(trim(new.data->>'fieldId'),''),nullif(trim(new.data->>'Asset Ref ID'),''));
  if new.asset_id is null and fid is not null then
    select id into new.asset_id from public.assets where lower(trim(field_id))=lower(fid) or lower(trim(asset_key))=lower(fid) limit 1;
  end if;
  return new;
end; $$;
drop trigger if exists project_records_link_asset on public.project_records;
create trigger project_records_link_asset before insert or update of data,asset_id on public.project_records
for each row execute function public.pbc_link_project_record_asset();

create policy pbc_records_read on public.project_records for select to authenticated using(true);
create policy pbc_records_insert on public.project_records for insert to authenticated
with check(public.pbc_can_edit_module(module));
create policy pbc_records_update on public.project_records for update to authenticated
using(public.pbc_can_edit_module(module)) with check(public.pbc_can_edit_module(module));
create policy pbc_records_delete on public.project_records for delete to authenticated
using(public.pbc_current_role() in ('Administrator','Project Manager') or (public.pbc_can_edit_module(module) and is_imported=false));

create policy pbc_attachments_read on public.record_attachments for select to authenticated using(true);
create policy pbc_attachments_insert on public.record_attachments for insert to authenticated with check (
  (record_id is not null and exists(select 1 from public.project_records r where r.id=record_id and public.pbc_can_edit_module(r.module)))
  or (asset_id is not null and public.pbc_current_role() in ('Administrator','Project Manager','Technical Engineer','Site Engineer'))
);
create policy pbc_attachments_delete on public.record_attachments for delete to authenticated using (
  uploaded_by=auth.uid() or public.pbc_current_role() in ('Administrator','Project Manager')
);
create policy pbc_audit_read on public.audit_logs for select to authenticated
using(public.pbc_current_role() in ('Administrator','Project Manager'));
create policy pbc_settings_read on public.project_settings for select to authenticated using(true);
create policy pbc_settings_write on public.project_settings for all to authenticated
using(public.pbc_current_role()='Administrator') with check(public.pbc_current_role()='Administrator');

-- Audit role/profile changes as well (user_profiles uses user_id instead of id).
create or replace function public.audit_pbc_profile_change()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.audit_logs(table_name,record_id,action,old_data,new_data,changed_by)
  values('user_profiles',coalesce(new.user_id,old.user_id)::text,TG_OP,case when TG_OP='INSERT' then null else to_jsonb(old) end,case when TG_OP='DELETE' then null else to_jsonb(new) end,auth.uid());
  if TG_OP='DELETE' then return old; else return new; end if;
end; $$;
drop trigger if exists user_profiles_audit on public.user_profiles;
create trigger user_profiles_audit after insert or update or delete on public.user_profiles
for each row execute function public.audit_pbc_profile_change();

-- Audit attachment metadata as well as the main project registers.
drop trigger if exists record_attachments_audit on public.record_attachments;
create trigger record_attachments_audit after insert or update or delete on public.record_attachments
for each row execute function public.audit_row_change();

-- Private storage bucket; supports common office files and technical attachments.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('pbc-attachments','pbc-attachments',false,26214400,null)
on conflict(id) do update set public=false,file_size_limit=26214400,allowed_mime_types=null;
drop policy if exists "authenticated users read PBC files" on storage.objects;
drop policy if exists "authenticated users upload PBC files" on storage.objects;
drop policy if exists "authenticated users delete PBC files" on storage.objects;
drop policy if exists pbc_storage_read on storage.objects;
drop policy if exists pbc_storage_insert on storage.objects;
drop policy if exists pbc_storage_delete on storage.objects;
create policy pbc_storage_read on storage.objects for select to authenticated using(bucket_id='pbc-attachments');
create policy pbc_storage_insert on storage.objects for insert to authenticated
with check(bucket_id='pbc-attachments' and (storage.foldername(name))[1]=auth.uid()::text);
create policy pbc_storage_delete on storage.objects for delete to authenticated
using(bucket_id='pbc-attachments' and ((storage.foldername(name))[1]=auth.uid()::text or public.pbc_current_role() in ('Administrator','Project Manager')));

-- Bootstrap the first administrator. Replace the email literal, then execute this statement separately.
-- update public.user_profiles p set role='Administrator'
-- from auth.users u where p.user_id=u.id and lower(u.email)=lower('YOUR_ADMIN_EMAIL');

select 'PBC production upgrade applied. Set the first Administrator role using the bootstrap statement in this file.' as result;
