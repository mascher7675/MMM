// components/checkout-page-client.tsx

"use client"

import Image from "next/image"
import { X } from "lucide-react"
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
  const { items, totalPriceInCents, removeItem } = useCart()

  const formatPrice = (cents: number) => `$${(cents / 100).toFixed(2)}`

  return (
    <div className="grid gap-8 lg:grid-cols-5">
      {/* Order Summary */}
      <div className="lg:col-span-2">
        <div className="rounded-lg border border-border bg-card p-6">
          <h2 className="mb-4 font-serif text-xl font-medium">Order Summary</h2>

          <div className="space-y-4">
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Your cart is empty. Add some items before checking out.
              </p>
            ) : (
              items.map((item) => (
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