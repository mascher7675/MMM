-- ============================================================
-- Migration 008: Final schema cleanup
-- Safe to run — all DROPs use IF EXISTS
-- ============================================================
 
-- ------------------------------------------------------------
-- 1. Drop unused columns from profiles
-- ------------------------------------------------------------
 
-- zip_code: legacy from migration 001, replaced by `zip` in 005. App uses `zip` everywhere.
ALTER TABLE public.profiles DROP COLUMN IF EXISTS zip_code;
 
-- full_name: legacy from migration 001. App uses first_name + last_name everywhere.
-- The handle_new_user() trigger never sets it. Safe to drop.
ALTER TABLE public.profiles DROP COLUMN IF EXISTS full_name;
 
-- ------------------------------------------------------------
-- 2. Drop unused columns from subscriptions
-- ------------------------------------------------------------
 
-- next_delivery_date: never written to by app code or webhook.
-- current_period_end covers this purpose.
ALTER TABLE public.subscriptions DROP COLUMN IF EXISTS next_delivery_date;
 
-- stripe_customer_id on subscriptions: redundant — it lives on profiles.stripe_customer_id.
-- The webhook and app code both use profiles for this. One source of truth is cleaner.
ALTER TABLE public.subscriptions DROP COLUMN IF EXISTS stripe_customer_id;
 
-- ------------------------------------------------------------
-- 3. Remove duplicate RLS policies on subscription_items
--    Migration 002 created: subscription_items_select/insert/update/delete
--    Migration 003 created: subscription_items_select_own/insert_own/update_own/delete_own
--    Both sets do the identical check. Keep the *_own variants (more explicit naming).
-- ------------------------------------------------------------
 
DROP POLICY IF EXISTS subscription_items_select  ON public.subscription_items;
DROP POLICY IF EXISTS subscription_items_insert  ON public.subscription_items;
DROP POLICY IF EXISTS subscription_items_update  ON public.subscription_items;
DROP POLICY IF EXISTS subscription_items_delete  ON public.subscription_items;
 
-- ------------------------------------------------------------
-- 4. Consolidate duplicate profiles RLS policies
--    profiles_all_own is a catch-all FOR ALL that overlaps with the 4 specific policies.
--    Keep the specific ones (select/insert/update/delete) — they're clearer and 
--    easier to audit. Drop the redundant FOR ALL policy.
-- ------------------------------------------------------------
 
DROP POLICY IF EXISTS profiles_all_own ON public.profiles;
 
-- ------------------------------------------------------------
-- 5. Add missing index on orders.stripe_session_id
--    Used for idempotency check in saveOrderFromSession — should be indexed.
-- ------------------------------------------------------------
 
CREATE UNIQUE INDEX IF NOT EXISTS orders_stripe_session_id_idx
  ON public.orders (stripe_session_id)
  WHERE stripe_session_id IS NOT NULL;
 
-- ------------------------------------------------------------
-- 6. Add missing index on subscriptions.stripe_subscription_id
--    Used in every webhook handler to look up the subscription row.
-- ------------------------------------------------------------
 
CREATE INDEX IF NOT EXISTS subscriptions_stripe_subscription_id_idx
  ON public.subscriptions (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;
 
-- ------------------------------------------------------------
-- Done. Your public schema now has:
--
-- profiles:           id, first_name, last_name, email, phone, address, city,
--                     zip, state, delivery_day, delivery_instructions,
--                     stripe_customer_id, role, created_at, updated_at
--
-- subscriptions:      id, user_id, status, delivery_day, stripe_subscription_id,
--                     cancel_at_period_end, current_period_end, created_at, updated_at
--
-- subscription_items: id, subscription_id, milk_type, product_id, product_name,
--                     size, quantity, price_cents, created_at
--
-- orders:             id, user_id, stripe_session_id, stripe_payment_intent_id,
--                     status, order_type, subtotal, total, delivery_address,
--                     delivery_city, delivery_zip, delivery_day, notes,
--                     created_at, updated_at
--
-- order_items:        id, order_id, product_id, product_name, size, quantity,
--                     price_cents, created_at
--
-- messages:           id, user_id, subscription_id, type, subject, body,
--                     customer_name, customer_email, created_at
-- ------------------------------------------------------------