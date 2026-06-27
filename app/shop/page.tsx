//app/shop/page.tsx
 
"use client"
 
import { useEffect, useState } from "react"
import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import { ProductCard } from "@/components/product-card"
import { CashCustomerBanner } from "@/components/cash-customer-banner"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Calendar } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
 
export default function ShopPage() {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
 
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user)
      setLoading(false)
    })
  }, [])
 
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        {/* Hero */}
        <section className="border-b border-border/50 bg-secondary py-16 md:py-20">
          <div className="mx-auto max-w-6xl px-4 md:px-6">
            <div className="mx-auto max-w-2xl text-center">
              <p className="mb-4 text-sm uppercase tracking-[0.25em] text-blue">
                One-Time Purchase
              </p>
              <h1 className="font-serif text-4xl font-medium tracking-tight text-foreground md:text-5xl">
                Shop Our Milk
              </h1>
              <p className="mt-4 text-lg text-muted-foreground">
                Try our fresh plant-based milk with a one-time order. 
                No commitment required.
              </p>
            </div>
 
            {/* Delivery Days Notice */}
            <div className="mx-auto mt-8 max-w-xl">
              <div className="flex items-center justify-center gap-3 rounded-lg border border-sage/20 bg-sage/5 p-4">
                <Calendar className="h-5 w-5 shrink-0 text-sage" />
                <p className="text-sm text-foreground">
                  <strong>Delivery Days:</strong> We deliver our milk fresh, the same day it's made. As of right now, deliveries are available on Thursdays and Fridays.
                </p>
              </div>
            </div>
 
            {/* Subscription upsell */}
            <div className="mx-auto mt-10 max-w-xl">
              <div className="rounded-lg border border-border bg-background p-6 text-center">
                <p className="text-sm text-muted-foreground">
                  Want weekly deliveries?
                </p>
                <Button variant="link" asChild className="mt-1 h-auto p-0 text-sage">
                  <Link href="/subscribe">Switch to a subscription</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
 
        {/* Products Grid */}
        <section className="bg-background py-16 md:py-20">
          <div className="mx-auto max-w-6xl px-4 md:px-6">
            <h2 className="font-serif text-2xl font-medium text-foreground md:text-3xl">
              Select Your Milk
            </h2>
            <p className="mt-2 text-muted-foreground">
              Fresh, handcrafted non-dairy milk in reusable glass jars.
            </p>
 
            <div className="mt-10 grid gap-8 sm:grid-cols-2">
              {/* Mobile: green/blue/green/blue — Desktop: green/blue/blue/green */}
              <ProductCard milkType="oat"    isSubscription={false} accentColor="green" />
              <ProductCard milkType="almond" isSubscription={false} accentColor="blue"  />
              <ProductCard milkType="hemp"   isSubscription={false} accentColor="blue"  />
              <ProductCard milkType="cashew" isSubscription={false} accentColor="green" />
            </div>
 
            {!loading && !user && (
              <div className="mt-12 text-center">
                <p className="mb-4 text-sm text-muted-foreground">
                  Create an account to place your order and track deliveries.
                </p>
                <Button size="lg" asChild className="bg-foreground px-8 text-background hover:bg-foreground/90">
                  <Link href="/auth/sign-up">Create Account & Order</Link>
                </Button>
              </div>
            )}
 
            {/* Cash customer callout */}
            <CashCustomerBanner />
          </div>
        </section>
      </main>
      <Footer />
    </div>
  )
}