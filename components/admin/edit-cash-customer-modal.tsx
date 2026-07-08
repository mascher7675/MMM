// components/admin/edit-cash-customer-modal.tsx
"use client"

import { useState, useEffect } from "react"
import {
  Banknote, Repeat, ShoppingBag, Plus, Trash2, RefreshCw, Check, X, Save, Settings, AlertTriangle,
} from "lucide-react"
import {
  updateCashCustomer,
  addOrderToCashCustomer,
  addSubscriptionToCashCustomer,
  updateCashCustomerSubscription,
  adminUpdateSubscriptionStatus,
  getCashCustomerHistory,
} from "@/app/actions/admin"
import { PRODUCT_OPTIONS } from "@/lib/products"
import { getUpcomingThursFri } from "./admin-types"
import { computeNextDeliveryDate } from "@/lib/delivery-utils"
import type { AdminCustomer, CustomerHistorySubscription } from "@/app/actions/admin"

interface Props {
  customer: AdminCustomer
  onClose: () => void
}

type EditTab = "profile" | "add_order" | "add_subscription" | "manage_subscription"

type ManageItem = { product_name: string; size: string; quantity: number }

function groupSubscriptionItems(
  items: { product_name: string | null; size: string; quantity: number }[]
): ManageItem[] {
  const grouped = new Map<string, ManageItem>()
  for (const it of items) {
    const name = it.product_name ?? "Oat Milk - 32oz"
    const key = `${name}__${it.size}`
    const existing = grouped.get(key)
    if (existing) existing.quantity += it.quantity
    else grouped.set(key, { product_name: name, size: it.size, quantity: it.quantity })
  }
  return Array.from(grouped.values())
}

function formatPhoneNumber(digits: string): string {
  const d = digits.slice(0, 10)
  if (d.length <= 3) return d.length ? `(${d}` : ""
  if (d.length <= 6) return `(${d.slice(0, 3)})-${d.slice(3)}`
  return `(${d.slice(0, 3)})-${d.slice(3, 6)}-${d.slice(6)}`
}

function normalisePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 10)
  return formatPhoneNumber(digits)
}

function formatStartDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number)
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
}

// 4 individual start date cards: next 2 Thursdays + next 2 Fridays, sorted by date
function getStartDateOptions(): { day: "thursday" | "friday"; label: string; value: string }[] {
  const thuFirst = computeNextDeliveryDate("thursday")
  const friFirst = computeNextDeliveryDate("friday")

  const addWeeks = (dateStr: string, weeks: number): string => {
    const base = new Date(dateStr + "T12:00:00Z")
    base.setUTCDate(base.getUTCDate() + weeks * 7)
    return `${base.getUTCFullYear()}-${String(base.getUTCMonth() + 1).padStart(2, "0")}-${String(base.getUTCDate()).padStart(2, "0")}`
  }

  return [
    { day: "thursday" as const, value: thuFirst },
    { day: "thursday" as const, value: addWeeks(thuFirst, 1) },
    { day: "friday" as const,   value: friFirst },
    { day: "friday" as const,   value: addWeeks(friFirst, 1) },
  ]
    .sort((a, b) => a.value.localeCompare(b.value))
    .map(o => ({ ...o, label: formatStartDate(o.value) }))
}

const START_DATE_OPTIONS = getStartDateOptions()

export function EditCashCustomerModal({ customer, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<EditTab>("profile")
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

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

  function handleZipChange(e: React.ChangeEvent<HTMLInputElement>) {
    setProfileField("zip", e.target.value.replace(/\D/g, "").slice(0, 5))
  }

  // ── New order state
  const [orderDate, setOrderDate] = useState(upcomingDates[0]?.value ?? "")
  const [orderItems, setOrderItems] = useState([{ product_name: "Oat Milk - 32oz", size: "32oz", quantity: 1 }])

  // ── New subscription state — track the chosen start date (determines day too)
  const [subStartDate, setSubStartDate] = useState(START_DATE_OPTIONS[0]?.value ?? "")
  const [subItems, setSubItems] = useState([{ product_name: "Oat Milk - 32oz", size: "32oz", quantity: 1 }])

  // ── Manage (edit/cancel) existing subscription state
  const [activeSubs, setActiveSubs] = useState<CustomerHistorySubscription[]>([])
  const [subsLoading, setSubsLoading] = useState(true)
  const [selectedSubId, setSelectedSubId] = useState<string | null>(null)
  const [manageDeliveryDay, setManageDeliveryDay] = useState<"thursday" | "friday">("thursday")
  const [manageItems, setManageItems] = useState<ManageItem[]>([])
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)

  const selectSub = (sub: CustomerHistorySubscription) => {
    setSelectedSubId(sub.id)
    setManageDeliveryDay((sub.delivery_day === "friday" ? "friday" : "thursday"))
    setManageItems(groupSubscriptionItems(sub.items))
  }

  useEffect(() => {
    let cancelled = false
    setSubsLoading(true)
    getCashCustomerHistory(customer.id).then(res => {
      if (cancelled) return
      setSubsLoading(false)
      if (res.error) return
      const active = res.subscriptions.filter(s => s.status === "active")
      setActiveSubs(active)
      if (active.length > 0) selectSub(active[0])
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    const chosen = START_DATE_OPTIONS.find(o => o.value === subStartDate)
    if (!chosen) { setError("Please select a start date."); return }
    setSaving(true)
    const result = await addSubscriptionToCashCustomer(customer.id, {
      delivery_day: chosen.day,
      delivery_date: chosen.value,
      items: subItems,
    })
    setSaving(false)
    if (result.error) { setError(result.error); return }
    setSuccess("Subscription created for this customer.")
  }

  const handleSaveSubscription = async () => {
    reset()
    if (!selectedSubId) return
    if (manageItems.length === 0) { setError("At least one item is required."); return }
    setSaving(true)
    const result = await updateCashCustomerSubscription(selectedSubId, {
      delivery_day: manageDeliveryDay,
      items: manageItems,
    })
    setSaving(false)
    if (result.error) { setError(result.error); return }
    setSuccess("Subscription updated — changes apply to the delivery route going forward.")
    setActiveSubs(prev => prev.map(s => s.id === selectedSubId
      ? { ...s, delivery_day: manageDeliveryDay, items: manageItems }
      : s))
  }

  const handleCancelSubscription = async () => {
    if (!selectedSubId) return
    reset()
    setSaving(true)
    const result = await adminUpdateSubscriptionStatus(selectedSubId, "cancelled")
    setSaving(false)
    setShowCancelConfirm(false)
    if (result.error) { setError(result.error); return }
    setSuccess("Subscription cancelled — it will no longer appear on the delivery route.")
    setActiveSubs(prev => {
      const remaining = prev.filter(s => s.id !== selectedSubId)
      if (remaining.length > 0) selectSub(remaining[0])
      else setSelectedSubId(null)
      return remaining
    })
  }

  const tabs: { id: EditTab; label: string; icon: React.ReactNode }[] = [
    { id: "profile",             label: "Profile",             icon: <Save className="h-3.5 w-3.5" /> },
    { id: "add_order",           label: "Add Delivery",        icon: <ShoppingBag className="h-3.5 w-3.5" /> },
    { id: "add_subscription",    label: "Add Subscription",    icon: <Repeat className="h-3.5 w-3.5" /> },
    { id: "manage_subscription", label: "Manage Subscription", icon: <Settings className="h-3.5 w-3.5" /> },
  ]

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
        <div
          onClick={e => e.stopPropagation()}
          className="relative w-full max-w-lg max-h-[90dvh] overflow-y-auto rounded-xl border border-border bg-card shadow-xl"
        >

        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card px-4 py-3 sm:px-5 sm:py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Banknote className="h-5 w-5 shrink-0 text-[#7C9885]" />
              <h2 className="truncate font-serif text-lg font-medium">
                {[customer.first_name, customer.last_name].filter(Boolean).join(" ") || "Cash Customer"}
              </h2>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">Cash customer · Edit profile or add orders</p>
          </div>
          <button onClick={onClose} className="cursor-pointer shrink-0 rounded-md p-1 hover:bg-secondary transition-colors">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* Tab nav — horizontally scrollable so it never wraps/cramps on narrow screens */}
        <div className="flex gap-1 overflow-x-auto border-b border-border bg-secondary/30 px-4 pt-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => { setActiveTab(t.id); reset() }}
              className={`cursor-pointer flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-t-lg border border-b-0 px-3 py-2 text-xs font-medium transition-all ${
                activeTab === t.id
                  ? "border-border bg-card text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        <div className="space-y-4 p-4 sm:p-5">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          )}
          {success && (
            <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
              <Check className="h-4 w-4 shrink-0" />{success}
            </div>
          )}

          {/* ── Profile tab ─────────────────────────────────────────── */}
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
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Phone <span className="font-normal text-muted-foreground/70">(optional)</span></label>
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
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Email <span className="font-normal text-muted-foreground/70">(optional)</span></label>
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
                  <input
                    value={profile.zip}
                    onChange={handleZipChange}
                    inputMode="numeric"
                    maxLength={5}
                    placeholder="11968"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#7C9885]"
                  />
                </div>
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
                className="cursor-pointer flex w-full items-center justify-center gap-2 rounded-lg bg-[#7C9885] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#6a8673] disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save Profile
              </button>
            </div>
          )}

          {/* ── Add Order tab ────────────────────────────────────────── */}
          {activeTab === "add_order" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Add a new one-time delivery to this customer's account.</p>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Delivery Date <span className="font-normal">(today included if Thu/Fri)</span>
                </label>
                <select value={orderDate} onChange={e => setOrderDate(e.target.value)}
                  className="w-full cursor-pointer rounded-lg border border-[#5A81A5] bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#5A81A5]">
                  {upcomingDates.map(d => (
                    <option key={d.value} value={d.value}>{d.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-xs font-medium text-muted-foreground">Order Items</label>
                  <button onClick={() => addItem(setOrderItems)}
                    className="cursor-pointer flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-[#5A81A5] hover:bg-[#5A81A5]/10 transition-colors">
                    <Plus className="h-3 w-3" /> Add item
                  </button>
                </div>
                <div className="space-y-2">
                  {orderItems.map((item, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <select value={item.product_name} onChange={e => setItemField(setOrderItems, i, "product_name", e.target.value)}
                        className="flex-1 cursor-pointer rounded-lg border border-border bg-background px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#5A81A5]">
                        {PRODUCT_OPTIONS.map(o => <option key={o.value} value={o.name}>{o.label}</option>)}
                      </select>
                      <input type="number" min={1} max={20} value={item.quantity}
                        onChange={e => setItemField(setOrderItems, i, "quantity", parseInt(e.target.value) || 1)}
                        className="w-16 rounded-lg border border-border bg-background px-2 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-[#5A81A5]" />
                      {orderItems.length > 1 && (
                        <button onClick={() => removeItem(setOrderItems, i)} className="cursor-pointer rounded-md p-1 hover:bg-red-50 transition-colors">
                          <Trash2 className="h-3.5 w-3.5 text-red-400" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <button onClick={handleAddOrder} disabled={saving}
                className="cursor-pointer flex w-full items-center justify-center gap-2 rounded-lg bg-[#5A81A5] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#4a6f92] disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Add One-Time Delivery
              </button>
            </div>
          )}

          {/* ── Add Subscription tab ─────────────────────────────────── */}
          {activeTab === "add_subscription" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Create a recurring weekly subscription for this customer.</p>

              {/* 4-card individual start date picker */}
              <div>
                <label className="mb-2 block text-xs font-medium text-muted-foreground">First Delivery Date</label>
                <div className="grid grid-cols-2 gap-2">
                  {START_DATE_OPTIONS.map(({ day, label, value }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setSubStartDate(value)}
                      className={`cursor-pointer rounded-lg border-2 p-3 text-left transition-all ${
                        subStartDate === value
                          ? "border-[#7C9885] bg-[#7C9885]/10"
                          : "border-border hover:border-[#7C9885]/50"
                      }`}
                    >
                      <p className="text-sm font-medium text-foreground capitalize">{label}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground capitalize">{day}s · weekly after</p>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-xs font-medium text-muted-foreground">Weekly Items</label>
                  <button onClick={() => addItem(setSubItems)}
                    className="cursor-pointer flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-[#7C9885] hover:bg-[#7C9885]/10 transition-colors">
                    <Plus className="h-3 w-3" /> Add item
                  </button>
                </div>
                <div className="space-y-2">
                  {subItems.map((item, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <select value={item.product_name} onChange={e => setItemField(setSubItems, i, "product_name", e.target.value)}
                        className="flex-1 cursor-pointer rounded-lg border border-border bg-background px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#7C9885]">
                        {PRODUCT_OPTIONS.map(o => <option key={o.value} value={o.name}>{o.label}</option>)}
                      </select>
                      <input type="number" min={1} max={20} value={item.quantity}
                        onChange={e => setItemField(setSubItems, i, "quantity", parseInt(e.target.value) || 1)}
                        className="w-16 rounded-lg border border-border bg-background px-2 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-[#7C9885]" />
                      {subItems.length > 1 && (
                        <button onClick={() => removeItem(setSubItems, i)} className="cursor-pointer rounded-md p-1 hover:bg-red-50 transition-colors">
                          <Trash2 className="h-3.5 w-3.5 text-red-400" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <button onClick={handleAddSubscription} disabled={saving}
                className="cursor-pointer flex w-full items-center justify-center gap-2 rounded-lg bg-[#7C9885] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#6a8673] disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Repeat className="h-4 w-4" />}
                Create Subscription
              </button>
            </div>
          )}

          {/* ── Manage Subscription tab (edit items/day, or cancel) ─────── */}
          {activeTab === "manage_subscription" && (
            <div className="space-y-4">
              {subsLoading ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  <RefreshCw className="h-4 w-4 animate-spin mr-2" /> Loading subscription…
                </div>
              ) : activeSubs.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                  This customer has no active subscription. Use the &quot;Add Subscription&quot; tab to create one.
                </div>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    Edit this customer&apos;s recurring weekly items and delivery day, or cancel the subscription entirely.
                  </p>

                  {/* Selector, only shown if the customer has more than one active subscription */}
                  {activeSubs.length > 1 && (
                    <div>
                      <label className="mb-1 block text-xs font-medium text-muted-foreground">Subscription</label>
                      <div className="flex flex-wrap gap-2">
                        {activeSubs.map(sub => (
                          <button
                            key={sub.id}
                            type="button"
                            onClick={() => { selectSub(sub); reset() }}
                            className={`cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-medium capitalize transition-all ${
                              selectedSubId === sub.id
                                ? "border-[#7C9885] bg-[#7C9885]/10 text-[#7C9885]"
                                : "border-border text-muted-foreground hover:border-[#7C9885]/50"
                            }`}
                          >
                            {sub.delivery_day}s · {sub.items.length} item{sub.items.length === 1 ? "" : "s"}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Delivery day */}
                  <div>
                    <label className="mb-2 block text-xs font-medium text-muted-foreground">Delivery Day</label>
                    <div className="grid grid-cols-2 gap-2">
                      {(["thursday", "friday"] as const).map(day => (
                        <button
                          key={day}
                          type="button"
                          onClick={() => setManageDeliveryDay(day)}
                          className={`cursor-pointer rounded-lg border-2 p-3 text-left transition-all ${
                            manageDeliveryDay === day
                              ? "border-[#7C9885] bg-[#7C9885]/10"
                              : "border-border hover:border-[#7C9885]/50"
                          }`}
                        >
                          <p className={`text-sm font-medium capitalize ${manageDeliveryDay === day ? "text-[#7C9885]" : "text-foreground"}`}>
                            {day}s
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            Next: {formatStartDate(computeNextDeliveryDate(day))}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Weekly items */}
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <label className="text-xs font-medium text-muted-foreground">Weekly Items</label>
                      <button onClick={() => addItem(setManageItems)}
                        className="cursor-pointer flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-[#7C9885] hover:bg-[#7C9885]/10 transition-colors">
                        <Plus className="h-3 w-3" /> Add item
                      </button>
                    </div>
                    <div className="space-y-2">
                      {manageItems.map((item, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <select value={item.product_name} onChange={e => setItemField(setManageItems, i, "product_name", e.target.value)}
                            className="flex-1 cursor-pointer rounded-lg border border-border bg-background px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#7C9885]">
                            {PRODUCT_OPTIONS.map(o => <option key={o.value} value={o.name}>{o.label}</option>)}
                          </select>
                          <input type="number" min={1} max={20} value={item.quantity}
                            onChange={e => setItemField(setManageItems, i, "quantity", parseInt(e.target.value) || 1)}
                            className="w-16 rounded-lg border border-border bg-background px-2 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-[#7C9885]" />
                          {manageItems.length > 1 && (
                            <button onClick={() => removeItem(setManageItems, i)} className="cursor-pointer rounded-md p-1 hover:bg-red-50 transition-colors">
                              <Trash2 className="h-3.5 w-3.5 text-red-400" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <button onClick={handleSaveSubscription} disabled={saving}
                    className="cursor-pointer flex w-full items-center justify-center gap-2 rounded-lg bg-[#7C9885] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#6a8673] disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                    {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Save Subscription Changes
                  </button>

                  {/* Cancel subscription */}
                  <div className="border-t border-border pt-4">
                    {!showCancelConfirm ? (
                      <button
                        onClick={() => setShowCancelConfirm(true)}
                        className="cursor-pointer flex w-full items-center justify-center gap-2 rounded-lg border border-red-200 px-5 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                      >
                        <X className="h-4 w-4" /> Cancel This Subscription
                      </button>
                    ) : (
                      <div className="rounded-lg border border-red-200 bg-red-50 p-4 space-y-3">
                        <p className="flex items-start gap-2 text-sm text-red-800">
                          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                          This stops the customer from appearing on the weekly delivery route going forward. This can&apos;t be undone from here — you&apos;d need to create a new subscription to restart it.
                        </p>
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <button
                            onClick={handleCancelSubscription}
                            disabled={saving}
                            className="cursor-pointer rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
                          >
                            {saving ? "Cancelling…" : "Yes, Cancel Subscription"}
                          </button>
                          <button
                            onClick={() => setShowCancelConfirm(false)}
                            disabled={saving}
                            className="cursor-pointer rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-secondary transition-colors"
                          >
                            Keep Subscription
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
        </div>
      </div>
    </>
  )
}