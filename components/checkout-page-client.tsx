// components/checkout-page-client.tsx

"use client"

import Image from "next/image"
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
}

interface CheckoutPageClientProps {
  userId: string | null
  initialAddress?: Partial<AddressData>
}

export function CheckoutPageClient({ userId, initialAddress }: CheckoutPageClientProps) {
  const { items, totalPriceInCents } = useCart()

  const formatPrice = (cents: number) => `$${(cents / 100).toFixed(2)}`

  return (
    <div className="grid gap-8 lg:grid-cols-5">
      {/* Order Summary */}
      <div className="lg:col-span-2">
        <div className="rounded-lg border border-border bg-card p-6">
          <h2 className="mb-4 font-serif text-xl font-medium">Order Summary</h2>

          <div className="space-y-4">
            {items.map((item) => (
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
                    <span className="text-xs text-sage">Monthly subscription</span>
                  )}
                </div>
                <p className="font-medium">
                  {formatPrice(item.priceInCents * item.quantity)}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-6 border-t border-border pt-4">
            <div className="flex justify-between text-lg font-medium">
              <span>Total</span>
              <span>{formatPrice(totalPriceInCents)}</span>
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
          <CheckoutForm userId={userId} initialAddress={initialAddress} />
        </div>
      </div>
    </div>
  )
}