-- 021_processing_fee_gross_up.sql
--
-- Switch the processing fee from "2.9% + $0.30 of the product" to a full
-- GROSS-UP, so the business nets the exact product price after Stripe's cut.
--
-- Stripe's 2.9% + $0.30 applies to the whole amount collected, fee line
-- included, so the old fee left the business a few cents short:
--   $12.00 product + $0.65 fee = $12.65 charged; Stripe takes $0.67; net $11.98.
-- Grossed up:
--   charge = ceil( (subtotal + 30) / (1 - 0.029) );  fee = charge - subtotal
--   $12.00 -> charge $12.67, Stripe takes $0.67, net $12.00 exactly.
--   $18.00 -> charge $18.85, net $18.00.
--
-- Mirrors computeProcessingFeeCents() in lib/fees.ts. Exact for standard US
-- cards (2.9% + 30¢); higher-fee cards (Amex/international) still net slightly
-- under.
--
-- Applied to prod as migrations:
--   add_compute_processing_fee_cents_grossup
--   weekly_order_fee_use_grossup_helper
--   skip_state_fee_use_grossup_helper
--
-- NOTE: existing weekly orders were NOT re-priced — they were charged the old
-- $12.65 in Stripe, so their stored total correctly reflects the real charge.
-- Live Stripe subscriptions created before this change still carry the old
-- $0.65/$0.82 recurring fee line and must be updated in Stripe separately (see
-- scripts/update_subscription_fee.mjs) to move onto the corrected amount.

-- Shared fee calculation (gross-up), used by both weekly-order functions.
CREATE OR REPLACE FUNCTION public.compute_processing_fee_cents(p_subtotal integer)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $function$
DECLARE
  v_charge integer;
BEGIN
  IF p_subtotal IS NULL OR p_subtotal <= 0 THEN
    RETURN 0;
  END IF;

  v_charge := ceil((p_subtotal + 30)::numeric / (1 - 0.029))::integer;

  -- Stripe rounds the percentage to the nearest cent; nudge up if that rounding
  -- would leave the net a cent below the subtotal.
  WHILE v_charge - (round(v_charge * 0.029) + 30) < p_subtotal LOOP
    v_charge := v_charge + 1;
  END LOOP;

  RETURN v_charge - p_subtotal;
END;
$function$;

-- create_weekly_delivery_order: online subs get the grossed-up fee; cash = none.
CREATE OR REPLACE FUNCTION public.create_weekly_delivery_order(
  p_subscription_id uuid,
  p_delivery_date text,
  p_status text,
  p_stripe_invoice_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_sub         RECORD;
  v_profile     RECORD;
  v_order_id    uuid;
  v_subtotal    integer;
  v_fee         integer;
BEGIN
  SELECT s.user_id, s.delivery_day, s.stripe_subscription_id, s.jar_collection_interest
  INTO v_sub
  FROM public.subscriptions s
  WHERE s.id = p_subscription_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Subscription not found');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.orders
    WHERE subscription_id = p_subscription_id
      AND delivery_date = p_delivery_date::date
  ) THEN
    RETURN jsonb_build_object('error', null, 'skipped_duplicate', true);
  END IF;

  SELECT address, city, zip, COALESCE(is_cash_customer, false) AS is_cash_customer
  INTO v_profile
  FROM public.profiles
  WHERE id = v_sub.user_id;

  SELECT COALESCE(SUM(price_cents * quantity), 0)
  INTO v_subtotal
  FROM public.subscription_items
  WHERE subscription_id = p_subscription_id;

  v_fee := CASE
             WHEN v_profile.is_cash_customer THEN 0
             ELSE public.compute_processing_fee_cents(v_subtotal)
           END;

  INSERT INTO public.orders (
    user_id, subscription_id, status, order_type, subtotal, total,
    delivery_day, delivery_date, delivery_address, delivery_city, delivery_zip,
    delivery_state, jar_collection, stripe_subscription_id, stripe_invoice_id,
    placed_at, created_at, updated_at
  )
  VALUES (
    v_sub.user_id,
    p_subscription_id,
    p_status,
    'subscription',
    CASE WHEN p_status = 'skipped' THEN 0 ELSE v_subtotal END,
    CASE WHEN p_status = 'skipped' THEN 0 ELSE v_subtotal + v_fee END,
    v_sub.delivery_day,
    p_delivery_date::date,
    v_profile.address,
    v_profile.city,
    v_profile.zip,
    'pending',
    COALESCE(v_sub.jar_collection_interest, false),
    v_sub.stripe_subscription_id,
    NULLIF(p_stripe_invoice_id, ''),
    (p_delivery_date || 'T12:00:00+00')::timestamptz,
    now(),
    now()
  )
  RETURNING id INTO v_order_id;

  IF p_status = 'confirmed' THEN
    INSERT INTO public.order_items (order_id, product_id, product_name, size, quantity, price_cents, created_at)
    SELECT
      v_order_id,
      COALESCE(product_id, 'unknown'),
      COALESCE(product_name, 'Unknown'),
      size,
      quantity,
      COALESCE(price_cents, 0),
      now()
    FROM public.subscription_items
    WHERE subscription_id = p_subscription_id;
  END IF;

  RETURN jsonb_build_object('error', null, 'order_id', v_order_id);
END;
$function$;

-- set_weekly_order_skip_state: same grossed-up fee for confirmed orders.
CREATE OR REPLACE FUNCTION public.set_weekly_order_skip_state(
  p_stripe_subscription_id text,
  p_delivery_date date,
  p_skipped boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order_id        uuid;
  v_subscription_id uuid;
  v_subtotal        integer;
  v_fee             integer;
BEGIN
  SELECT o.id, o.subscription_id
  INTO v_order_id, v_subscription_id
  FROM public.orders o
  WHERE o.stripe_subscription_id = p_stripe_subscription_id
    AND o.delivery_date = p_delivery_date
    AND o.status <> 'cancelled'
  ORDER BY o.created_at ASC
  LIMIT 1;

  IF v_order_id IS NULL THEN
    RETURN jsonb_build_object('error', 'No matching order found', 'order_id', null);
  END IF;

  SELECT COALESCE(SUM(price_cents * quantity), 0)
  INTO v_subtotal
  FROM public.subscription_items
  WHERE subscription_id = v_subscription_id;

  v_fee := public.compute_processing_fee_cents(v_subtotal);

  UPDATE public.orders
  SET status     = CASE WHEN p_skipped THEN 'skipped' ELSE 'confirmed' END,
      subtotal   = CASE WHEN p_skipped THEN 0 ELSE v_subtotal END,
      total      = CASE WHEN p_skipped THEN 0 ELSE v_subtotal + v_fee END,
      updated_at = now()
  WHERE id = v_order_id;

  DELETE FROM public.order_items WHERE order_id = v_order_id;

  IF NOT p_skipped THEN
    INSERT INTO public.order_items (
      order_id, product_id, product_name, size, quantity, price_cents, created_at
    )
    SELECT v_order_id,
           COALESCE(si.product_id, 'unknown'),
           COALESCE(si.product_name, 'Unknown'),
           si.size,
           si.quantity,
           COALESCE(si.price_cents, 0),
           now()
    FROM public.subscription_items si
    WHERE si.subscription_id = v_subscription_id;
  END IF;

  RETURN jsonb_build_object('error', null, 'order_id', v_order_id);
END;
$function$;
