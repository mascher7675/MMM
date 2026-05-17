-- 011_cash_customers_route_order.sql
-- Adds cash customer support and delivery route ordering
 
-- Add is_cash_customer flag to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_cash_customer boolean NOT NULL DEFAULT false;
 
-- Add route_position for drag-to-reorder delivery route (per delivery day)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS route_position integer;
 
-- Add internal admin notes per customer (not visible to the customer)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS admin_notes text;
 
-- Allow admin to INSERT new profiles (needed to create cash-only customers
-- who have no auth.users row)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
      AND policyname = 'admin_insert_any_profile'
  ) THEN
    CREATE POLICY admin_insert_any_profile ON public.profiles
      FOR INSERT WITH CHECK (public.is_admin());
  END IF;
END $$;
 
-- Allow admin to DELETE profiles (e.g. remove a cash customer)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
      AND policyname = 'admin_delete_any_profile'
  ) THEN
    CREATE POLICY admin_delete_any_profile ON public.profiles
      FOR DELETE USING (public.is_admin());
  END IF;
END $$;
 
-- Cash customers do not have auth.users rows, so we use a sentinel UUID
-- namespace. We create a helper function to generate a stable fake UUID
-- that is clearly admin-created and never collides with real auth users.
-- This is optional — admins can also pass gen_random_uuid() from the app.