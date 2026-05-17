-- Migration 008: Backfill next_delivery_date for existing active subscriptions
--
-- The next_delivery_date column already exists in the schema but has never been
-- written to. This migration backfills it for all active subscriptions using
-- server-side date math (no cutoff-hour logic — that only applies to new orders).
--
-- Logic: find the next upcoming Thursday (4) or Friday (5) from today's UTC date.
-- Run this migration, then going forward updateDeliveryDay and saveOrderFromSession
-- will keep it up to date.

UPDATE public.subscriptions
SET
  next_delivery_date = CASE
    WHEN delivery_day = 'thursday' THEN
      -- Next Thursday from today (if today IS Thursday, go to next week)
      CURRENT_DATE + ((4 - EXTRACT(DOW FROM CURRENT_DATE)::int + 7) % 7 + 7) % 7
        * INTERVAL '1 day' +
        CASE WHEN (4 - EXTRACT(DOW FROM CURRENT_DATE)::int + 7) % 7 = 0
          THEN INTERVAL '7 days' ELSE INTERVAL '0 days' END
    WHEN delivery_day = 'friday' THEN
      CURRENT_DATE + ((5 - EXTRACT(DOW FROM CURRENT_DATE)::int + 7) % 7) * INTERVAL '1 day' +
        CASE WHEN (5 - EXTRACT(DOW FROM CURRENT_DATE)::int + 7) % 7 = 0
          THEN INTERVAL '7 days' ELSE INTERVAL '0 days' END
    ELSE NULL
  END,
  updated_at = NOW()
WHERE
  status = 'active'
  AND next_delivery_date IS NULL;

-- Verify results
SELECT id, delivery_day, next_delivery_date, status
FROM public.subscriptions
WHERE status = 'active'
ORDER BY next_delivery_date;