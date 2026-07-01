//app/account/page.tsx

import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import { AccountDashboard } from "@/components/account/account-dashboard"

export default async function AccountPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login")
  }

  // Fetch user's profile (may not exist yet)
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle()

  // Fetch ALL of the user's subscriptions with items
  const { data: subscriptionsRaw } = await supabase
    .from("subscriptions")
    .select(`
      *,
      subscription_items (*)
    `)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })

  // Normalize so subscription_items is always an array and each subscription shape is consistent
  const subscriptions = (subscriptionsRaw ?? []).map((sub) => ({
    ...sub,
    subscription_items: Array.isArray(sub.subscription_items)
      ? sub.subscription_items
      : [],
    delivery_day: sub.delivery_day ?? "thursday",
    cancel_at_period_end: Boolean(sub.cancel_at_period_end),
    current_period_end: sub.current_period_end ?? null,
    status: sub.status ?? "active",
  }))

  // Fetch user's orders
  const { data: ordersRaw } = await supabase
    .from("orders")
    .select(`
      *,
      order_items (*)
    `)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })

  // Fetch any unresolved refund/cancellation requests for this user, so we
  // can flag which orders already have a pending request. This has to be
  // derived server-side from the database — component state alone doesn't
  // survive a page refresh, which was letting customers submit duplicate
  // requests for the same order.
  const { data: pendingRefundMessages } = await supabase
    .from("messages")
    .select("order_id")
    .eq("user_id", user.id)
    .eq("type", "refund_request")
    .neq("status", "resolved")

  const pendingRefundOrderIds = new Set(
    (pendingRefundMessages ?? []).map((m) => m.order_id).filter(Boolean)
  )

  const orders = (ordersRaw ?? []).map((order) => ({
    ...order,
    has_pending_refund_request: pendingRefundOrderIds.has(order.id),
  }))

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1 bg-secondary py-8 md:py-12">
        <div className="mx-auto max-w-6xl px-4 md:px-6">
          <AccountDashboard
            user={user}
            profile={profile}
            subscriptions={subscriptions}
            orders={orders}
          />
        </div>
      </main>
      <Footer />
    </div>
  )
}