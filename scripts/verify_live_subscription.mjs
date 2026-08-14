// scripts/verify_live_subscription.mjs
//
// Read-only check of a real (live-mode) subscription's Stripe billing.
// Prints only amounts/dates — no secrets. Does not modify anything.
//
// Usage (PowerShell), with your LIVE secret key set for this command only:
//   $env:STRIPE_SECRET_KEY="sk_live_..."; node scripts/verify_live_subscription.mjs sub_XXXX
//
// Or pass a subscription id as the first arg. If omitted it lists recent subs.

import Stripe from "stripe"

const key = process.env.STRIPE_SECRET_KEY
if (!key) {
  console.error("Set STRIPE_SECRET_KEY (live) in your environment first.")
  process.exit(1)
}
console.log("Stripe mode:", key.startsWith("sk_live") ? "LIVE" : "TEST")
const stripe = new Stripe(key)

const subId = process.argv[2]

async function dumpSub(id) {
  const sub = await stripe.subscriptions.retrieve(id, { expand: ["items.data.price"] })
  console.log(`\n=== SUBSCRIPTION ${sub.id} — status ${sub.status} ===`)
  console.log("Recurring line items (what renews each week):")
  for (const it of sub.items.data) {
    console.log(`   $${(it.price.unit_amount / 100).toFixed(2)} / ${it.price.recurring?.interval}  (product ${it.price.product})`)
  }
  const invs = await stripe.invoices.list({ subscription: id, limit: 24, expand: ["data.payments"] })
  console.log("\nInvoices (oldest → newest):")
  for (const inv of invs.data.reverse()) {
    const paid = inv.amount_paid / 100
    const total = inv.total / 100
    const lines = inv.lines.data.map((l) => `$${(l.amount / 100).toFixed(2)}`).join(" + ")
    // Resolve payment_intent under both modern (payments list) and legacy shapes.
    const pi =
      inv.payments?.data?.map((p) => p.payment?.payment_intent).find(Boolean) ??
      inv.payment_intent ??
      null
    const piId = typeof pi === "string" ? pi : pi?.id ?? "—"
    const iso = (u) => (u ? new Date(u * 1000).toISOString().replace(".000Z", "Z") : "—")
    const linePeriod = inv.lines.data[0]?.period
    console.log(
      `   ${new Date(inv.created * 1000).toISOString().slice(0, 10)}  ${inv.billing_reason.padEnd(20)} ` +
        `total $${total.toFixed(2)}  paid $${paid.toFixed(2)}  [${lines}]  ${inv.status}`
    )
    console.log(`        invoice ${inv.id}   payment_intent ${piId}`)
    console.log(
      `        created=${iso(inv.created)}  period_start=${iso(inv.period_start)}  period_end=${iso(inv.period_end)}` +
        (linePeriod ? `  line_period=${iso(linePeriod.start)}..${iso(linePeriod.end)}` : "")
    )
  }
}

if (subId) {
  await dumpSub(subId)
} else {
  const subs = await stripe.subscriptions.list({ limit: 20, status: "all" })
  console.log(`\n${subs.data.length} subscription(s):`)
  for (const s of subs.data) {
    console.log(`   ${s.id}  ${s.status}  created ${new Date(s.created * 1000).toISOString().slice(0, 10)}`)
  }
  console.log("\nRe-run with a subscription id to see its line items + invoices.")
}
