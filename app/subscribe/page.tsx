//app/subscribe/page.tsx

import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import { ProductCard } from "@/components/product-card"
import { CashCustomerBanner } from "@/components/cash-customer-banner"
import { Button } from "@/components/ui/button"
import { Check, Calendar } from "lucide-react"
import Link from "next/link"

const benefits = [
  "Fresh milk delivered weekly to your door",
  "Cancel anytime, no commitment",
  "Free jar return & reuse program",
  "Billed monthly for convenience",
]

export default function SubscribePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        {/* Hero */}
        <section className="border-b border-border/50 bg-secondary py-16 md:py-20">
          <div className="mx-auto max-w-6xl px-4 md:px-6">
            <div className="mx-auto max-w-2xl text-center">
              <p className="mb-4 text-sm uppercase tracking-[0.25em] text-sage">
                Monthly Subscription
              </p>
              <h1 className="font-serif text-4xl font-medium tracking-tight text-foreground md:text-5xl">
                Fresh Milk, Delivered Weekly
              </h1>
              <p className="mt-4 text-lg text-muted-foreground">
                Subscribe for weekly deliveries of fresh plant-based milk. 
                Choose your delivery day and cancel anytime.
              </p>
            </div>

            {/* Delivery Days Notice */}
            <div className="mx-auto mt-8 max-w-xl">
              <div className="flex items-center justify-center gap-3 rounded-lg border border-sage/20 bg-sage/5 p-4">
                <Calendar className="h-5 w-5 shrink-0 text-sage" />
                <p className="text-sm text-foreground">
                  <strong>Delivery Days:</strong> We deliver our milk fresh, the same day it's made. As of now, deliveries are available on Thursdays and Fridays.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Products Grid */}
        <section className="bg-background py-16 md:py-20">
          <div className="mx-auto max-w-6xl px-4 md:px-6">
            <h2 className="font-serif text-2xl font-medium text-foreground md:text-3xl">
              Choose Your Milks
            </h2>
            <p className="mt-2 text-muted-foreground">
              Select your weekly milk delivery. Billed monthly.
            </p>

            <div className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
              <ProductCard milkType="oat" isSubscription />
              <ProductCard milkType="almond" isSubscription />
              <ProductCard milkType="hemp" isSubscription />
            </div>

            {/* Cash customer callout */}
            <CashCustomerBanner />
          </div>
        </section>
      </main>
      <Footer />
    </div>
  )
}