-- Add columns required by the app for subscription items (from Stripe checkout).
-- Your table had the older schema (milk_type only); the app expects product_id, product_name, price_cents for display and billing.

-- Add new columns (ignore if already present)
ALTER TABLE public.subscription_items
  ADD COLUMN IF NOT EXISTS product_id text,
  ADD COLUMN IF NOT EXISTS product_name text,
  ADD COLUMN IF NOT EXISTS price_cents integer;

-- Make milk_type nullable so we don't have to set it when saving from Stripe (optional)
ALTER TABLE public.subscription_items
  ALTER COLUMN milk_type DROP NOT NULL;

-- Backfill existing rows: derive product_id and product_name from milk_type + size if missing
UPDATE public.subscription_items
SET
  product_id = COALESCE(NULLIF(trim(product_id), ''), milk_type || '-' || COALESCE(size, '16oz')),
  product_name = COALESCE(NULLIF(trim(product_name), ''), initcap(milk_type) || ' Milk - ' || COALESCE(size, '16oz')),
  price_cents = COALESCE(price_cents, 0)
WHERE product_id IS NULL OR product_name IS NULL OR price_cents IS NULL;

-- Optional: set not null on columns the app expects (only if you're happy with backfill)
-- ALTER TABLE public.subscription_items ALTER COLUMN product_id SET NOT NULL;
-- ALTER TABLE public.subscription_items ALTER COLUMN product_name SET NOT NULL;
-- ALTER TABLE public.subscription_items ALTER COLUMN price_cents SET NOT NULL;
