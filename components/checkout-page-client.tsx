// components/checkout-page-client.tsx

"use client"

import { Suspense } from "react"
import Image from "next/image"
import { X } from "lucide-react"
import { useSearchParams } from "next/navigation"
import { useCart } from "@/lib/cart-context"
import { CheckoutForm } from "@/components/checkout-form"

interface AddressData {
  firstName: string
  lastName: string
  phone: string
  address: string
  city: string
  state: string
  zip: string
  deliveryInstructions: string
  jarCollectionInterest?: boolean
}

interface CheckoutPageClientProps {
  userId: string | null
  initialAddress?: Partial<AddressData>
}

/**
 * Wraps the real component in Suspense because it reads useSearchParams()
 * (below) — required by Next's App Router so this doesn't force the whole
 * route to opt out of static rendering. No fallback content needed: the
 * parent Server Component (app/checkout/page.tsx) already calls
 * supabase.auth.getUser(), which reads cookies and makes the page dynamic on
 * every request, so this boundary should resolve immediately in practice.
 */
export function CheckoutPageClient(props: CheckoutPageClientProps) {
  return (
    <Suspense fallback={null}>
      <CheckoutPageClientInner {...props} />
    </Suspense>
  )
}

function CheckoutPageClientInner({ userId, initialAddress }: CheckoutPageClientProps) {
  const { items, totalPriceInCents, removeItem } = useCart()
  const searchParams = useSearchParams()

  // Mixed-cart checkout pays in two Stripe sessions: the subscription item
  // first, then the one-time items. Between the two, the browser round-trips
  // through /checkout/success (which redirects back here with
  // ?returning_from_phase=subscription) before the second payment. Reading
  // the SAME param checkout-form.tsx already reads for that leg — not a new
  // signal, just consuming it here too — so this stays correct without this
  // file needing to know anything about checkout-form's internal state.
  //
  // Previously, the summary here was phase-blind: it always rendered the
  // FULL cart and its combined total. During the phase-2 return, that showed
  // the already-paid subscription item — with a live remove button, and a
  // "Total" that included money already charged — sitting right next to a
  // Stripe frame that was only ever going to charge the one-time remainder.
  // A customer paying $20 would see "Total $50" next to it.
  const isReturningFromSubscriptionPhase =
    searchParams.get("returning_from_phase") === "subscription"

  const displayItems = isReturningFromSubscriptionPhase
    ? items.filter((item) => !item.isSubscription)
    : items

  const displayTotalInCents = isReturningFromSubscriptionPhase
    ? displayItems.reduce((sum, item) => sum + item.priceInCents * item.quantity, 0)
    : totalPriceInCents

  const formatPrice = (cents: number) => `$${(cents / 100).toFixed(2)}`

  return (
    <div className="grid gap-8 lg:grid-cols-5">
      {/* Order Summary */}
      <div className="lg:col-span-2">
        <div className="rounded-lg border border-border bg-card p-6">
          <h2 className="mb-4 font-serif text-xl font-medium">Order Summary</h2>

          {isReturningFromSubscriptionPhase && (
            <div className="mb-4 rounded-md border border-sage/30 bg-sage/5 px-3 py-2 text-sm text-muted-foreground">
              Your subscription payment is complete. Finish checkout below to pay for the remaining one-time items.
            </div>
          )}

          <div className="space-y-4">
            {displayItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {isReturningFromSubscriptionPhase
                  ? "No one-time items remaining — you're all set."
                  : "Your cart is empty. Add some items before checking out."}
              </p>
            ) : (
              displayItems.map((item) => (
                <div
                  key={`${item.productId}-${item.isSubscription}`}
                  className="flex gap-4"
                >
                  <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md bg-secondary">
                    <Image
                      src={item.image || "/placeholder.svg"}
                      alt={item.name}
                      fill
                      className="object-cover"
                    />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-medium text-foreground">{item.name}</h4>
                    <p className="text-sm text-muted-foreground">
                      {item.size} x {item.quantity}
                    </p>
                    {item.isSubscription && (
                      <span className="text-xs text-sage">Weekly subscription</span>
                    )}
                  </div>
                  <div className="flex flex-col items-end justify-between">
                    <button
                      type="button"
                      onClick={() => removeItem(item.productId, item.isSubscription)}
                      aria-label={`Remove ${item.name} from order`}
                      className="text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                    <p className="font-medium">
                      {formatPrice(item.priceInCents * item.quantity)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="mt-6 border-t border-border pt-4">
            <div className="flex justify-between text-lg font-medium">
              <span>Total</span>
              <span>{formatPrice(displayTotalInCents)}</span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              (Delivery included & tax free)
            </p>
          </div>
        </div>
      </div>

      {/* Checkout Form */}
      <div className="lg:col-span-3">
        <div className="rounded-lg border border-border bg-card p-6">
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Add items to your cart to continue checking out.
            </p>
          ) : (
            <CheckoutForm userId={userId} initialAddress={initialAddress} />
          )}
        </div>
      </div>
    </div>
  )
}