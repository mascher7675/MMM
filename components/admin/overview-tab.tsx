// components/admin/overview-tab.tsx
"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Users, ShoppingBag, Repeat, MessageSquare, DollarSign, TrendingUp } from "lucide-react"
import { fmt, fmtDate, STATUS_COLORS, MSG_TYPE_LABEL } from "./admin-types"
import type { AdminStats } from "./admin-types"
import type { AdminOrder, AdminSubscription, AdminMessage } from "@/app/actions/admin"

const OVERVIEW_LIMIT = 5

interface Props {
  stats: AdminStats
  orders: AdminOrder[]
  subscriptions: AdminSubscription[]
  messages: AdminMessage[]
}

export function OverviewTab({ stats, orders, messages }: Props) {
  const kpis = [
    { label: "Total Customers",      value: stats.totalCustomers,      icon: <Users className="h-5 w-5" />,         color: "text-blue-600" },
    { label: "Active Subscriptions", value: stats.activeSubscriptions, icon: <Repeat className="h-5 w-5" />,        color: "text-[#7C9885]" },
    { label: "Orders This Week",     value: stats.weeklyOrders,        icon: <ShoppingBag className="h-5 w-5" />,   color: "text-purple-600" },
    { label: "Unread Messages",      value: stats.unreadMessages,      icon: <MessageSquare className="h-5 w-5" />, color: "text-orange-500" },
    { label: "Weekly Revenue",       value: fmt(stats.weeklyRevenue),  icon: <DollarSign className="h-5 w-5" />,    color: "text-emerald-600", isString: true },
    { label: "All-Time Revenue",     value: fmt(stats.allTimeRevenue), icon: <TrendingUp className="h-5 w-5" />,    color: "text-[#7C9885]",   isString: true },
  ]

  const recentOrders = orders.slice(0, OVERVIEW_LIMIT)

  const unreadMessages = messages.filter(m => m.status === "unread")
  const shownMessages = unreadMessages.slice(0, OVERVIEW_LIMIT)
  const hiddenMessageCount = unreadMessages.length - shownMessages.length

  return (
    <div className="space-y-6">
      {/* KPI grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardContent className="flex items-center gap-4 p-6">
              <div className={`rounded-full bg-secondary p-3 ${k.color}`}>{k.icon}</div>
              <div>
                <p className="text-sm text-muted-foreground">{k.label}</p>
                <p className="text-2xl font-semibold text-foreground">{k.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent orders */}
        <Card>
          <CardHeader><CardTitle className="font-serif text-lg">Recent Orders</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {recentOrders.length === 0 && <p className="text-sm text-muted-foreground">No orders yet.</p>}
            {recentOrders.map((o) => (
              <div key={o.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <p className="text-sm font-medium">{o.customer_name}</p>
                  <p className="text-xs text-muted-foreground">#{o.id.slice(-8).toUpperCase()} · {fmtDate(o.created_at)}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold">{fmt(o.total)}</p>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_COLORS[o.status] ?? "bg-secondary text-muted-foreground"}`}>
                    {o.status}
                  </span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Unread messages */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="font-serif text-lg">Unread Messages</CardTitle>
              {unreadMessages.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  Showing {shownMessages.length} of {unreadMessages.length}
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {shownMessages.length === 0 && <p className="text-sm text-muted-foreground">All caught up! ✓</p>}
            {shownMessages.map((m) => (
              <div key={m.id} className="rounded-lg border border-border p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">{m.customer_name || "Unknown"}</p>
                  <div className="flex items-center gap-1.5">
                    {m.type !== "contact" && (
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground">
                        {MSG_TYPE_LABEL[m.type] ?? m.type}
                      </span>
                    )}
                    {m.type === "contact" && (
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {!m.user_id ? "Homepage" : "Account"}
                      </span>
                    )}
                  </div>
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{m.body}</p>
                <p className="mt-1 text-[10px] text-muted-foreground">{fmtDate(m.created_at)}</p>
              </div>
            ))}
            {hiddenMessageCount > 0 && (
              <p className="pt-1 text-center text-xs text-muted-foreground">
                + {hiddenMessageCount} more — view all in the Messages tab
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}