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

  if (user) {
    userId = user.id

    const { data: profile } = await supabase
      .from("profiles")
      .select("first_name, last_name, phone, address, city, state, zip, delivery_instructions")
      .eq("id", user.id)
      .maybeSingle()

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
      }
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
          <CheckoutPageClient userId={userId} initialAddress={initialAddress} />
        </div>
      </main>
      <Footer />
    </div>
  )
}