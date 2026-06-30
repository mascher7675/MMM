// components/admin/customers-tab.tsx
"use client"

import { useState, useTransition, useEffect, useCallback } from "react"
import { Plus, Phone, Pencil, Trash2, History, X, ShoppingBag, RefreshCcw, ChevronDown, ChevronUp } from "lucide-react"
import { updateCustomerRole, deleteCashCustomer, getCashCustomerHistory } from "@/app/actions/admin"
import { fmtDate, STATUS_COLORS, DELIVERY_STATE_LABELS } from "./admin-types"
import { CashCustomerModal } from "./cash-customer-modal"
import { EditCashCustomerModal } from "./edit-cash-customer-modal"
import type { AdminCustomer, CustomerHistoryOrder, CustomerHistorySubscription } from "@/app/actions/admin"

interface Props {
  customers: AdminCustomer[]
}

/** Format any stored phone string into (xxx)-xxx-xxxx */
function fmtPhone(raw: string | null | undefined): string {
  if (!raw) return ""
  const digits = raw.replace(/\D/g, "").slice(0, 10)
  if (digits.length <= 3) return digits.length ? `(${digits}` : ""
  if (digits.length <= 6) return `(${digits.slice(0, 3)})-${digits.slice(3)}`
  return `(${digits.slice(0, 3)})-${digits.slice(3, 6)}-${digits.slice(6)}`
}

// ── Order History Drawer ──────────────────────────────────────────────────────

interface OrderHistoryDrawerProps {
  customer: AdminCustomer
  onClose: () => void
}

function OrderHistoryDrawer({ customer, onClose }: OrderHistoryDrawerProps) {
  const [loading, setLoading] = useState(true)
  const [orders, setOrders] = useState<CustomerHistoryOrder[]>([])
  const [subscriptions, setSubscriptions] = useState<CustomerHistorySubscription[]>([])
  const [error, setError] = useState<string | null>(null)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [activeTab, setActiveTab] = useState<"orders" | "subscriptions">("orders")

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const result = await getCashCustomerHistory(customer.id)
    if (result.error) {
      setError(result.error)
    } else {
      setOrders(result.orders)
      setSubscriptions(result.subscriptions)
    }
    setLoading(false)
  }, [customer.id])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [onClose])

  const toggle = (id: string) =>
    setExpandedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const customerName = [customer.first_name, customer.last_name].filter(Boolean).join(" ") || "Customer"

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-card shadow-2xl border-l border-border">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="font-semibold text-foreground">{customerName}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {customer.email ?? "No email"} · {customer.is_cash_customer ? "Cash customer" : "Online customer"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="cursor-pointer rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border px-5 gap-4">
          {(["orders", "subscriptions"] as const).map(t => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className={`cursor-pointer flex items-center gap-1.5 pb-3 pt-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === t
                  ? "border-[#7C9885] text-[#7C9885]"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "orders" ? <ShoppingBag className="h-3.5 w-3.5" /> : <RefreshCcw className="h-3.5 w-3.5" />}
              {t === "orders" ? "Orders" : "Subscriptions"}
              {((t === "orders" && orders.length > 0) || (t === "subscriptions" && subscriptions.length > 0)) && (
                <span className="ml-1 rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {t === "orders" ? orders.length : subscriptions.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading && (
            <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
              Loading history…
            </div>
          )}
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          )}

          {!loading && !error && activeTab === "orders" && (
            orders.length === 0
              ? <p className="py-10 text-center text-sm text-muted-foreground">No orders yet.</p>
              : (
                <div className="space-y-2">
                  {orders.map(order => {
                    const expanded = expandedIds.has(order.id)
                    const statusColor = STATUS_COLORS[order.status] ?? "bg-secondary text-muted-foreground"
                    const deliveryState = order.delivery_state
                      ? (DELIVERY_STATE_LABELS[order.delivery_state] ?? { label: order.delivery_state, color: "bg-secondary text-muted-foreground" })
                      : null
                    const date = order.placed_at ?? order.created_at
                    return (
                      <div key={order.id} className="rounded-lg border border-border bg-card overflow-hidden">
                        <button
                          onClick={() => toggle(order.id)}
                          className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-secondary/30 transition-colors"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium">
                                {order.order_type === "one_time" ? "One-Time" : "Subscription"} Order
                              </span>
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${statusColor}`}>
                                {order.status}
                              </span>
                              {deliveryState && (
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${deliveryState.color}`}>
                                  {deliveryState.label}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5 capitalize">
                              {fmtDate(date)} · {order.delivery_day ?? "—"} · {order.items.length} item{order.items.length !== 1 ? "s" : ""}
                            </p>
                          </div>
                          {expanded
                            ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
                            : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
                        </button>
                        {expanded && (
                          <div className="border-t border-border bg-secondary/20 px-4 py-3">
                            <ul className="space-y-1">
                              {order.items.map((item, i) => (
                                <li key={i} className="flex items-center justify-between text-sm">
                                  <span>{item.product_name} <span className="text-muted-foreground text-xs">({item.size})</span></span>
                                  <span className="text-muted-foreground">×{item.quantity}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
          )}

          {!loading && !error && activeTab === "subscriptions" && (
            subscriptions.length === 0
              ? <p className="py-10 text-center text-sm text-muted-foreground">No subscriptions yet.</p>
              : (
                <div className="space-y-2">
                  {subscriptions.map(sub => {
                    const expanded = expandedIds.has(sub.id)
                    const statusColor = STATUS_COLORS[sub.status] ?? "bg-secondary text-muted-foreground"
                    return (
                      <div key={sub.id} className="rounded-lg border border-border bg-card overflow-hidden">
                        <button
                          onClick={() => toggle(sub.id)}
                          className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-secondary/30 transition-colors"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium">Subscription</span>
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${statusColor}`}>
                                {sub.status}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5 capitalize">
                              Started {fmtDate(sub.created_at)} · {sub.delivery_day} · {sub.items.length} item{sub.items.length !== 1 ? "s" : ""}
                            </p>
                          </div>
                          {expanded
                            ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
                            : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
                        </button>
                        {expanded && (
                          <div className="border-t border-border bg-secondary/20 px-4 py-3">
                            <ul className="space-y-1">
                              {sub.items.map((item, i) => (
                                <li key={i} className="flex items-center justify-between text-sm">
                                  <span>{item.product_name ?? "—"} <span className="text-muted-foreground text-xs">({item.size})</span></span>
                                  <span className="text-muted-foreground">×{item.quantity}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
          )}
        </div>
      </div>
    </>
  )
}

// ── Delete Confirm Modal ──────────────────────────────────────────────────────

interface DeleteConfirmModalProps {
  customer: AdminCustomer
  onClose: () => void
  onConfirm: () => void
}

function DeleteConfirmModal({ customer, onClose, onConfirm }: DeleteConfirmModalProps) {
  const name = [customer.first_name, customer.last_name].filter(Boolean).join(" ") || "this customer"
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm rounded-xl border border-border bg-card shadow-xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100">
            <Trash2 className="h-5 w-5 text-red-600" />
          </div>
          <div>
            <p className="font-semibold text-foreground">Delete cash customer?</p>
            <p className="text-xs text-muted-foreground mt-0.5">This cannot be undone.</p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          You are about to permanently delete <span className="font-medium text-foreground">{name}</span> and all their associated data.
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="cursor-pointer rounded-lg border border-border px-4 py-2 text-sm hover:bg-secondary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{ background: "#dc2626" }}
            className="cursor-pointer rounded-lg px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
          >
            Yes, delete
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export function CustomersTab({ customers }: Props) {
  const [search, setSearch] = useState("")
  const [filterType, setFilterType] = useState<"all" | "online" | "cash">("all")
  const [showModal, setShowModal] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<AdminCustomer | null>(null)
  const [historyCustomer, setHistoryCustomer] = useState<AdminCustomer | null>(null)
  const [deleteConfirmCustomer, setDeleteConfirmCustomer] = useState<AdminCustomer | null>(null)
  const [, startTransition] = useTransition()

  const filtered = customers.filter(c => {
    const q = search.toLowerCase()
    const matchesSearch = (
      !q ||
      `${c.first_name} ${c.last_name}`.toLowerCase().includes(q) ||
      (c.email ?? "").toLowerCase().includes(q) ||
      (c.city ?? "").toLowerCase().includes(q)
    )
    const matchesType =
      filterType === "all" ? true :
      filterType === "cash" ? c.is_cash_customer :
      !c.is_cash_customer
    return matchesSearch && matchesType
  })

  const cashCount = customers.filter(c => c.is_cash_customer).length

  return (
    <div className="space-y-4">
      {showModal && (
        <CashCustomerModal
          onClose={() => setShowModal(false)}
          onCreated={() => {}}
        />
      )}
      {editingCustomer && (
        <EditCashCustomerModal
          customer={editingCustomer}
          onClose={() => setEditingCustomer(null)}
        />
      )}
      {deleteConfirmCustomer && (
        <DeleteConfirmModal
          customer={deleteConfirmCustomer}
          onClose={() => setDeleteConfirmCustomer(null)}
          onConfirm={() => {
            const id = deleteConfirmCustomer.id
            setDeleteConfirmCustomer(null)
            startTransition(() => { void deleteCashCustomer(id) })
          }}
        />
      )}
      {historyCustomer && (
        <OrderHistoryDrawer
          customer={historyCustomer}
          onClose={() => setHistoryCustomer(null)}
        />
      )}

      {/* Search + Add */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Search by name, email or city…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-50 rounded-lg border border-border bg-card px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#7C9885]"
        />
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 rounded-lg bg-[#7C9885] px-4 py-2 text-sm font-medium text-white hover:bg-[#6a8673] transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Cash Customer
        </button>
      </div>

      {/* Type filter */}
      <div className="flex items-center gap-2 flex-wrap">
        {(["all", "online", "cash"] as const).map(f => (
          <button key={f} onClick={() => setFilterType(f)}
            className={`cursor-pointer rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              filterType === f ? "bg-[#7C9885] text-white" : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}>
            {f === "all" ? `All (${customers.length})` :
             f === "cash" ? `Cash (${cashCount})` :
             `Online (${customers.length - cashCount})`}
          </button>
        ))}
        <span className="ml-auto text-sm text-muted-foreground">{filtered.length} shown</span>
      </div>

      {/* Horizontal-scroll wrapper — swipe right on mobile to see all columns */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm" style={{ minWidth: "700px" }}>
          <thead className="bg-secondary/50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">Name</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">Contact</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">Location</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">Type</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">Role</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">Since</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">History</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((c) => (
              <tr key={c.id} className="hover:bg-secondary/20">
                <td className="px-4 py-3 whitespace-nowrap">
                  <p className="font-medium">
                    {[c.first_name, c.last_name].filter(Boolean).join(" ") || (
                      <span className="italic text-muted-foreground">No name</span>
                    )}
                  </p>
                </td>
                <td className="px-4 py-3">
                  <p className="text-muted-foreground whitespace-nowrap">{c.email ?? "—"}</p>
                  {c.phone && (
                    <a
                      href={`tel:${c.phone}`}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mt-0.5 whitespace-nowrap"
                    >
                      <Phone className="h-3 w-3" />{fmtPhone(c.phone)}
                    </a>
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                  {[c.city, c.state].filter(Boolean).join(", ") || "—"}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {c.is_cash_customer ? (
                    <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                      Cash
                    </span>
                  ) : (
                    <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                      Online
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {c.is_cash_customer ? (
                    <span className="rounded-full border border-border bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
                      customer
                    </span>
                  ) : (
                    <select
                      defaultValue={c.role}
                      onChange={(e) =>
                        startTransition(() => {
                          void updateCustomerRole(c.id, e.target.value as "customer" | "admin")
                        })
                      }
                      className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
                        c.role === "admin"
                          ? "border-[#7C9885] bg-[#7C9885]/10 text-[#7C9885]"
                          : "border-border bg-secondary text-muted-foreground"
                      }`}
                    >
                      <option value="customer">customer</option>
                      <option value="admin">admin</option>
                    </select>
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                  {fmtDate(c.created_at)}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <button
                    onClick={() => setHistoryCustomer(c)}
                    className="cursor-pointer flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground border border-border hover:border-[#7C9885] hover:text-[#7C9885] hover:bg-[#7C9885]/5 transition-colors"
                    title="View order history"
                  >
                    <History className="h-3.5 w-3.5" />
                    Orders
                  </button>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {c.is_cash_customer && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setEditingCustomer(c)}
                        className="cursor-pointer rounded-md p-1 text-muted-foreground hover:bg-[#7C9885]/10 hover:text-[#7C9885] transition-colors"
                        title="Edit cash customer"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setDeleteConfirmCustomer(c)}
                        className="cursor-pointer rounded-md p-1 text-muted-foreground hover:bg-red-50 hover:text-red-500 transition-colors"
                        title="Delete cash customer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p className="p-8 text-center text-muted-foreground">No customers found.</p>
        )}
      </div>
    </div>
  )
}