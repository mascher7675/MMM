-- 019_fix_weekly_order_skip_state_fee.sql
--
-- Bug fix: some weekly subscription orders showed the bare product price
-- (e.g. $12.00) in the admin Orders tab, while the customer was actually
-- charged product + processing fee (e.g. $12.65) by Stripe.
--
-- Root cause: set_weekly_order_skip_state set a CONFIRMED weekly order's
-- total = subtotal (product price only), stripping off the processing fee that
-- create_weekly_delivery_order had just written. This function runs on EVERY
-- invoice.created webhook, so any weekly order that reached that event lost its
-- fee. Orders that had only been pre-created by invoice.upcoming (which does not
-- call this function) kept the correct $12.65 — hence the mixed display.
--
-- The Jul 27 migration (add_processing_fee_to_weekly_order_total) added the fee
-- to create_weekly_delivery_order but never updated this function to match. Now
-- both compute a confirmed order's total identically:
--   confirmed total = subtotal + (2.9% + $0.30)   [mirrors lib/fees.ts]
--   skipped   total = 0
--
-- Signature is unchanged, so the existing service_role-only EXECUTE grant
-- (see lock_down_webhook_rpcs_to_service_role) is preserved by CREATE OR REPLACE.
--
-- Applied to the remote project as migration
-- `fix_weekly_order_skip_state_includes_processing_fee`. A one-time backfill
-- was also run to correct existing confirmed subscription orders whose total
-- still equalled their subtotal:
--   UPDATE orders SET total = subtotal + round(subtotal*0.029)::int + 30
--   WHERE order_type='subscription' AND status='confirmed'
--     AND subtotal > 0 AND total = subtotal AND stripe_subscription_id IS NOT NULL;

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
  -- Locate the order first (so we can read subscription_id before writing).
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

  -- Price this delivery from the subscription's items as they stand NOW.
  SELECT COALESCE(SUM(price_cents * quantity), 0)
  INTO v_subtotal
  FROM public.subscription_items
  WHERE subscription_id = v_subscription_id;

  -- Processing fee the customer covers on this weekly charge: 2.9% + $0.30.
  -- Mirrors computeProcessingFeeCents() in lib/fees.ts and the identical
  -- calculation in create_weekly_delivery_order, so a confirmed order's total
  -- is the same whichever function last touched it. Zero on empty subtotal.
  v_fee := CASE WHEN v_subtotal > 0 THEN round(v_subtotal * 0.029)::integer + 30 ELSE 0 END;

  UPDATE public.orders
  SET status     = CASE WHEN p_skipped THEN 'skipped' ELSE 'confirmed' END,
      subtotal   = CASE WHEN p_skipped THEN 0 ELSE v_subtotal END,
      -- was: total = v_subtotal (dropped the fee). Now product + fee.
      total      = CASE WHEN p_skipped THEN 0 ELSE v_subtotal + v_fee END,
      updated_at = now()
  WHERE id = v_order_id;

  -- Resync line items: a skipped delivery ships nothing, a confirmed one
  -- carries the subscription's current items.
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
