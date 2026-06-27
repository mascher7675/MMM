//components/cart-drawer.tsx
 
"use client"
 
import { useCart } from "@/lib/cart-context"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Minus, Plus, ShoppingBag, Trash2, X } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
 
export function CartDrawer() {
  const { items, isOpen, setIsOpen, removeItem, updateQuantity, totalPriceInCents, totalItems, isLoaded } = useCart()
 
  const formatPrice = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`
  }
 
  // Don't render cart contents until localStorage has been read on the client.
  // This prevents the server-rendered empty cart from mismatching the
  // client-hydrated cart, which is the most common source of hydration errors.
  if (!isLoaded) return null
 
  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetContent className="flex w-full flex-col sm:max-w-md">
        <SheetHeader className="border-b border-border pb-4">
          <SheetTitle className="flex items-center gap-2 font-serif text-xl font-medium">
            <ShoppingBag className="h-5 w-5" />
            Your Cart ({totalItems})
          </SheetTitle>
        </SheetHeader>
 
        {items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
            <div className="rounded-full bg-secondary p-6">
              <ShoppingBag className="h-10 w-10 text-muted-foreground" />
            </div>
            <div>
              <p className="font-serif text-lg font-medium">Your cart is empty</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Add some fresh milk to get started
              </p>
            </div>
            <Button asChild onClick={() => setIsOpen(false)}>
              <Link href="/shop">Shop Now</Link>
            </Button>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto py-4">
              <div className="space-y-4">
                {items.map((item) => (
                  <div
                    key={`${item.productId}-${item.isSubscription}`}
                    className="flex gap-4 rounded-lg border border-border bg-card p-3"
                  >
                    <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-md bg-secondary">
                      <Image
                        src={item.image || "/placeholder.svg"}
                        alt={item.name}
                        fill
                        className="object-cover"
                      />
                    </div>
                    <div className="flex flex-1 flex-col">
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="font-medium text-foreground">{item.name}</h4>
                          <p className="text-sm text-muted-foreground">{item.size}</p>
                          {item.isSubscription && (
                            <span className="mt-1 inline-block rounded-full bg-sage/10 px-2 py-0.5 text-xs font-medium text-sage">
                              Weekly Subscription
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => removeItem(item.productId, item.isSubscription)}
                          className="text-muted-foreground transition-colors hover:text-destructive"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="mt-auto flex items-center justify-between pt-2">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => updateQuantity(item.productId, item.quantity - 1, item.isSubscription)}
                            className="flex h-7 w-7 items-center justify-center rounded-full border border-border transition-colors hover:bg-secondary"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="w-6 text-center text-sm font-medium">{item.quantity}</span>
                          <button
                            onClick={() => updateQuantity(item.productId, item.quantity + 1, item.isSubscription)}
                            className="flex h-7 w-7 items-center justify-center rounded-full border border-border transition-colors hover:bg-secondary"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                        <p className="font-medium text-foreground">
                          {formatPrice(item.priceInCents * item.quantity)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
 
            <div className="space-y-4 border-t border-border pt-4 pb-6">
              <div className="flex items-center justify-between px-2">
                <span className="text-base text-muted-foreground">Subtotal</span>
                <span className="text-xl font-semibold">{formatPrice(totalPriceInCents)}</span>
              </div>
              
              <p className="px-2 text-center text-xs text-muted-foreground">
                Delivery included
              </p>
              
              <div className="space-y-3 px-2">
                <Button asChild className="w-full" size="lg" onClick={() => setIsOpen(false)}>
                  <Link href="/checkout">Proceed to Checkout</Link>
                </Button>
                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={() => setIsOpen(false)}
                >
                  Continue Shopping
                </Button>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
 
export function CartButton() {
  const { setIsOpen, totalItems, isLoaded } = useCart()
 
  return (
    <button
      onClick={() => setIsOpen(true)}
      className="relative flex items-center justify-center"
      aria-label="Open cart"
    >
      <ShoppingBag className="h-5 w-5" />
      {isLoaded && totalItems > 0 && (
        <span className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-sage text-xs font-medium text-sage-foreground">
          {totalItems > 9 ? "9+" : totalItems}
        </span>
      )}
    </button>
  )
}