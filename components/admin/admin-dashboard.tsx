// components/admin/admin-dashboard.tsx
"use client"

import { useState } from "react"
import { TrendingUp, ShoppingBag, Repeat, Users, MessageSquare, Truck } from "lucide-react"
import { OverviewTab } from "./overview-tab"
import { OrdersTab } from "./orders-tab"
import { SubscriptionsTab } from "./subscriptions-tab"
import { CustomersTab } from "./customers-tab"
import { MessagesTab } from "./messages-tab"
import { DeliveryTab } from "./delivery-tab"
import type { AdminStats, AdminTab } from "./admin-types"
import type { AdminCustomer, AdminOrder, AdminSubscription, AdminMessage } from "@/app/actions/admin"

interface Props {
  adminName: string
  stats: AdminStats
  customers: AdminCustomer[]
  orders: AdminOrder[]
  subscriptions: AdminSubscription[]
  messages: AdminMessage[]
}

export function AdminDashboard({ adminName, stats, customers, orders, subscriptions, messages }: Props) {
  const [tab, setTab] = useState<AdminTab>("overview")

  const tabs: { id: AdminTab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: "overview",      label: "Overview",      icon: <TrendingUp className="h-4 w-4" /> },
    { id: "orders",        label: "Orders",        icon: <ShoppingBag className="h-4 w-4" />, badge: orders.filter(o => o.delivery_state === "pending").length },
    {
      id: "subscriptions",
      label: "Subscriptions",
      icon: <Repeat className="h-4 w-4" />,
      badge: subscriptions.filter(s => s.status === "active").length,
    },
    { id: "customers",     label: "Customers",     icon: <Users className="h-4 w-4" /> },
    { id: "messages",      label: "Messages",      icon: <MessageSquare className="h-4 w-4" />, badge: stats.unreadMessages || undefined },
    { id: "delivery",      label: "Delivery",      icon: <Truck className="h-4 w-4" /> },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <p className="text-sm uppercase tracking-[0.2em] text-[#7C9885]">Admin Panel</p>
        <h1 className="mt-1 font-serif text-3xl font-medium text-foreground">
          Welcome back, {adminName}
        </h1>
        <p className="text-sm text-muted-foreground">Modern Milk Maid — Business Dashboard</p>
      </div>

      {/* Tab nav */}
      <div className="flex flex-wrap gap-1 rounded-xl border border-border bg-secondary/50 p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`cursor-pointer relative flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
              tab === t.id
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.icon}
            {t.label}
            {t.badge != null && t.badge > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#7C9885] px-1 text-[10px] font-bold text-white">
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "overview"      && <OverviewTab stats={stats} orders={orders} subscriptions={subscriptions} messages={messages} />}
      {tab === "orders"        && <OrdersTab orders={orders} />}
      {tab === "subscriptions" && <SubscriptionsTab subscriptions={subscriptions} />}
      {tab === "customers"     && <CustomersTab customers={customers} />}
      {tab === "messages"      && <MessagesTab messages={messages} />}
      {tab === "delivery"      && <DeliveryTab />}
    </div>
  )
}