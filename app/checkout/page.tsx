// app/checkout/page.tsx

import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import { CheckoutPageClient } from "@/components/checkout-page-client"
import { createClient } from "@/lib/supabase/server"

export default async function CheckoutPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  let userId: string | null = null
  let initialAddress = undefined
  let existingDeliveryDay: "thursday" | "friday" | null = null

  if (user) {
    userId = user.id

    const { data: profile } = await supabase
      .from("profiles")
      .select("first_name, last_name, phone, address, city, state, zip, delivery_instructions")
      .eq("id", user.id)
      .maybeSingle()

    // Seed the jar-collection toggle from the customer's existing preference so
    // a prior "yes" stays on. Prefer their active subscription's standing
    // preference; fall back to whatever their most recent order had.
    let jarCollectionInterest = false
    const { data: activeSub } = await supabase
      .from("subscriptions")
      .select("jar_collection_interest, delivery_day")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    // If the customer already has a live subscription, a NEW subscription must
    // land on the same delivery day so everything is delivered together (and
    // merges cleanly into their one account panel). This locks the checkout
    // day picker to that weekday.
    if (activeSub?.delivery_day === "thursday" || activeSub?.delivery_day === "friday") {
      existingDeliveryDay = activeSub.delivery_day
    }

    if (activeSub?.jar_collection_interest != null) {
      jarCollectionInterest = activeSub.jar_collection_interest
    } else {
      const { data: lastOrder } = await supabase
        .from("orders")
        .select("jar_collection")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()

      if (lastOrder?.jar_collection != null) {
        jarCollectionInterest = lastOrder.jar_collection
      }
    }

    if (profile) {
      initialAddress = {
        firstName: profile.first_name || "",
        lastName: profile.last_name || "",
        phone: profile.phone || "",
        address: profile.address || "",
        city: profile.city || "",
        state: profile.state || "NY",
        zip: profile.zip || "",
        deliveryInstructions: profile.delivery_instructions || "",
        jarCollectionInterest,
      }
    } else {
      // No saved profile yet, but still carry the preference through.
      initialAddress = { jarCollectionInterest }
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1 bg-secondary/30">
        <div className="mx-auto max-w-6xl px-4 py-12 md:px-6">
          <h1 className="mb-8 font-serif text-3xl font-medium text-foreground md:text-4xl">
            Checkout
          </h1>
          <CheckoutPageClient userId={userId} initialAddress={initialAddress} existingDeliveryDay={existingDeliveryDay} />
        </div>
      </main>
      <Footer />
    </div>
  )
}