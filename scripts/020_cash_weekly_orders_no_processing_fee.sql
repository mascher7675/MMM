-- 020_cash_weekly_orders_no_processing_fee.sql
--
-- Cash-customer weekly orders must NOT carry a card processing fee. Cash
-- customers pay Emily directly; there is no Stripe charge, so there is no
-- 2.9% + $0.30 to pass on. The Jul 27 migration
-- (add_processing_fee_to_weekly_order_total) added the fee to EVERY weekly
-- order created by create_weekly_delivery_order, including cash ones.
--
-- Fix: compute the processing fee only for online (non-cash) subscriptions.
-- A cash customer's weekly order total = product subtotal.
--
-- Signature unchanged, so the existing service_role-only EXECUTE grant is
-- preserved by CREATE OR REPLACE.
--
-- Applied to the remote project as migration
-- `cash_weekly_orders_no_processing_fee`. No backfill was needed — at apply
-- time there were no existing cash subscription orders.

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

  -- Fetch profile for address AND cash-customer flag (drives whether a fee applies).
  SELECT address, city, zip, COALESCE(is_cash_customer, false) AS is_cash_customer
  INTO v_profile
  FROM public.profiles
  WHERE id = v_sub.user_id;

  SELECT COALESCE(SUM(price_cents * quantity), 0)
  INTO v_subtotal
  FROM public.subscription_items
  WHERE subscription_id = p_subscription_id;

  -- Processing fee (2.9% + $0.30), mirrors computeProcessingFeeCents() in
  -- lib/fees.ts. ONLY for online subscriptions billed through Stripe — cash
  -- customers pay directly with no card fee, so their fee is always 0.
  v_fee := CASE
             WHEN v_profile.is_cash_customer THEN 0
             WHEN v_subtotal > 0 THEN round(v_subtotal * 0.029)::integer + 30
             ELSE 0
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
