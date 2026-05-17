-- Migration 017: Structured subscription pause support
--
-- Adds pause request fields to subscriptions so customers can request
-- specific delivery date skips and admins can approve them (triggering
-- Stripe pause_collection so billing shifts forward, not refunded).
--
-- pause_status values:
--   'none'     → no active pause request (default)
--   'pending'  → customer has requested a pause, admin has not yet acted
--   'approved' → admin approved, Stripe pause_collection active
--
-- pause_skip_dates stores the actual delivery dates being skipped so the
-- delivery route query can exclude them without touching the full
-- delivery_dates array (which records all 4 dates in the billing cycle).

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS pause_status text NOT NULL DEFAULT 'none'
    CHECK (pause_status IN ('none', 'pending', 'approved')),
  ADD COLUMN IF NOT EXISTS pause_requested_from date,
  ADD COLUMN IF NOT EXISTS pause_requested_until date,
  ADD COLUMN IF NOT EXISTS pause_skip_dates date[],
  ADD COLUMN IF NOT EXISTS pause_note text,
  ADD COLUMN IF NOT EXISTS pause_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS stripe_pause_resumes_at timestamptz;

-- Index so the admin can quickly query pending pause requests
CREATE INDEX IF NOT EXISTS idx_subscriptions_pause_status
  ON public.subscriptions (pause_status)
  WHERE pause_status != 'none';

-- Verify
SELECT id, status, pause_status, pause_requested_from, pause_requested_until
FROM public.subscriptions
ORDER BY created_at DESC
LIMIT 5;