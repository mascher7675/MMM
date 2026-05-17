// components/admin/edit-cash-customer-modal.tsx
"use client"

import { useState, useEffect } from "react"
import {
  Banknote, Repeat, ShoppingBag, Plus, Trash2, RefreshCw, Check, X, Save, Pencil, Calendar,
} from "lucide-react"
import {
  updateCashCustomer,
  addOrderToCashCustomer,
  addSubscriptionToCashCustomer,
  getCashCustomerHistory,
} from "@/app/actions/admin"
import { PRODUCT_OPTIONS } from "@/lib/products"
import { DELIVERY_DAYS, getUpcomingThursFri, fmtDate } from "./admin-types"
import type { AdminCustomer, CustomerHistoryOrder, CustomerHistorySubscription } from "@/app/actions/admin"
import type { EditTab } from "./admin-types"

interface Props {
  customer: AdminCustomer
  onClose: () => void
}

function formatPhoneNumber(digits: string): string {
  const d = digits.slice(0, 10)
  if (d.length <= 3) return d.length ? `(${d}` : ""
  if (d.length <= 6) return `(${d.slice(0, 3)})-${d.slice(3)}`
  return `(${d.slice(0, 3)})-${d.slice(3, 6)}-${d.slice(6)}`
}

/** Normalise a stored phone (any format) into (xxx)-xxx-xxxx display format */
function normalisePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 10)
  return formatPhoneNumber(digits)
}

export function EditCashCustomerModal({ customer, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<EditTab>("history")
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // ── History state
  const [historyOrders, setHistoryOrders] = useState<CustomerHistoryOrder[]>([])
  const [historySubs, setHistorySubs] = useState<CustomerHistorySubscription[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [historyError, setHistoryError] = useState<string | null>(null)

  const upcomingDates = getUpcomingThursFri(8)

  // ── Profile form state
  const [profile, setProfileForm] = useState({
    first_name: customer.first_name ?? "",
    last_name: customer.last_name ?? "",
    phone: normalisePhone(customer.phone ?? ""),
    email: customer.email ?? "",
    address: customer.address ?? "",
    city: customer.city ?? "",
    state: customer.state ?? "",
    zip: customer.zip ?? "",
    delivery_day: customer.delivery_day ?? "thursday",
    delivery_instructions: customer.delivery_instructions ?? "",
    admin_notes: customer.admin_notes ?? "",
  })
  const setProfileField = (k: keyof typeof profile, v: string) =>
    setProfileForm(prev => ({ ...prev, [k]: v }))

  function handlePhoneChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/\D/g, "").slice(0, 10)
    setProfileField("phone", formatPhoneNumber(digits))
  }

  // ── New order state
  const [orderDate, setOrderDate] = useState(upcomingDates[0]?.value ?? "")
  const [orderItems, setOrderItems] = useState([{ product_name: "Oat Milk - 32oz", size: "32oz", quantity: 1 }])

  // ── New subscription state
  const [subDay, setSubDay] = useState(customer.delivery_day ?? "thursday")
  const [subItems, setSubItems] = useState([{ product_name: "Oat Milk - 32oz", size: "32oz", quantity: 1 }])

  // Fetch history on mount
  useEffect(() => {
    getCashCustomerHistory(customer.id).then(result => {
      setHistoryLoading(false)
      if (result.error) { setHistoryError(result.error); return }
      setHistoryOrders(result.orders)
      setHistorySubs(result.subscriptions)
    })
  }, [customer.id])

  const addItem = (setter: React.Dispatch<React.SetStateAction<{ product_name: string; size: string; quantity: number }[]>>) =>
    setter(prev => [...prev, { product_name: "Oat Milk - 32oz", size: "32oz", quantity: 1 }])

  const removeItem = (setter: React.Dispatch<React.SetStateAction<{ product_name: string; size: string; quantity: number }[]>>, i: number) =>
    setter(prev => prev.filter((_, idx) => idx !== i))

  const setItemField = (
    setter: React.Dispatch<React.SetStateAction<{ product_name: string; size: string; quantity: number }[]>>,
    i: number,
    k: "product_name" | "size" | "quantity",
    v: string | number
  ) => {
    if (k === "product_name") {
      const opt = PRODUCT_OPTIONS.find(o => o.name === v)
      setter(prev => prev.map((item, idx) => idx === i ? { ...item, product_name: String(v), size: opt?.size ?? item.size } : item))
    } else {
      setter(prev => prev.map((item, idx) => idx === i ? { ...item, [k]: v } : item))
    }
  }

  const reset = () => { setError(null); setSuccess(null) }

  const handleSaveProfile = async () => {
    reset(); setSaving(true)
    const result = await updateCashCustomer(customer.id, profile)
    setSaving(false)
    if (result.error) { setError(result.error); return }
    setSuccess("Profile updated successfully.")
  }

  const handleAddOrder = async () => {
    reset()
    if (!orderDate) { setError("Please select a delivery date."); return }
    if (orderItems.length === 0) { setError("At least one item is required."); return }
    setSaving(true)
    const dayName = upcomingDates.find(d => d.value === orderDate)?.dayName ?? "thursday"
    const result = await addOrderToCashCustomer(customer.id, {
      delivery_day: dayName,
      delivery_date: orderDate,
      items: orderItems,
    })
    setSaving(false)
    if (result.error) { setError(result.error); return }
    setSuccess("New order added to this customer's account.")
    setOrderDate(upcomingDates[0]?.value ?? "")
    setOrderItems([{ product_name: "Oat Milk - 32oz", size: "32oz", quantity: 1 }])
  }

  const handleAddSubscription = async () => {
    reset()
    if (subItems.length === 0) { setError("At least one item is required."); return }
    setSaving(true)
    const result = await addSubscriptionToCashCustomer(customer.id, {
      delivery_day: subDay,
      items: subItems,
    })
    setSaving(false)
    if (result.error) { setError(result.error); return }
    setSuccess("Subscription created for this customer.")
  }

  const tabs: { id: EditTab; label: string; icon: React.ReactNode }[] = [
    { id: "history",          label: "History",          icon: <Calendar className="h-3.5 w-3.5" /> },
    { id: "profile",          label: "Profile",          icon: <Pencil className="h-3.5 w-3.5" /> },
    { id: "add_order",        label: "Add Delivery",     icon: <ShoppingBag className="h-3.5 w-3.5" /> },
    { id: "add_subscription", label: "Add Subscription", icon: <Repeat className="h-3.5 w-3.5" /> },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-xl border border-border bg-card shadow-xl">

        {/* Header */}
        <div className="sticky top-0 flex items-center justify-between border-b border-border bg-card px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <Banknote className="h-5 w-5 text-[#7C9885]" />
              <h2 className="font-serif text-lg font-medium">
                {[customer.first_name, customer.last_name].filter(Boolean).join(" ") || "Cash Customer"}
              </h2>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">Cash customer · Edit profile or add orders</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-secondary transition-colors">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* Tab nav */}
        <div className="flex gap-1 border-b border-border bg-secondary/30 px-4 pt-2">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => { setActiveTab(t.id); reset() }}
              className={`flex items-center gap-1.5 rounded-t-lg border border-b-0 px-3 py-2 text-xs font-medium transition-all ${
                activeTab === t.id
                  ? "border-border bg-card text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        <div className="space-y-4 p-5">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          )}
          {success && (
            <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
              <Check className="h-4 w-4 shrink-0" />{success}
            </div>
          )}

          {/* ── History tab ──────────────────────────────────────────── */}
          {activeTab === "history" && (
            <div className="space-y-5">
              {historyLoading && (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Loading history…
                </div>
              )}
              {historyError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{historyError}</div>
              )}
              {!historyLoading && !historyError && (
                <>
                  {/* Subscriptions */}
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Subscriptions ({historySubs.length})
                    </p>
                    {historySubs.length === 0 ? (
                      <p className="rounded-lg border border-border bg-secondary/30 p-4 text-sm text-muted-foreground">No subscriptions.</p>
                    ) : (
                      <div className="space-y-2">
                        {historySubs.map(sub => (
                          <div key={sub.id} className="rounded-lg border border-border bg-card p-3">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <Repeat className="h-3.5 w-3.5 text-[#7C9885]" />
                                <span className="text-sm font-medium capitalize">{sub.delivery_day} — weekly</span>
                              </div>
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                sub.status === "active" ? "bg-green-100 text-green-800" :
                                sub.status === "paused" ? "bg-yellow-100 text-yellow-800" :
                                "bg-red-100 text-red-800"
                              }`}>{sub.status}</span>
                            </div>
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                              {sub.items.map((item, i) => (
                                <span key={i} className="rounded-full bg-secondary px-2 py-0.5 text-xs">
                                  {item.product_name ?? "—"} × {item.quantity}
                                </span>
                              ))}
                            </div>
                            <p className="mt-1 text-[11px] text-muted-foreground">Since {fmtDate(sub.created_at)}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Orders */}
                  <div>
                    {(() => {
                      const oneTimeOrders = historyOrders.filter(o => o.order_type === "one_time")
                      return (
                        <>
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            One-Time Orders ({oneTimeOrders.length})
                          </p>
                          {oneTimeOrders.length === 0 ? (
                            <p className="rounded-lg border border-border bg-secondary/30 p-4 text-sm text-muted-foreground">No orders yet.</p>
                          ) : (
                            <div className="space-y-2">
                              {oneTimeOrders.map(order => {
                                const deliveryDate = order.placed_at
                                  ? new Date(order.placed_at).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })
                                  : "—"
                                const dsColor =
                                  order.delivery_state === "delivered" ? "bg-green-100 text-green-800" :
                                  order.delivery_state === "out_for_delivery" ? "bg-purple-100 text-purple-800" :
                                  order.delivery_state === "preparing" ? "bg-blue-100 text-blue-800" :
                                  "bg-yellow-100 text-yellow-800"
                                return (
                                  <div key={order.id} className="rounded-lg border border-border bg-card p-3">
                                    <div className="flex items-center justify-between gap-2 flex-wrap">
                                      <div className="flex items-center gap-2">
                                        <ShoppingBag className="h-3.5 w-3.5 text-[#5A81A5]" />
                                        <span className="text-sm font-medium">{deliveryDate}</span>
                                      </div>
                                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${dsColor}`}>
                                        {order.delivery_state ?? "pending"}
                                      </span>
                                    </div>
                                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                                      {order.items.map((item, i) => (
                                        <span key={i} className="rounded-full bg-secondary px-2 py-0.5 text-xs">
                                          {item.product_name} × {item.quantity}
                                        </span>
                                      ))}
                                    </div>
                                    <p className="mt-1 text-[11px] text-muted-foreground">Order #{order.id.slice(-8).toUpperCase()}</p>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </>
                      )
                    })()}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Profile tab ──────────────────────────────────────────── */}
          {activeTab === "profile" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">First Name</label>
                  <input value={profile.first_name} onChange={e => setProfileField("first_name", e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#7C9885]" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Last Name</label>
                  <input value={profile.last_name} onChange={e => setProfileField("last_name", e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#7C9885]" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Phone</label>
                  <input
                    value={profile.phone}
                    onChange={handlePhoneChange}
                    type="tel"
                    inputMode="numeric"
                    placeholder="(123)-456-7890"
                    maxLength={14}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#7C9885]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Email</label>
                  <input value={profile.email} onChange={e => setProfileField("email", e.target.value)} type="email"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#7C9885]" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Street Address</label>
                <input value={profile.address} onChange={e => setProfileField("address", e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#7C9885]" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-1">
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">City</label>
                  <input value={profile.city} onChange={e => setProfileField("city", e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#7C9885]" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">State</label>
                  <input value={profile.state} onChange={e => setProfileField("state", e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#7C9885]" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">ZIP</label>
                  <input value={profile.zip} onChange={e => setProfileField("zip", e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#7C9885]" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Default Delivery Day</label>
                <select value={profile.delivery_day} onChange={e => setProfileField("delivery_day", e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm capitalize focus:outline-none focus:ring-2 focus:ring-[#7C9885]">
                  {DELIVERY_DAYS.map(d => (
                    <option key={d} value={d} className="capitalize">{d.charAt(0).toUpperCase() + d.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Delivery Instructions</label>
                <input value={profile.delivery_instructions} onChange={e => setProfileField("delivery_instructions", e.target.value)}
                  placeholder="e.g. Leave at front door"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#7C9885]" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Internal Notes (admin only)</label>
                <textarea value={profile.admin_notes} onChange={e => setProfileField("admin_notes", e.target.value)}
                  rows={2} placeholder="e.g. Pays on delivery…"
                  className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#7C9885]" />
              </div>
              <button onClick={handleSaveProfile} disabled={saving}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#7C9885] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#6a8673] disabled:opacity-50 transition-colors">
                {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save Profile
              </button>
            </div>
          )}

          {/* ── Add Order tab ─────────────────────────────────────────── */}
          {activeTab === "add_order" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Add a new one-time delivery to this customer's account.</p>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Delivery Date * <span className="font-normal">(Displays next 4 weeks)</span>
                </label>
                <select value={orderDate} onChange={e => setOrderDate(e.target.value)}
                  className="w-full rounded-lg border border-[#5A81A5] bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#5A81A5]">
                  {upcomingDates.map(d => (
                    <option key={d.value} value={d.value}>{d.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-xs font-medium text-muted-foreground">Order Items</label>
                  <button onClick={() => addItem(setOrderItems)}
                    className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-[#5A81A5] hover:bg-[#5A81A5]/10 transition-colors">
                    <Plus className="h-3 w-3" /> Add item
                  </button>
                </div>
                <div className="space-y-2">
                  {orderItems.map((item, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <select value={item.product_name} onChange={e => setItemField(setOrderItems, i, "product_name", e.target.value)}
                        className="flex-1 rounded-lg border border-border bg-background px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#5A81A5]">
                        {PRODUCT_OPTIONS.map(o => <option key={o.value} value={o.name}>{o.label}</option>)}
                      </select>
                      <input type="number" min={1} max={20} value={item.quantity}
                        onChange={e => setItemField(setOrderItems, i, "quantity", parseInt(e.target.value) || 1)}
                        className="w-16 rounded-lg border border-border bg-background px-2 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-[#5A81A5]" />
                      {orderItems.length > 1 && (
                        <button onClick={() => removeItem(setOrderItems, i)} className="rounded-md p-1 hover:bg-red-50 transition-colors">
                          <Trash2 className="h-3.5 w-3.5 text-red-400" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <button onClick={handleAddOrder} disabled={saving}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#5A81A5] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#4a6f92] disabled:opacity-50 transition-colors">
                {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Add One-Time Delivery
              </button>
            </div>
          )}

          {/* ── Add Subscription tab ──────────────────────────────────── */}
          {activeTab === "add_subscription" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Create a recurring weekly subscription for this customer.</p>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Delivery Day</label>
                <select value={subDay} onChange={e => setSubDay(e.target.value)}
                  className="w-full rounded-lg border border-[#7C9885] bg-background px-3 py-2 text-sm capitalize focus:outline-none focus:ring-2 focus:ring-[#7C9885]">
                  {DELIVERY_DAYS.map(d => (
                    <option key={d} value={d} className="capitalize">{d.charAt(0).toUpperCase() + d.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-xs font-medium text-muted-foreground">Weekly Items</label>
                  <button onClick={() => addItem(setSubItems)}
                    className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-[#7C9885] hover:bg-[#7C9885]/10 transition-colors">
                    <Plus className="h-3 w-3" /> Add item
                  </button>
                </div>
                <div className="space-y-2">
                  {subItems.map((item, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <select value={item.product_name} onChange={e => setItemField(setSubItems, i, "product_name", e.target.value)}
                        className="flex-1 rounded-lg border border-border bg-background px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#7C9885]">
                        {PRODUCT_OPTIONS.map(o => <option key={o.value} value={o.name}>{o.label}</option>)}
                      </select>
                      <input type="number" min={1} max={20} value={item.quantity}
                        onChange={e => setItemField(setSubItems, i, "quantity", parseInt(e.target.value) || 1)}
                        className="w-16 rounded-lg border border-border bg-background px-2 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-[#7C9885]" />
                      {subItems.length > 1 && (
                        <button onClick={() => removeItem(setSubItems, i)} className="rounded-md p-1 hover:bg-red-50 transition-colors">
                          <Trash2 className="h-3.5 w-3.5 text-red-400" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <button onClick={handleAddSubscription} disabled={saving}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#7C9885] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#6a8673] disabled:opacity-50 transition-colors">
                {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Repeat className="h-4 w-4" />}
                Create Subscription
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}