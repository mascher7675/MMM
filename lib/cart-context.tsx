//lib/cart-context.tsx

"use client"
 
import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { computeProcessingFeeCents } from "@/lib/fees"

export interface CartItem {
  productId: string
  name: string
  size: string
  quantity: number
  priceInCents: number
  image: string
  isSubscription: boolean
}
 
interface CartContextType {
  items: CartItem[]
  addItem: (item: Omit<CartItem, "quantity"> & { quantity?: number }) => void
  removeItem: (productId: string, isSubscription?: boolean) => void
  updateQuantity: (productId: string, quantity: number, isSubscription?: boolean) => void
  clearCart: () => void
  totalItems: number
  totalPriceInCents: number
  /** Card processing fee (2.9% + $0.30) the customer covers at checkout. */
  processingFeeInCents: number
  /** Product subtotal + processing fee — what the customer actually pays. */
  totalWithFeeInCents: number
  isOpen: boolean
  setIsOpen: (open: boolean) => void
  /** null when cart is empty, "mixed" when both types are present */
  cartType: "subscription_only" | "one_time_only" | "mixed" | null
  /** true once localStorage has been read — use to avoid hydration mismatches */
  isLoaded: boolean
}
 
const CartContext = createContext<CartContextType | undefined>(undefined)
 
const CART_STORAGE_KEY = "modern-milk-maid-cart"
 
export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [isLoaded, setIsLoaded] = useState(false)
 
  // Load cart from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(CART_STORAGE_KEY)
    if (stored) {
      try {
        setItems(JSON.parse(stored))
      } catch {
        localStorage.removeItem(CART_STORAGE_KEY)
      }
    }
    setIsLoaded(true)
  }, [])
 
  // Save cart to localStorage when items change
  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items))
    }
  }, [items, isLoaded])
 
  const addItem = (newItem: Omit<CartItem, "quantity"> & { quantity?: number }) => {
    setItems((current) => {
      const existingIndex = current.findIndex(
        (item) => item.productId === newItem.productId && item.isSubscription === newItem.isSubscription
      )
      
      if (existingIndex >= 0) {
        // Previously: `updated[existingIndex].quantity += ...`. That copies
        // the ARRAY but not the item objects inside it — updated[i] is the
        // exact same object reference as current[i]. Harmless in a single
        // production render, but React 18 StrictMode intentionally invokes
        // state updaters twice in dev to surface exactly this class of bug:
        // the first pass mutates the shared object, the second pass reads
        // the already-mutated value as its "before" state and mutates again,
        // so adding one existing item bumps its quantity by 2 locally (server
        // state / a real checkout are unaffected — this is a display-only
        // dev artifact). Spreading the item, not just the array, makes the
        // update immutable so StrictMode's double-invoke is a no-op.
        const updated = [...current]
        updated[existingIndex] = {
          ...updated[existingIndex],
          quantity: updated[existingIndex].quantity + (newItem.quantity || 1),
        }
        return updated
      }
      
      return [...current, { ...newItem, quantity: newItem.quantity || 1 }]
    })
    setIsOpen(true)
  }
 
  const removeItem = (productId: string, isSubscription?: boolean) => {
    setItems((current) =>
      current.filter((item) => {
        if (item.productId !== productId) return true
        if (isSubscription !== undefined) return item.isSubscription !== isSubscription
        return false
      })
    )
  }
 
  const updateQuantity = (productId: string, quantity: number, isSubscription?: boolean) => {
    if (quantity <= 0) {
      removeItem(productId, isSubscription)
      return
    }
    setItems((current) =>
      current.map((item) => {
        if (item.productId !== productId) return item
        if (isSubscription !== undefined && item.isSubscription !== isSubscription) return item
        return { ...item, quantity }
      })
    )
  }
 
  const clearCart = () => {
    setItems([])
    localStorage.removeItem(CART_STORAGE_KEY)
  }
 
  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0)
  const totalPriceInCents = items.reduce((sum, item) => sum + item.priceInCents * item.quantity, 0)
 
  const hasSubscription = items.some((i) => i.isSubscription)
  const hasOneTime = items.some((i) => !i.isSubscription)

  // A mixed cart checks out as two separate Stripe sessions (subscription +
  // one-time), each charged its own processing fee. Mirror that here so the
  // previewed fee matches what's actually charged: compute a fee per portion.
  const subscriptionSubtotal = items.reduce(
    (sum, item) => sum + (item.isSubscription ? item.priceInCents * item.quantity : 0),
    0
  )
  const oneTimeSubtotal = totalPriceInCents - subscriptionSubtotal
  const processingFeeInCents =
    computeProcessingFeeCents(subscriptionSubtotal) + computeProcessingFeeCents(oneTimeSubtotal)
  const totalWithFeeInCents = totalPriceInCents + processingFeeInCents

  const cartType =
    items.length === 0
      ? null
      : hasSubscription && hasOneTime
      ? "mixed"
      : hasSubscription
      ? "subscription_only"
      : "one_time_only"
 
  return (
    <CartContext.Provider
      value={{
        items,
        addItem,
        removeItem,
        updateQuantity,
        clearCart,
        totalItems,
        totalPriceInCents,
        processingFeeInCents,
        totalWithFeeInCents,
        isOpen,
        setIsOpen,
        cartType,
        isLoaded,
      }}
    >
      {children}
    </CartContext.Provider>
  )
}
 
export function useCart() {
  const context = useContext(CartContext)
  if (!context) {
    throw new Error("useCart must be used within a CartProvider")
  }
  return context
}