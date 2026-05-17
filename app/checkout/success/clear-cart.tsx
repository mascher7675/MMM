//app/checkout/success/clear-cart.tsx

"use client"

import { useEffect, useRef } from "react"
import { useCart } from "@/lib/cart-context"

export function ClearCartOnSuccess({ sessionId }: { sessionId: string | null }) {
  const { clearCart } = useCart()
  const hasCleared = useRef(false)

  useEffect(() => {
    if (!sessionId || hasCleared.current) return
    clearCart()
    hasCleared.current = true
  }, [sessionId, clearCart])

  return null
}
