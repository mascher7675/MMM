// app/admin/page.tsx
// ─── Server component ────────────────────────────────────────────────────────
// Route: /admin   — admin-only, redirects non-admins back to /account

import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import { AdminDashboard } from "@/components/admin/admin-dashboard"
import {
  getAdminStats,
  getAdminCustomers,
  getAdminOrders,
  getAdminSubscriptions,
  getAdminMessages,
} from "@/app/actions/admin"

export default async function AdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect("/auth/login")

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, first_name")
    .eq("id", user.id)
    .single()

  if (profile?.role !== "admin") redirect("/account")

  // Fetch all data in parallel
  const [stats, customers, orders, subscriptions, messages] = await Promise.all([
    getAdminStats(),
    getAdminCustomers(),
    getAdminOrders(100),
    getAdminSubscriptions(),
    getAdminMessages(),
  ])

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1 bg-secondary/30 py-8 md:py-12">
        <div className="mx-auto max-w-7xl px-4 md:px-6">
          <AdminDashboard
            adminName={profile?.first_name ?? "Admin"}
            stats={stats}
            customers={customers.data}
            orders={orders.data}
            subscriptions={subscriptions.data}
            messages={messages.data}
          />
        </div>
      </main>
      <Footer />
    </div>
  )
}