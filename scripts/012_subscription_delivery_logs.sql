-- 012_subscription_delivery_logs.sql
-- Per-week delivery tracking for subscription orders.
-- Each subscription order covers 4 weekly deliveries; this table stores
-- the delivery state for each individual week independently.

CREATE TABLE IF NOT EXISTS public.subscription_delivery_logs (
  id           uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  order_id     uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  delivery_date date NOT NULL,
  delivery_state text NOT NULL DEFAULT 'pending'
    CHECK (delivery_state IN ('pending', 'preparing', 'out_for_delivery', 'delivered', 'failed')),
  admin_notes  text,
  created_at   timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at   timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,

  -- One log row per order+date combination
  UNIQUE (order_id, delivery_date)
);

ALTER TABLE public.subscription_delivery_logs OWNER TO postgres;

-- Index for fast lookup by order
CREATE INDEX IF NOT EXISTS sub_delivery_logs_order_idx
  ON public.subscription_delivery_logs(order_id);

-- Index for fast lookup by date (e.g. "what's delivering today")
CREATE INDEX IF NOT EXISTS sub_delivery_logs_date_idx
  ON public.subscription_delivery_logs(delivery_date);

-- ── Row Level Security ───────────────────────────────────────────────────────

ALTER TABLE public.subscription_delivery_logs ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'subscription_delivery_logs'
      AND policyname = 'admin_all_delivery_logs'
  ) THEN
    CREATE POLICY admin_all_delivery_logs ON public.subscription_delivery_logs
      FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
  END IF;
END $$;

-- Customers can read logs for their own orders
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'subscription_delivery_logs'
      AND policyname = 'customer_read_own_delivery_logs'
  ) THEN
    CREATE POLICY customer_read_own_delivery_logs ON public.subscription_delivery_logs
      FOR SELECT USING (
        order_id IN (
          SELECT id FROM public.orders WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;