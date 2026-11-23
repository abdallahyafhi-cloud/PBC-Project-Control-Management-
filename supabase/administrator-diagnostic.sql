-- PBC Administrator diagnostic and safe bootstrap
-- STEP 1: Read-only check. Run this first in Supabase SQL Editor.
-- It shows whether the profile role is linked to the actual Auth user UUID.
select
  u.id as auth_user_id,
  u.email,
  p.user_id as profile_user_id,
  p.display_name,
  p.role,
  (p.user_id = u.id) as auth_profile_match
from auth.users u
left join public.user_profiles p on p.user_id = u.id
order by u.created_at;

-- STEP 2: Only after confirming the exact email and intended administrator,
-- replace the placeholder below with that exact email and run separately.
-- This updates the role for the matching authenticated account only.
-- update public.user_profiles p
-- set role = 'Administrator', updated_at = now()
-- from auth.users u
-- where p.user_id = u.id
--   and lower(u.email) = lower('REPLACE_WITH_EXACT_LOGIN_EMAIL');

-- Ensure authenticated clients can call the server-side role resolver.
grant execute on function public.pbc_current_role() to authenticated;
