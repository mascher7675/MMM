-- Migration 014: Add delivery_dates column to subscriptions
--
-- Stores all 4 scheduled delivery dates for a subscription cycle explicitly,
-- so they remain correct even after a user changes their delivery day.
--
-- Previously, the admin orders tab computed the 4 dates from placed_at + 7-day
-- offsets, which broke whenever a user switched from e.g. Thursday to Friday.
-- Now delivery_dates is written at checkout and updated by updateDeliveryDay.

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS delivery_dates date[] DEFAULT NULL;

-- Backfill from next_delivery_date for any existing active subscriptions.
-- If next_delivery_date is set, the 4 dates are: next, next+7, next+14, next+21.
UPDATE public.subscriptions
SET delivery_dates = ARRAY[
  next_delivery_date,
  next_delivery_date + INTERVAL '7 days',
  next_delivery_date + INTERVAL '14 days',
  next_delivery_date + INTERVAL '21 days'
]::date[]
WHERE next_delivery_date IS NOT NULL
  AND delivery_dates IS NULL;

-- Verify results
SELECT id, delivery_day, next_delivery_date, delivery_dates, status
FROM public.subscriptions
ORDER BY created_at DESC;