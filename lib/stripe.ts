//lib/stripe.ts

import 'server-only'

import Stripe from 'stripe'

let _stripe: Stripe | null = null

function getStripeClient(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2026-02-25.clover',
    })
  }
  return _stripe
}

// Proxy so existing call sites (stripe.refunds.create, stripe.subscriptions.update, etc.)
// keep working unchanged, while the real Stripe client isn't constructed until it's
// actually used at runtime — not at module import / build time.
export const stripe = new Proxy({} as Stripe, {
  get(_target, prop, receiver) {
    const client = getStripeClient()
    const value = Reflect.get(client as object, prop, receiver)
    return typeof value === 'function' ? value.bind(client) : value
  },
})