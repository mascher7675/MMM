-- ============================================================
-- 017_one_time_order_cancellation.sql
--
-- Adds cancellation + refund support for one-time orders:
--   1. Extends the delivery_state CHECK constraint to allow 'cancelled'
--   2. Adds stripe_refund_id column to track issued refunds
--   3. Adds cancelled_at timestamp
--   4. Adds refund_amount_cents (supports partial refunds in future)
--   5. Creates an admin policy so admins can cancel any one-time order
-- ============================================================

-- ── 1. Drop the existing delivery_state constraint and re-create it
--       with 'cancelled' included.
-- ────────────────────────────────────────────────────────────────────
ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_delivery_state_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_delivery_state_check
    CHECK (delivery_state IN (
      'pending',
      'preparing',
      'out_for_delivery',
      'delivered',
      'failed',
      'cancelled'
    ));

-- ── 2. Refund tracking columns
-- ────────────────────────────────────────────────────────────────────
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS stripe_refund_id    text,
  ADD COLUMN IF NOT EXISTS refund_amount_cents integer,
  ADD COLUMN IF NOT EXISTS cancelled_at        timestamp with time zone;

-- ── 3. Index for fast cancelled-order admin queries
-- ────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS orders_cancelled_at_idx
  ON public.orders (cancelled_at)
  WHERE cancelled_at IS NOT NULL;

-- ── 4. RLS: customers can read their own refund info (already covered
--       by the existing orders_select_own policy).
--       Customers must NOT be able to self-cancel via direct DB writes —
--       cancellation goes through the server action which validates the
--       cutoff window and calls Stripe. No new customer write policy needed.

-- ── 5. Admin update policy (admins can cancel/refund any order)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'orders'
      AND policyname = 'admin_update_all_orders'
  ) THEN
    CREATE POLICY admin_update_all_orders ON public.orders
      FOR UPDATE USING (public.is_admin());
  END IF;
END $$;