//app/checkout/success/page.tsx

import { redirect } from "next/navigation"
import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import { Button } from "@/components/ui/button"
import { CheckCircle } from "lucide-react"
import Link from "next/link"
import { saveOrderFromSession } from "@/app/actions/stripe"
import { ClearCartOnSuccess } from "./clear-cart"

type SearchParams = Promise<{
  session_id?: string | string[]
  phase?: string | string[]
}>

export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const params = await searchParams
  const sessionId =
    typeof params.session_id === "string" ? params.session_id : null
  const phase =
    typeof params.phase === "string" ? params.phase : null

  // Always save the order for this session on the server (auth cookies available here)
  let orderCode: string | null = null
  if (sessionId) {
    const result = await saveOrderFromSession(sessionId)
    orderCode = result?.orderCode ?? null
  }

  // Mid-flow: this was phase 1 (subscription) of a mixed cart.
  // Redirect back to /checkout to complete the one-time purchase.
  // The cart is NOT cleared here — one-time items are still needed.
  if (phase === "subscription") {
    redirect("/checkout?returning_from_phase=subscription")
  }

  // Final success: all payments complete — clear cart and show confirmation.
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <ClearCartOnSuccess sessionId={sessionId} />

      <main className="flex flex-1 items-center justify-center bg-secondary/30 px-4 py-16">
        <div className="mx-auto max-w-md text-center">
          <div className="mb-6 inline-flex h-20 w-20 items-center justify-center rounded-full bg-sage/10">
            <CheckCircle className="h-10 w-10 text-sage" />
          </div>

          <h1 className="mb-4 font-serif text-3xl font-medium text-foreground">
            Thank You!
          </h1>

          <p className="mb-2 text-muted-foreground">
            Your order has been confirmed and will be prepared fresh for delivery.
          </p>

          <p className="mb-8 text-sm text-muted-foreground">
            You&apos;ll receive an email confirmation shortly with your order details.
          </p>

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Button asChild>
              <Link href="/account">View your account</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/">Return home</Link>
            </Button>
          </div>

          {orderCode && (
            <p className="mt-8 text-xs text-muted-foreground">
              Order #: {orderCode}
            </p>
          )}
        </div>
      </main>

      <Footer />
    </div>
  )
}