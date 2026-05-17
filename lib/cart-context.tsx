//lib/cart-context.tsx

"use client"
 
import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
 
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
  isOpen: boolean
  setIsOpen: (open: boolean) => void
  /** null when cart is empty, "mixed" when both types are present */
  cartType: "subscription_only" | "one_time_only" | "mixed" | null
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
        const updated = [...current]
        updated[existingIndex].quantity += newItem.quantity || 1
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
        isOpen,
        setIsOpen,
        cartType,
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