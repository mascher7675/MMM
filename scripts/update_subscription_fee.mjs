// scripts/update_subscription_fee.mjs
//
// Update the recurring "Processing fee" line item on a live Stripe subscription
// to a new amount (e.g. move it from $0.65 to the grossed-up $0.67). The fee
// item is detected as the subscription item with the SMALLEST unit_amount (the
// fee is always far less than the milk line).
//
// DRY RUN by default — it prints what it WOULD change and stops. Pass --apply
// to actually write. Proration is disabled, so the 2¢ change takes effect on
// the next renewal with no mid-cycle adjustment.
//
// Usage (PowerShell), with your LIVE key set for this command only:
//   # preview:
//   $env:STRIPE_SECRET_KEY="sk_live_..."; node scripts/update_subscription_fee.mjs sub_XXXX 67
//   # apply:
//   $env:STRIPE_SECRET_KEY="sk_live_..."; node scripts/update_subscription_fee.mjs sub_XXXX 67 --apply

import Stripe from "stripe"

const key = process.env.STRIPE_SECRET_KEY
if (!key) {
  console.error("Set STRIPE_SECRET_KEY (live) in your environment first.")
  process.exit(1)
}
const subId = process.argv[2]
const newFeeCents = parseInt(process.argv[3], 10)
const apply = process.argv.includes("--apply")

if (!subId || !Number.isInteger(newFeeCents)) {
  console.error("Usage: node scripts/update_subscription_fee.mjs <sub_id> <newFeeCents> [--apply]")
  process.exit(1)
}

console.log("Stripe mode:", key.startsWith("sk_live") ? "LIVE" : "TEST")
const stripe = new Stripe(key)

const sub = await stripe.subscriptions.retrieve(subId, { expand: ["items.data.price"] })
console.log(`\nSubscription ${sub.id} — status ${sub.status}`)
console.log("Current line items:")
for (const it of sub.items.data) {
  console.log(`   item ${it.id}  $${(it.price.unit_amount / 100).toFixed(2)}/${it.price.recurring?.interval}  product ${it.price.product}`)
}

// Fee line = smallest unit_amount.
const feeItem = sub.items.data.reduce((min, it) =>
  it.price.unit_amount < min.price.unit_amount ? it : min
)

console.log(
  `\nDetected fee line: item ${feeItem.id}  ` +
    `$${(feeItem.price.unit_amount / 100).toFixed(2)} -> $${(newFeeCents / 100).toFixed(2)}`
)

if (feeItem.price.unit_amount >= 500) {
  console.error("Refusing: smallest line item is >= $5.00, that doesn't look like the fee. Aborting.")
  process.exit(1)
}
if (feeItem.price.unit_amount === newFeeCents) {
  console.log("Fee already at target amount. Nothing to do.")
  process.exit(0)
}

if (!apply) {
  console.log("\nDRY RUN — re-run with --apply to make this change.")
  process.exit(0)
}

// Checkout creates each fee line with an inline product (product_data), and
// Stripe marks those ad-hoc products inactive afterward — so we can't attach a
// new price to the OLD product. Unlike checkout sessions, subscription
// price_data accepts only an existing `product` id (no inline product_data), so
// create a fresh active "Processing fee" product first, then point the new
// price at it.
const feeProduct = await stripe.products.create({ name: "Processing fee" })
console.log(`Created fee product ${feeProduct.id}`)

const updated = await stripe.subscriptions.update(subId, {
  items: [
    {
      id: feeItem.id,
      price_data: {
        currency: feeItem.price.currency,
        product: feeProduct.id,
        unit_amount: newFeeCents,
        recurring: { interval: feeItem.price.recurring.interval },
      },
    },
  ],
  proration_behavior: "none",
})

console.log("\nDone. New line items:")
const fresh = await stripe.subscriptions.retrieve(updated.id, { expand: ["items.data.price"] })
for (const it of fresh.data?.items?.data ?? fresh.items.data) {
  console.log(`   $${(it.price.unit_amount / 100).toFixed(2)}/${it.price.recurring?.interval}`)
}
