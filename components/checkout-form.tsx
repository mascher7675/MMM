//components/checkout-form.tsx

"use client"

import { useCallback, useEffect, useState } from "react"
import { loadStripe } from "@stripe/stripe-js"
import {
  EmbeddedCheckoutProvider,
  EmbeddedCheckout,
} from "@stripe/react-stripe-js"
import { createCheckoutSession } from "@/app/actions/stripe"
import { useCart } from "@/lib/cart-context"
import { CheckoutAddressForm } from "@/components/checkout-address-form"
import { CheckCircle } from "lucide-react"
import { useSearchParams } from "next/navigation"

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!
)

// Key used to persist address data across the mid-flow redirect
const ADDRESS_STORAGE_KEY = "checkout_address_data"

interface AddressData {
  firstName: string
  lastName: string
  phone: string
  address: string
  city: string
  state: string
  zip: string
  deliveryInstructions: string
  deliveryDay?: "thursday" | "friday"
}

interface CheckoutFormProps {
  userId: string | null
  initialAddress?: Partial<AddressData>
}

type PaymentPhase = "subscription" | "one_time"

export function CheckoutForm({ userId, initialAddress }: CheckoutFormProps) {
  const { items, cartType } = useCart()
  const searchParams = useSearchParams()

  const isMixed = cartType === "mixed"
  const subscriptionItems = items.filter((i) => i.isSubscription)
  const oneTimeItems = items.filter((i) => !i.isSubscription)

  const returningFromPhase = searchParams.get("returning_from_phase")
  const initialStep = returningFromPhase === "subscription" ? "payment" : "address"
  const initialPhase: PaymentPhase =
    returningFromPhase === "subscription" ? "one_time" : "subscription"
  const initialSubscriptionPaid = returningFromPhase === "subscription"

  const [step, setStep] = useState<"address" | "payment">(initialStep)
  const [addressData, setAddressData] = useState<AddressData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [paymentPhase, setPaymentPhase] = useState<PaymentPhase>(initialPhase)
  const [subscriptionPaid, setSubscriptionPaid] = useState(initialSubscriptionPaid)

  // ── Restore address data after the mid-flow redirect ───────────────────────
  // When the user is returning from completing the subscription payment (phase 1),
  // the component mounts fresh and addressData is null. We persist it in
  // sessionStorage before the redirect so the delivery_day is not lost.
  useEffect(() => {
    if (returningFromPhase === "subscription") {
      try {
        const stored = sessionStorage.getItem(ADDRESS_STORAGE_KEY)
        if (stored) {
          const parsed: AddressData = JSON.parse(stored)
          setAddressData(parsed)
        }
      } catch {
        console.error("Failed to restore address data from sessionStorage")
      }
    }
  }, [returningFromPhase])

  const handleAddressComplete = (data: AddressData) => {
    // Persist to sessionStorage so it survives the phase-1 → phase-2 redirect
    try {
      sessionStorage.setItem(ADDRESS_STORAGE_KEY, JSON.stringify(data))
    } catch {
      console.error("Failed to persist address data to sessionStorage")
    }
    setAddressData(data)
    setStep("payment")
  }

  const makeFetchSecret = useCallback(
    (phase: PaymentPhase | "simple") => async () => {
      const batch =
        phase === "simple"
          ? items
          : phase === "subscription"
          ? subscriptionItems
          : oneTimeItems

      if (batch.length === 0) throw new Error("No items in batch")

      const cartItemsPayload = batch.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        isSubscription: item.isSubscription,
      }))

      const returnUrlSuffix =
        phase === "subscription" && isMixed ? "&phase=subscription" : ""

      // For the one_time phase after a redirect, addressData may have just been
      // restored from sessionStorage asynchronously. Fall back to reading
      // sessionStorage directly here as a safety net.
      let deliveryDay = addressData?.deliveryDay
      if (!deliveryDay && phase === "one_time") {
        try {
          const stored = sessionStorage.getItem(ADDRESS_STORAGE_KEY)
          if (stored) {
            const parsed: AddressData = JSON.parse(stored)
            deliveryDay = parsed.deliveryDay
          }
        } catch {
          // ignore
        }
      }

      const result = await createCheckoutSession(
        cartItemsPayload,
        window.location.origin,
        returnUrlSuffix,
        deliveryDay   // ← delivery day correctly flows into session metadata
      )

      if (result.error || !result.clientSecret) {
        setError(result.error || "Failed to initialize checkout")
        throw new Error(result.error || "Failed to initialize checkout")
      }

      return result.clientSecret
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, isMixed, addressData]
  )

  const fetchSimpleSecret = useCallback(
    () => makeFetchSecret("simple")(),
    [makeFetchSecret]
  )
  const fetchSubscriptionSecret = useCallback(
    () => makeFetchSecret("subscription")(),
    [makeFetchSecret]
  )
  const fetchOneTimeSecret = useCallback(
    () => makeFetchSecret("one_time")(),
    [makeFetchSecret]
  )

  // ── Empty cart ──────────────────────────────────────────────────────────────
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-lg text-muted-foreground">Your cart is empty</p>
        <a href="/shop" className="mt-4 text-sage hover:underline">
          Continue shopping
        </a>
      </div>
    )
  }

  // ── Error ───────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-lg text-destructive">{error}</p>
        <button onClick={() => setError(null)} className="mt-4 text-sage hover:underline">
          Try again
        </button>
      </div>
    )
  }

  // ── Step 1: Address ─────────────────────────────────────────────────────────
  if (step === "address") {
    return (
      <CheckoutAddressForm
        userId={userId}
        initialData={initialAddress}
        onComplete={handleAddressComplete}
        hasSubscriptionItems={items.some((item) => item.isSubscription)}
      />
    )
  }

  // ── Step 2: Payment — simple (all one type) ─────────────────────────────────
  if (!isMixed) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => setStep("address")}
          className="text-sm text-sage hover:underline"
        >
          ← Edit delivery address
        </button>

        <div id="checkout" className="min-h-100">
          <EmbeddedCheckoutProvider
            stripe={stripePromise}
            options={{ fetchClientSecret: fetchSimpleSecret }}
          >
            <EmbeddedCheckout />
          </EmbeddedCheckoutProvider>
        </div>
      </div>
    )
  }

  // ── Step 2: Payment — mixed cart (two phases) ───────────────────────────────
  return (
    <div className="space-y-6">
      {!subscriptionPaid && (
        <button
          onClick={() => setStep("address")}
          className="text-sm text-sage hover:underline"
        >
          ← Edit delivery address
        </button>
      )}

      <div className="rounded-lg border border-border bg-secondary/30 p-4">
        <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Your order has two parts
        </p>
        <div className="flex items-center gap-3">
          <div
            className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
              subscriptionPaid
                ? "bg-sage text-white"
                : paymentPhase === "subscription"
                ? "bg-foreground text-background"
                : "bg-border text-muted-foreground"
            }`}
          >
            {subscriptionPaid ? <CheckCircle className="h-4 w-4" /> : "1"}
          </div>
          <span className="text-sm">
            {!subscriptionPaid ? (
              <>
                Step 1 of 2: Pay for your{" "}
                <span className="font-medium text-foreground">
                  {subscriptionItems.length} subscription item
                  {subscriptionItems.length !== 1 ? "s" : ""}
                </span>{" "}
                — then we'll move to your one-time purchase.
              </>
            ) : (
              <>
                <span className="font-medium text-sage">Subscription confirmed.</span>{" "}
                Now completing payment for{" "}
                <span className="font-medium text-foreground">
                  {oneTimeItems.length} one-time item
                  {oneTimeItems.length !== 1 ? "s" : ""}
                </span>
                .
              </>
            )}
          </span>
        </div>
      </div>

      {paymentPhase === "subscription" && (
        <div id="checkout-subscription" className="min-h-100">
          <EmbeddedCheckoutProvider
            stripe={stripePromise}
            options={{ fetchClientSecret: fetchSubscriptionSecret }}
          >
            <EmbeddedCheckout />
          </EmbeddedCheckoutProvider>
        </div>
      )}

      {paymentPhase === "one_time" && (
        <div id="checkout-onetime" className="min-h-100">
          <EmbeddedCheckoutProvider
            stripe={stripePromise}
            options={{ fetchClientSecret: fetchOneTimeSecret }}
          >
            <EmbeddedCheckout />
          </EmbeddedCheckoutProvider>
        </div>
      )}
    </div>
  )
}