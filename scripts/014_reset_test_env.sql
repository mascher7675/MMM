-- =============================================================
-- TEST ENVIRONMENT RESET
-- Clears all customer data while preserving admin accounts
-- and keeping the schema intact.
-- =============================================================

-- 1. Delete messages
DELETE FROM public.messages;

-- 2. Delete order items (cascade from orders, but explicit is safer)
DELETE FROM public.order_items;

-- 3. Delete orders
DELETE FROM public.orders;

-- 4. Delete subscription items (cascade from subscriptions)
DELETE FROM public.subscription_items;

-- 5. Delete subscriptions
DELETE FROM public.subscriptions;

-- 6. Delete all non-admin profiles
--    This preserves your admin account(s).
DELETE FROM public.profiles
WHERE role != 'admin';

-- 7. Delete all non-admin auth users
--    ⚠️ This deletes real Supabase auth accounts — they will need to re-register.
--    Skip this block if you want to keep auth accounts and just clear their data.
DELETE FROM auth.users
WHERE id NOT IN (
  SELECT id FROM public.profiles WHERE role = 'admin'
);