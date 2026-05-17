// components/admin/orders-tab.tsx
"use client"

import { useState, useTransition, useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import { ChevronDown, ChevronUp, MapPin, Check, CalendarClock, Package, ChevronLeft, ChevronRight, XCircle, RefreshCw, ExternalLink, Search, X, Trash2, AlertTriangle } from "lucide-react"

import {
  updateOrderStatus,
  updateOrderAdminNotes,
  upsertSubscriptionDeliveryLog,
  cancelAndRefundOrder,
  deleteOrphanedOrder,
} from "@/app/actions/admin"
import { fmt, fmtDate, DELIVERY_STATE_LABELS, STATUS_COLORS } from "./admin-types"
import type { AdminOrder, SubscriptionDeliveryLog } from "@/app/actions/admin"

interface Props {
  orders: AdminOrder[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Given the order's placed_at (first delivery of a 4-week billing cycle)
 *  return all 4 weekly delivery dates as YYYY-MM-DD strings.
 *  Used only as a fallback for orders that pre-date the delivery_dates column. */
function getSubscriptionDeliveryDates(placedAt: string): string[] {
  const first = new Date(placedAt)
  first.setHours(12, 0, 0, 0)
  return [0, 7, 14, 21].map((offset) => {
    const d = new Date(first)
    d.setDate(d.getDate() + offset)
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, "0")
    const dd = String(d.getDate()).padStart(2, "0")
    return `${yyyy}-${mm}-${dd}`
  })
}

/**
 * Resolve the 4 delivery dates for a subscription order.
 * Prefers the explicitly stored subscription_delivery_dates (which stay accurate
 * even after the user changes their delivery day), and falls back to computing
 * them from placed_at for older orders that pre-date the delivery_dates column.
 */
function resolveDeliveryDates(order: AdminOrder): string[] {
  if (
    Array.isArray(order.subscription_delivery_dates) &&
    order.subscription_delivery_dates.length > 0
  ) {
    return order.subscription_delivery_dates
  }
  if (order.placed_at) {
    return getSubscriptionDeliveryDates(order.placed_at)
  }
  return []
}

function fmtShortDate(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
  })
}

function isDatePast(iso: string): boolean {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return new Date(iso + "T12:00:00") < today
}

function isDateToday(iso: string): boolean {
  const d = new Date(iso + "T12:00:00")
  const today = new Date()
  return (
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()
  )
}

const DELIVERY_STATES = [
  { value: "pending",          label: "Pending" },
  { value: "preparing",        label: "Preparing" },
  { value: "out_for_delivery", label: "Out for Delivery" },
  { value: "delivered",        label: "Delivered" },
  { value: "failed",           label: "Failed" },
]

// ---------------------------------------------------------------------------
// Delete Orphaned Order Modal
// ---------------------------------------------------------------------------
interface DeleteOrphanedModalProps {
  order: AdminOrder
  onClose: () => void
  onDeleted: (id: string) => void
}

function DeleteOrphanedModal({ order, onClose, onDeleted }: DeleteOrphanedModalProps) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  const handleDelete = () => {
    setError(null)
    startTransition(async () => {
      const result = await deleteOrphanedOrder(order.id)
      if (result.error) {
        setError(result.error)
      } else {
        onDeleted(order.id)
        onClose()
      }
    })
  }

  if (!mounted) return null

  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)" }} onClick={onClose} />
      <div style={{ position: "relative", zIndex: 1, width: "100%", maxWidth: "24rem", borderRadius: "0.75rem", background: "var(--card)", border: "1px solid var(--border)", padding: "1.5rem", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "2.5rem", height: "2.5rem", borderRadius: "9999px", background: "#fee2e2", flexShrink: 0 }}>
            <AlertTriangle style={{ width: "1.25rem", height: "1.25rem", color: "#dc2626" }} />
          </div>
          <div>
            <p style={{ fontWeight: 600, fontSize: "0.95rem" }}>Delete Order</p>
            <p style={{ fontSize: "0.75rem", color: "var(--muted-foreground)" }}>This cannot be undone</p>
          </div>
        </div>
        <p style={{ fontSize: "0.875rem", marginBottom: "0.25rem" }}>
          Permanently delete order <strong>#{(order.order_code ?? order.id.slice(-5)).toUpperCase()}</strong>?
        </p>
        <p style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", marginBottom: "1rem" }}>
          The customer account was deleted. This removes the orphaned order and its items from the database.
        </p>
        {error && (
          <div style={{ marginBottom: "0.75rem", padding: "0.5rem 0.75rem", borderRadius: "0.5rem", border: "1px solid #fecaca", background: "#fef2f2", fontSize: "0.75rem", color: "#b91c1c" }}>
            {error}
          </div>
        )}
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            onClick={onClose}
            disabled={isPending}
            style={{ flex: 1, padding: "0.5rem 1rem", borderRadius: "0.5rem", border: "1px solid var(--border)", background: "transparent", fontSize: "0.875rem", fontWeight: 500, cursor: "pointer" }}
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={isPending}
            style={{ flex: 1, padding: "0.5rem 1rem", borderRadius: "0.5rem", border: "none", background: "#e05c6b", color: "#fff", fontSize: "0.875rem", fontWeight: 500, cursor: isPending ? "not-allowed" : "pointer", opacity: isPending ? 0.6 : 1 }}
          >
            {isPending ? "Deleting…" : "Yes, Delete"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}


// ---------------------------------------------------------------------------
// Orders Tab
// ---------------------------------------------------------------------------

export function OrdersTab({ orders: initialOrders }: Props) {
  const [orders, setOrders] = useState(initialOrders)

  const [expanded, setExpanded]               = useState<Set<string>>(new Set())
  const [notesOpen, setNotesOpen]             = useState<Set<string>>(new Set())
  const [editNotes, setEditNotes]             = useState<Record<string, string>>({})
  const [optimisticNotes, setOptimisticNotes] = useState<Record<string, string>>({})
  const [notesSaving, setNotesSaving]         = useState<Record<string, boolean>>({})
  const [notesSaved, setNotesSaved]           = useState<Record<string, boolean>>({})
  const [notesError, setNotesError]           = useState<Record<string, string>>({})

  const [optimisticLogs, setOptimisticLogs] = useState<Record<string, string>>({})
  const [logSaving, setLogSaving]           = useState<Record<string, boolean>>({})

  // Cancel & refund state
  const [cancelConfirm, setCancelConfirm] = useState<Set<string>>(new Set())
  const [cancelLoading, setCancelLoading] = useState<Set<string>>(new Set())
  const [cancelResult, setCancelResult]   = useState<Record<string, { refunded: boolean; error: string | null }>>({})

  // Delete orphaned state
  const [deleteModalOrder, setDeleteModalOrder] = useState<AdminOrder | null>(null)

  const [, startTransition] = useTransition()
  const [filter, setFilter]           = useState<string>("all")
  const [page, setPage]               = useState(1)
  const [searchQuery, setSearchQuery] = useState("")
  const PAGE_SIZE = 20

  const toggleNotes = (id: string) => {
    const next = new Set(notesOpen)
    next.has(id) ? next.delete(id) : next.add(id)
    setNotesOpen(next)
  }

  const toggle = (id: string) => {
    const next = new Set(expanded)
    next.has(id) ? next.delete(id) : next.add(id)
    setExpanded(next)
  }

  const logKey = (orderId: string, date: string) => `${orderId}__${date}`

  const getLogState = (
    orderId: string,
    date: string,
    logs: SubscriptionDeliveryLog[]
  ): string => {
    const key = logKey(orderId, date)
    if (optimisticLogs[key] !== undefined) return optimisticLogs[key]
    return logs.find((l) => l.delivery_date === date)?.delivery_state ?? "pending"
  }

  const handleLogStateChange = async (
    orderId: string,
    deliveryDate: string,
    newState: string
  ) => {
    const key = logKey(orderId, deliveryDate)
    setOptimisticLogs((prev) => ({ ...prev, [key]: newState }))
    setLogSaving((prev) => ({ ...prev, [key]: true }))
    await upsertSubscriptionDeliveryLog(orderId, deliveryDate, newState)
    setLogSaving((prev) => ({ ...prev, [key]: false }))
  }

  const handleSaveNotes = async (orderId: string, currentNotes: string) => {
    setNotesSaving((prev) => ({ ...prev, [orderId]: true }))
    setNotesSaved((prev) => ({ ...prev, [orderId]: false }))
    setNotesError((prev) => ({ ...prev, [orderId]: "" }))
    const result = await updateOrderAdminNotes(orderId, currentNotes)
    setNotesSaving((prev) => ({ ...prev, [orderId]: false }))
    if (result.error) {
      setNotesError((prev) => ({ ...prev, [orderId]: result.error ?? "Failed to save" }))
    } else {
      setOptimisticNotes((prev) => ({ ...prev, [orderId]: currentNotes }))
      setNotesSaved((prev) => ({ ...prev, [orderId]: true }))
      setTimeout(() => setNotesSaved((prev) => ({ ...prev, [orderId]: false })), 2500)
    }
  }

  // ── Cancel & Refund handlers ──────────────────────────────────────────────
  const requestCancelConfirm = (orderId: string) => {
    const next = new Set(cancelConfirm)
    next.add(orderId)
    setCancelConfirm(next)
  }

  const dismissCancelConfirm = (orderId: string) => {
    const next = new Set(cancelConfirm)
    next.delete(orderId)
    setCancelConfirm(next)
  }

  const handleCancelAndRefund = async (orderId: string, hasStripe: boolean) => {
    const loading = new Set(cancelLoading)
    loading.add(orderId)
    setCancelLoading(loading)
    const confirm = new Set(cancelConfirm)
    confirm.delete(orderId)
    setCancelConfirm(confirm)

    const result = await cancelAndRefundOrder(orderId)

    const done = new Set(cancelLoading)
    done.delete(orderId)
    setCancelLoading(done)

    setCancelResult((prev) => ({
      ...prev,
      [orderId]: { refunded: result.refunded, error: result.error },
    }))
  }

  // ── Delete orphaned handler ───────────────────────────────────────────────
  const handleDeleted = (id: string) => {
    setOrders((prev) => prev.filter((o) => o.id !== id))
  }

  // Always sort newest-first by when the order was placed
  const sorted = [...orders].sort((a, b) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )

  // Search by order # (order_code or last 5 of id), then apply filter
  const searched = searchQuery.trim()
    ? sorted.filter((o) => {
        const q = searchQuery.trim().replace(/^#/, "").toUpperCase()
        const code = (o.order_code ?? o.id.slice(-5)).toUpperCase()
        return code.includes(q)
      })
    : sorted

  const filtered = filter === "all" ? searched : searched.filter((o) =>
    filter === "subscription" ? o.order_type === "subscription" :
    filter === "one_time"     ? o.order_type === "one_time" :
    filter === "cash"         ? o.is_cash_customer === true :
    filter === "online"       ? o.is_cash_customer === false :
    (o.delivery_state) === filter
  )

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const changeFilter = (f: string) => { setFilter(f); setPage(1) }
  const handleSearch = (q: string) => { setSearchQuery(q); setPage(1) }

  return (
    <div className="space-y-4">

      {/* Delete orphaned modal */}
      {deleteModalOrder && (
        <DeleteOrphanedModal
          order={deleteModalOrder}
          onClose={() => setDeleteModalOrder(null)}
          onDeleted={handleDeleted}
        />
      )}

      {/* ── Search by Order # ── */}
      <div className="flex items-center gap-2 w-56 rounded-md border border-input bg-background px-3 py-1.5 shadow-sm focus-within:ring-2 focus-within:ring-[#7C9885]/40 focus-within:border-[#7C9885]">
        <Search className="shrink-0 h-3.5 w-3.5 text-muted-foreground" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Search order #…"
          className="flex-1 min-w-0 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
        {searchQuery && (
          <button onClick={() => handleSearch("")} className="shrink-0 text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* ── Filter pills ── */}
      <div className="flex flex-wrap gap-2">
        {["all", "pending", "out_for_delivery", "delivered", "subscription", "one_time", "cash", "online"].map((f) => (
          <button
            key={f}
            onClick={() => changeFilter(f)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              filter === f
                ? "bg-[#7C9885] text-white"
                : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
          >
            {f === "out_for_delivery" ? "Out for Delivery" :
             f === "one_time" ? "One Time" :
             f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
        <span className="ml-auto text-sm text-muted-foreground">
          {filtered.length} order{filtered.length !== 1 ? "s" : ""}
          {totalPages > 1 && ` · page ${safePage} of ${totalPages}`}
        </span>
      </div>

      {filtered.length === 0 && (
        <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
          {searchQuery
            ? `No orders found matching "#${searchQuery.replace(/^#/, "")}".`
            : "No orders match this filter."}
        </div>
      )}

      {paginated.map((order) => {
        const isOpen           = expanded.has(order.id)
        const displayNotes     = optimisticNotes[order.id] ?? order.admin_notes ?? ""
        const currentEditNotes = editNotes[order.id] ?? displayNotes
        const isSubscription   = order.order_type === "subscription"
        const typeLabel        = isSubscription ? "Subscription" : "One Time"
        const paymentLabel     = order.is_cash_customer ? "Cash" : "Online"
        const isOrphaned       = order.customer_name === "Deleted Customer"

        // Resolve 4 delivery dates — prefer stored, fall back to computed from placed_at
        const subDates = isSubscription ? resolveDeliveryDates(order) : []
        const today = new Date(); today.setHours(0, 0, 0, 0)
        const remaining = subDates.filter((d) => !isDatePast(d) || isDateToday(d)).length

        const oneTimeState = order.delivery_state ?? "pending"
        const ds           = DELIVERY_STATE_LABELS[oneTimeState] ?? DELIVERY_STATE_LABELS.pending
        const isDelivered  = oneTimeState === "delivered"
        const isCancelled  = order.status === "cancelled" || oneTimeState === "cancelled"

        const subCurrentWeekDate = subDates.find((d) => !isDatePast(d) || isDateToday(d))
        const subCurrentState    = subCurrentWeekDate
          ? getLogState(order.id, subCurrentWeekDate, order.delivery_logs ?? [])
          : "pending"
        const subDs    = DELIVERY_STATE_LABELS[subCurrentState] ?? DELIVERY_STATE_LABELS.pending
        const badgeDs  = isSubscription ? subDs : ds

        const allSubDelivered = isSubscription && subDates.length === 4 &&
          subDates.every((d) => getLogState(order.id, d, order.delivery_logs ?? []) === "delivered")

        // Cancel & refund state for this order
        const isConfirmingCancel = cancelConfirm.has(order.id)
        const isCancelling       = cancelLoading.has(order.id)
        const cancelRes          = cancelResult[order.id]
        const hasStripePayment   = !!order.stripe_payment_intent_id
        // Show the cancel button for one-time, non-cancelled, non-orphaned orders
        const showCancelButton   = !isSubscription && !isCancelled && !isOrphaned

        return (
          <div
            key={order.id}
            className={`overflow-hidden rounded-lg border bg-card transition-colors ${
              isOrphaned
                ? "border-red-200 bg-red-50/30"
                : isCancelled
                  ? "border-gray-200 bg-gray-50/50 dark:border-gray-700 dark:bg-gray-900/20"
                  : (!isSubscription && isDelivered) || allSubDelivered
                    ? "border-emerald-200 bg-emerald-50/30"
                    : "border-border"
            }`}
          >
            <button
              onClick={() => toggle(order.id)}
              className="flex w-full items-center gap-4 p-4 text-left hover:bg-secondary/30 transition-colors"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">#{order.order_code ?? order.id.slice(-5).toUpperCase()}</span>
                  <span className="text-sm text-muted-foreground">
                    {order.customer_name}
                  </span>
                  {isOrphaned ? (
                    <span className="rounded-full border border-red-300 bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700">
                      Deleted
                    </span>
                  ) : (
                    <>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_COLORS[order.status] ?? "bg-gray-100 text-gray-700"}`}>
                        {order.status}
                      </span>
                      {isCancelled && order.refund_amount_cents != null && (
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                          Refunded {fmt(order.refund_amount_cents)}
                        </span>
                      )}
                    </>
                  )}
                </div>

                <div className="mt-0.5 text-xs text-muted-foreground flex flex-wrap items-center gap-x-1">
                  <span>{typeLabel}</span>
                  <span>·</span>
                  <span>{paymentLabel}</span>
                  <span>·</span>
                  <span>{fmtDate(order.created_at)}</span>
                  {isSubscription && subDates.length > 0 && (
                    <>
                      <span>·</span>
                      <span className={remaining > 0 ? "text-[#7C9885] font-medium" : "text-muted-foreground/60"}>
                        {remaining > 0 ? `${remaining} of 4 deliveries left` : "all 4 delivered"}
                      </span>
                    </>
                  )}
                  {displayNotes && (
                    <>
                      <span>·</span>
                      <span className="text-[#5A81A5] font-semibold">Note</span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="font-semibold">{fmt(order.total)}</p>
                  {!isOrphaned && (
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${badgeDs.color}`}>
                      {badgeDs.label}
                    </span>
                  )}
                </div>
                {isOpen
                  ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </div>
            </button>

            {isOpen && (
              <div className="border-t border-border bg-secondary/20 p-4 space-y-4">

                {/* Items */}
                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Items</p>
                  <div className="space-y-1">
                    {order.order_items.map((item) => (
                      <div key={item.id} className="flex justify-between text-sm">
                        <span>{item.product_name} × {item.quantity}</span>
                        <span className="font-medium">{fmt(item.price_cents)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* ── Stripe Link ── */}
                {(order.stripe_subscription_id || order.stripe_payment_intent_id || order.stripe_session_id) && (
                  <div>
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Stripe</p>
                    <div className="flex flex-wrap gap-2">
                      {isSubscription ? (
                        /* Subscription orders: only the subscription link is useful */
                        order.stripe_subscription_id && (
                          <a
                            href={`https://dashboard.stripe.com/subscriptions/${order.stripe_subscription_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-md border border-[#635BFF]/30 bg-[#635BFF]/5 px-3 py-1.5 text-xs font-medium text-[#635BFF] transition-colors hover:bg-[#635BFF]/10"
                          >
                            <ExternalLink className="h-3 w-3" />
                            View Subscription
                          </a>
                        )
                      ) : (
                        /* One-time orders: prefer the payment intent; fall back to checkout session */
                        order.stripe_payment_intent_id ? (
                          <a
                            href={`https://dashboard.stripe.com/payments/${order.stripe_payment_intent_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-md border border-[#635BFF]/30 bg-[#635BFF]/5 px-3 py-1.5 text-xs font-medium text-[#635BFF] transition-colors hover:bg-[#635BFF]/10"
                          >
                            <ExternalLink className="h-3 w-3" />
                            View Payment
                          </a>
                        ) : order.stripe_session_id ? (
                          <a
                            href={`https://dashboard.stripe.com/checkout/sessions/${order.stripe_session_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-md border border-[#635BFF]/30 bg-[#635BFF]/5 px-3 py-1.5 text-xs font-medium text-[#635BFF] transition-colors hover:bg-[#635BFF]/10"
                          >
                            <ExternalLink className="h-3 w-3" />
                            View Checkout Session
                          </a>
                        ) : null
                      )}
                    </div>
                  </div>
                )}

                {/* ── SUBSCRIPTION: per-week delivery tracker ── */}
                {isSubscription && subDates.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Weekly Deliveries
                      <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold normal-case ${
                        remaining > 0
                          ? "bg-[#7C9885]/15 text-[#7C9885]"
                          : "bg-secondary text-muted-foreground"
                      }`}>
                        {remaining} / 4 remaining
                      </span>
                    </p>

                    <div className="space-y-2">
                      {subDates.map((date, i) => {
                        const isPast    = isDatePast(date) && !isDateToday(date)
                        const isToday   = isDateToday(date)
                        const state     = getLogState(order.id, date, order.delivery_logs ?? [])
                        const stateInfo = DELIVERY_STATE_LABELS[state] ?? DELIVERY_STATE_LABELS.pending
                        const key       = logKey(order.id, date)
                        const saving    = logSaving[key] ?? false

                        return (
                          <div
                            key={date}
                            className={`rounded-lg border p-3 transition-colors ${
                              isToday
                                ? "border-[#7C9885]/50 bg-[#7C9885]/5"
                                : isPast
                                  ? "border-border bg-secondary/30 opacity-75"
                                  : "border-border bg-card"
                            }`}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                  Week {i + 1}
                                </span>
                                <span className={`text-xs font-medium ${isToday ? "text-[#7C9885]" : "text-foreground"}`}>
                                  {fmtShortDate(date)}
                                  {isToday && <span className="ml-1 text-[#7C9885]">· Today</span>}
                                </span>
                              </div>
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${stateInfo.color}`}>
                                {saving ? "Saving…" : stateInfo.label}
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {DELIVERY_STATES.map(({ value, label }) => (
                                <button
                                  key={value}
                                  disabled={saving || state === value}
                                  onClick={() => handleLogStateChange(order.id, date, value)}
                                  className={`rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                                    state === value
                                      ? "bg-[#7C9885] text-white border-[#7C9885]"
                                      : "bg-secondary text-muted-foreground hover:bg-secondary/80 hover:text-foreground border-transparent"
                                  } disabled:cursor-default`}
                                >
                                  {label}
                                </button>
                              ))}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* ── SUBSCRIPTION: Next Delivery ── */}
                {isSubscription && order.subscription_next_delivery_date && (
                  <div>
                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Next Delivery</p>
                    <p className="text-sm flex items-center gap-1.5">
                      <CalendarClock className="h-3.5 w-3.5 text-[#7C9885]" />
                      <span className="text-[#7C9885] font-medium">
                        {new Date(order.subscription_next_delivery_date + "T12:00:00").toLocaleDateString("en-US", {
                          weekday: "long", month: "long", day: "numeric", year: "numeric",
                        })}
                      </span>
                    </p>
                  </div>
                )}

                {/* ── ONE-TIME: Delivery Date ── */}
                {!isSubscription && (order.delivery_date || order.placed_at) && (
                  <div>
                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Delivery Date</p>
                    <p className="text-sm flex items-center gap-1.5">
                      <Package className="h-3.5 w-3.5 text-muted-foreground" />
                      {order.delivery_date
                        ? new Date(order.delivery_date + "T12:00:00").toLocaleDateString("en-US", {
                            weekday: "long", month: "long", day: "numeric", year: "numeric",
                          })
                        : new Date(order.placed_at!).toLocaleDateString("en-US", {
                            weekday: "long", month: "long", day: "numeric", year: "numeric",
                          })}
                    </p>
                  </div>
                )}

                {/* Address */}
                {order.delivery_address && (
                  <div>
                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Delivery Address</p>
                    <p className="text-sm flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                      {order.delivery_address}, {order.delivery_city} {order.delivery_zip}
                    </p>
                  </div>
                )}

                {/* ── ONE-TIME: Delivery Status (hidden when cancelled or orphaned) ── */}
                {!isSubscription && !isCancelled && !isOrphaned && (
                  <div>
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Delivery Status</p>
                    <div className="flex flex-wrap gap-1.5">
                      {DELIVERY_STATES.map(({ value, label }) => (
                        <button
                          key={value}
                          onClick={() =>
                            startTransition(() => {
                              void import("@/app/actions/admin").then(({ updateOrderDeliveryState }) =>
                                updateOrderDeliveryState(order.id, value)
                              )
                            })
                          }
                          className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                            oneTimeState === value
                              ? "bg-[#7C9885] text-white border-[#7C9885]"
                              : "bg-secondary text-muted-foreground hover:bg-secondary/80 hover:text-foreground border-transparent"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Cancellation info */}
                {isCancelled && (
                  <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-900/30">
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      This order was cancelled
                      {order.cancelled_at && <> on {fmtDate(order.cancelled_at)}</>}.
                    </p>
                    {order.refund_amount_cents != null && (
                      <p className="mt-1 text-xs text-blue-700 dark:text-blue-400">
                        Refund issued: {fmt(order.refund_amount_cents)}
                        {order.stripe_refund_id && (
                          <span className="ml-1 text-gray-400">({order.stripe_refund_id})</span>
                        )}
                      </p>
                    )}
                    {order.refund_amount_cents == null && order.stripe_payment_intent_id == null && (
                      <p className="mt-1 text-xs text-muted-foreground">Cash/manual order — no Stripe refund.</p>
                    )}
                  </div>
                )}

                {/* Order Status */}
                {!isOrphaned && (
                  <div>
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Order Status</p>
                    <select
                      defaultValue={order.status}
                      onChange={(e) => startTransition(() => { void updateOrderStatus(order.id, e.target.value) })}
                      className="rounded-md border border-border bg-card px-3 py-1.5 text-xs"
                    >
                      {["pending", "confirmed", "cancelled"].map((s) => (
                        <option key={s} value={s}>
                          {s.charAt(0).toUpperCase() + s.slice(1)}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* ── Admin Notes ── */}
                {!isOrphaned && (
                  <div>
                    <div className="mb-1.5 flex items-center justify-between">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Admin Notes</p>
                      <button
                        onClick={() => toggleNotes(order.id)}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {notesOpen.has(order.id) ? "Close" : displayNotes ? "Edit" : "+ Add"}
                      </button>
                    </div>

                    {!notesOpen.has(order.id) && displayNotes && (
                      <p className="text-sm text-muted-foreground whitespace-pre-line">{displayNotes}</p>
                    )}

                    {notesOpen.has(order.id) && (
                      <div className="space-y-2">
                        <textarea
                          rows={3}
                          value={currentEditNotes}
                          onChange={(e) => setEditNotes((prev) => ({ ...prev, [order.id]: e.target.value }))}
                          placeholder="Internal notes visible only to admins…"
                          className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#7C9885]"
                        />
                        <div className="flex items-center gap-2">
                          <button
                            disabled={notesSaving[order.id]}
                            onClick={() => handleSaveNotes(order.id, currentEditNotes)}
                            className="flex items-center gap-1.5 rounded-lg bg-[#7C9885] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#6a8673] disabled:opacity-50 transition-colors"
                          >
                            {notesSaving[order.id]
                              ? <><RefreshCw className="h-3 w-3 animate-spin" /> Saving…</>
                              : notesSaved[order.id]
                                ? <><Check className="h-3 w-3" /> Saved</>
                                : "Save Notes"}
                          </button>
                          {notesError[order.id] && (
                            <span className="text-xs text-red-600">{notesError[order.id]}</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ── ONE-TIME: Cancel & Refund button ── */}
                {showCancelButton && (
                  <div className="border-t border-border pt-4">
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Cancel Order
                    </p>

                    {/* Result feedback */}
                    {cancelRes && !cancelRes.error && (
                      <div className="mb-2 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800 dark:border-green-800 dark:bg-green-950/30 dark:text-green-300">
                        <Check className="h-3.5 w-3.5 shrink-0" />
                        {cancelRes.refunded
                          ? "Order cancelled and refund issued via Stripe."
                          : "Order cancelled (no Stripe payment to refund)."}
                      </div>
                    )}
                    {cancelRes?.error && (
                      <div className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
                        Error: {cancelRes.error}
                      </div>
                    )}

                    {!isConfirmingCancel && !cancelRes && (
                      <button
                        onClick={() => requestCancelConfirm(order.id)}
                        disabled={isCancelling}
                        className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary disabled:opacity-50"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        {hasStripePayment ? "Cancel & Refund" : "Cancel Order"}
                      </button>
                    )}

                    {isCancelling && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        {hasStripePayment ? "Cancelling & issuing refund…" : "Cancelling order…"}
                      </div>
                    )}

                    {isConfirmingCancel && !isCancelling && (
                      <div className="rounded-lg border border-border bg-card p-3 space-y-2">
                        <p className="text-xs font-medium text-foreground">
                          {hasStripePayment
                            ? `Cancel this order and issue a full refund of ${fmt(order.total)} to the customer?`
                            : "Cancel this order? This is a cash/manual order — no Stripe refund will be issued."}
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleCancelAndRefund(order.id, hasStripePayment)}
                            style={{ backgroundColor: "#e05c6b", color: "#ffffff" }}
                            className="rounded-md px-3 py-1.5 text-xs font-medium transition-colors hover:opacity-90"
                          >
                            {hasStripePayment ? "Yes, Cancel & Refund" : "Yes, Cancel Order"}
                          </button>
                          <button
                            onClick={() => dismissCancelConfirm(order.id)}
                            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-secondary transition-colors"
                          >
                            Keep Order
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ── DELETE ORPHANED ORDER ── */}
                {isOrphaned && (
                  <div className="border-t border-red-200 pt-4">
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-red-600">
                      Orphaned Order
                    </p>
                    <p className="mb-3 text-xs text-muted-foreground">
                      The customer account for this order was deleted. You can permanently remove it.
                    </p>
                    <button
                      onClick={() => setDeleteModalOrder(order)}
                      className="flex items-center gap-1.5 rounded-md border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete Order
                    </button>
                  </div>
                )}

              </div>
            )}
          </div>
        )
      })}

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={safePage === 1}
            className="rounded-md border border-border p-1.5 text-muted-foreground hover:bg-secondary disabled:opacity-40 transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm text-muted-foreground">
            Page {safePage} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={safePage === totalPages}
            className="rounded-md border border-border p-1.5 text-muted-foreground hover:bg-secondary disabled:opacity-40 transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

    </div>
  )
}