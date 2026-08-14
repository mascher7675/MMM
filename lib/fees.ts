//lib/fees.ts

// ---------------------------------------------------------------------------
// Processing fee — single source of truth
//
// The customer covers the card-processing cost instead of the business
// absorbing it. Stripe's standard US card fee is 2.9% + $0.30 — but Stripe
// charges that on the FULL amount collected, INCLUDING the fee line itself.
// So a fee computed on the product price alone leaves the business a few cents
// short (fee-on-fee). This function does a full GROSS-UP instead: it returns
// the fee that makes the business net the exact product subtotal after Stripe's
// cut.
//
//   charge = ceil( (subtotal + $0.30) / (1 - 2.9%) )
//   fee    = charge - subtotal
//
// Example: $12.00 product → charge $12.67, Stripe takes $0.67, business nets
// $12.00 exactly (vs. the old $0.65 fee → $12.65 charge → $0.67 taken → $11.98).
//
// Notes:
//  • Exact only for standard US cards (2.9% + 30¢). Amex/international/foreign
//    cards carry higher Stripe fees, so those still net slightly under — no
//    single fee can cover every card type.
//  • For subscriptions the fee is charged as a recurring WEEKLY line item, so
//    every weekly renewal (each its own Stripe charge) carries its own fee.
//  • The fee is computed per Stripe checkout session. A mixed cart is split
//    into two sessions (subscription + one-time), so it incurs two fees —
//    which is why the cart preview sums a fee for each portion separately.
//  • The DB mirrors this in public.compute_processing_fee_cents() (called by
//    create_weekly_delivery_order / set_weekly_order_skip_state) so weekly
//    renewal order totals match what checkout charges. Keep the two in sync.
// ---------------------------------------------------------------------------

export const PROCESSING_FEE_PERCENT = 0.029
export const PROCESSING_FEE_FIXED_CENTS = 30

/** Label shown to the customer wherever the fee appears (cart, Stripe, email). */
export const PROCESSING_FEE_LABEL = "Processing fee"

/** Longer description for the Stripe line item / receipt. */
export const PROCESSING_FEE_DESCRIPTION = "Card processing fee"

/**
 * The processing fee, in cents, for a given product subtotal (in cents).
 * Grossed up so the business nets `subtotalCents` after Stripe's 2.9% + $0.30
 * (which applies to the whole charge, fee included). Returns 0 for an
 * empty/zero subtotal so we never add a bare fee line to an empty batch.
 */
export function computeProcessingFeeCents(subtotalCents: number): number {
  if (subtotalCents <= 0) return 0
  // Gross-up: the fee has to cover Stripe's cut on itself too.
  let charge = Math.ceil((subtotalCents + PROCESSING_FEE_FIXED_CENTS) / (1 - PROCESSING_FEE_PERCENT))
  // Stripe rounds the percentage to the nearest cent; nudge up if that rounding
  // would leave the net a cent below the subtotal.
  while (charge - (Math.round(charge * PROCESSING_FEE_PERCENT) + PROCESSING_FEE_FIXED_CENTS) < subtotalCents) {
    charge++
  }
  return charge - subtotalCents
}
