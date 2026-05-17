-- 010_admin_policies.sql
-- Ensures admin users have full CRUD on all relevant tables
-- Run once in Supabase SQL Editor

-- Admin insert on orders (needed to manually create/adjust orders)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'orders' AND policyname = 'admin_insert_all_orders'
  ) THEN
    CREATE POLICY admin_insert_all_orders ON public.orders
      FOR INSERT WITH CHECK (public.is_admin());
  END IF;
END $$;

-- Admin delete on orders
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'orders' AND policyname = 'admin_delete_all_orders'
  ) THEN
    CREATE POLICY admin_delete_all_orders ON public.orders
      FOR DELETE USING (public.is_admin());
  END IF;
END $$;

-- Admin insert on subscriptions
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'subscriptions' AND policyname = 'admin_insert_all_subscriptions'
  ) THEN
    CREATE POLICY admin_insert_all_subscriptions ON public.subscriptions
      FOR INSERT WITH CHECK (public.is_admin());
  END IF;
END $$;

-- Admin delete on subscriptions
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'subscriptions' AND policyname = 'admin_delete_all_subscriptions'
  ) THEN
    CREATE POLICY admin_delete_all_subscriptions ON public.subscriptions
      FOR DELETE USING (public.is_admin());
  END IF;
END $$;

-- Admin full access to subscription_items
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'subscription_items' AND policyname = 'admin_update_all_subscription_items'
  ) THEN
    CREATE POLICY admin_update_all_subscription_items ON public.subscription_items
      FOR UPDATE USING (public.is_admin());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'subscription_items' AND policyname = 'admin_delete_all_subscription_items'
  ) THEN
    CREATE POLICY admin_delete_all_subscription_items ON public.subscription_items
      FOR DELETE USING (public.is_admin());
  END IF;
END $$;

-- Admin update on profiles (to set role, update customer info)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'admin_update_all_profiles'
  ) THEN
    CREATE POLICY admin_update_all_profiles ON public.profiles
      FOR UPDATE USING (public.is_admin());
  END IF;
END $$;

-- Admin insert on messages (to reply/add notes)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'messages' AND policyname = 'admin_insert_all_messages'
  ) THEN
    CREATE POLICY admin_insert_all_messages ON public.messages
      FOR INSERT WITH CHECK (public.is_admin());
  END IF;
END $$;

-- Add delivery_state column to orders if missing (for admin delivery tracking)
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_state text DEFAULT 'pending'
    CHECK (delivery_state IN ('pending', 'preparing', 'out_for_delivery', 'delivered', 'failed'));

-- Add admin_notes column to orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS admin_notes text;

-- Add placed_at column (when Stripe session was created) if missing
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS placed_at timestamp with time zone;

-- Backfill placed_at from created_at for existing rows
UPDATE public.orders SET placed_at = created_at WHERE placed_at IS NULL;

-- delivery_state default index for admin queries
CREATE INDEX IF NOT EXISTS orders_delivery_state_idx ON public.orders(delivery_state);
CREATE INDEX IF NOT EXISTS orders_delivery_day_idx ON public.orders(delivery_day);
CREATE INDEX IF NOT EXISTS subscriptions_status_idx ON public.subscriptions(status);