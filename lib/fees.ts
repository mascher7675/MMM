//lib/fees.ts

// ---------------------------------------------------------------------------
// Processing fee — single source of truth
//
// The customer covers the card-processing cost instead of the business
// absorbing it. This mirrors Stripe's standard US card fee exactly:
//
//   fee = 2.9% of the product subtotal + $0.30 fixed
//
// Notes:
//  • This is NOT a full "gross-up": Stripe also takes its cut on the fee
//    line itself, so the business still eats a few cents of fee-on-fee. That
//    was the explicit choice ("exact Stripe" over "net the full amount").
//  • For subscriptions the fee is charged as a recurring WEEKLY line item, so
//    every weekly renewal (each its own Stripe charge) carries its own fee.
//  • The fee is computed per Stripe checkout session. A mixed cart is split
//    into two sessions (subscription + one-time), so it incurs two fees —
//    which is why the cart preview sums a fee for each portion separately.
// ---------------------------------------------------------------------------

export const PROCESSING_FEE_PERCENT = 0.029
export const PROCESSING_FEE_FIXED_CENTS = 30

/** Label shown to the customer wherever the fee appears (cart, Stripe, email). */
export const PROCESSING_FEE_LABEL = "Processing fee"

/** Longer description for the Stripe line item / receipt. */
export const PROCESSING_FEE_DESCRIPTION = "Card processing fee"

/**
 * The processing fee, in cents, for a given product subtotal (in cents).
 * Returns 0 for an empty/zero subtotal so we never add a bare $0.30 line to
 * an empty batch.
 */
export function computeProcessingFeeCents(subtotalCents: number): number {
  if (subtotalCents <= 0) return 0
  return Math.round(subtotalCents * PROCESSING_FEE_PERCENT) + PROCESSING_FEE_FIXED_CENTS
}
