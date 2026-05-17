// components/admin/cash-customer-modal.tsx
"use client"

import { useState } from "react"
import { Banknote, Repeat, ShoppingBag, Plus, Trash2, RefreshCw, Check, X } from "lucide-react"
import { createCashCustomer } from "@/app/actions/admin"
import { PRODUCT_OPTIONS } from "@/lib/products"
import { DELIVERY_DAYS, getUpcomingThursFri } from "./admin-types"

interface Props {
  onClose: () => void
  onCreated: () => void
}

function formatPhoneNumber(digits: string): string {
  const d = digits.slice(0, 10)
  if (d.length <= 3) return d.length ? `(${d}` : ""
  if (d.length <= 6) return `(${d.slice(0, 3)})-${d.slice(3)}`
  return `(${d.slice(0, 3)})-${d.slice(3, 6)}-${d.slice(6)}`
}

export function CashCustomerModal({ onClose, onCreated }: Props) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [customerType, setCustomerType] = useState<"subscription" | "one_time">("subscription")
  const [items, setItems] = useState([{ product_name: "Oat Milk - 32oz", size: "32oz", quantity: 1 }])

  const upcomingDates = getUpcomingThursFri(8)

  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    phone: "",
    email: "",
    address: "",
    city: "",
    state: "",
    zip: "",
    delivery_day: "thursday",
    delivery_date: upcomingDates[0]?.value ?? "",
    delivery_instructions: "",
    admin_notes: "",
  })

  const setField = (k: keyof typeof form, v: string) => setForm(prev => ({ ...prev, [k]: v }))

  function handlePhoneChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/\D/g, "").slice(0, 10)
    setField("phone", formatPhoneNumber(digits))
  }

  const addItem = () => setItems(prev => [...prev, { product_name: "Oat Milk - 32oz", size: "32oz", quantity: 1 }])
  const removeItem = (i: number) => setItems(prev => prev.filter((_, idx) => idx !== i))
  const setItem = (i: number, k: keyof typeof items[0], v: string | number) => {
    if (k === "product_name") {
      const opt = PRODUCT_OPTIONS.find(o => o.name === v)
      setItems(prev => prev.map((item, idx) => idx === i ? { ...item, product_name: String(v), size: opt?.size ?? item.size } : item))
    } else {
      setItems(prev => prev.map((item, idx) => idx === i ? { ...item, [k]: v } : item))
    }
  }

  const handleSubmit = async () => {
    if (!form.first_name.trim()) { setError("First name is required."); return }
    if (!form.last_name.trim()) { setError("Last name is required."); return }
    if (!form.phone.trim()) { setError("Phone is required."); return }
    if (!form.email.trim()) { setError("Email is required."); return }
    if (!form.address.trim()) { setError("Street address is required."); return }
    if (!form.city.trim()) { setError("City is required."); return }
    if (!form.state.trim()) { setError("State is required."); return }
    if (!form.zip.trim()) { setError("ZIP code is required."); return }
    if (items.length === 0) { setError("At least one item is required."); return }
    if (customerType === "one_time" && !form.delivery_date) {
      setError("A delivery date is required for one-time purchases."); return
    }
    setSaving(true)
    setError(null)
    const submitData = customerType === "one_time"
      ? { ...form, delivery_day: upcomingDates.find(d => d.value === form.delivery_date)?.dayName ?? form.delivery_day }
      : form
    const result = await createCashCustomer({ ...submitData, customer_type: customerType, items })
    setSaving(false)
    if (result.error) { setError(result.error); return }
    onCreated()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-border bg-card shadow-xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-border bg-card px-5 py-4">
          <div className="flex items-center gap-2">
            <Banknote className="h-5 w-5 text-[#7C9885]" />
            <h2 className="font-serif text-lg font-medium">Add Cash Customer</h2>
          </div>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-secondary transition-colors">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        <div className="space-y-5 p-5">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          )}

          {/* Customer Type Toggle */}
          <div>
            <label className="mb-2 block text-xs font-medium text-muted-foreground">Account Type</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setCustomerType("subscription")}
                className={`flex flex-col items-center gap-1.5 rounded-lg border px-3 py-3 text-sm font-medium transition-all ${
                  customerType === "subscription"
                    ? "border-[#7C9885] bg-[#7C9885]/10 text-[#7C9885]"
                    : "border-border bg-background text-muted-foreground hover:border-[#7C9885]/40"
                }`}
              >
                <Repeat className="h-4 w-4" />
                <span>Subscription</span>
                <span className="text-[10px] font-normal opacity-70">Recurring weekly order</span>
              </button>
              <button
                onClick={() => setCustomerType("one_time")}
                className={`flex flex-col items-center gap-1.5 rounded-lg border px-3 py-3 text-sm font-medium transition-all ${
                  customerType === "one_time"
                    ? "border-[#5A81A5] bg-[#5A81A5]/10 text-[#5A81A5]"
                    : "border-border bg-background text-muted-foreground hover:border-[#5A81A5]/40"
                }`}
              >
                <ShoppingBag className="h-4 w-4" />
                <span>One-Time Purchase</span>
                <span className="text-[10px] font-normal opacity-70">Single delivery order</span>
              </button>
            </div>
          </div>

          {/* Name */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">First Name</label>
              <input value={form.first_name} onChange={e => setField("first_name", e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#7C9885]" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Last Name</label>
              <input value={form.last_name} onChange={e => setField("last_name", e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#7C9885]" />
            </div>
          </div>

          {/* Contact */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Phone</label>
              <input
                value={form.phone}
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
              <input value={form.email} onChange={e => setField("email", e.target.value)} type="email"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#7C9885]" />
            </div>
          </div>

          {/* Address */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Street Address</label>
            <input value={form.address} onChange={e => setField("address", e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#7C9885]" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-1">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">City</label>
              <input value={form.city} onChange={e => setField("city", e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#7C9885]" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">State</label>
              <input value={form.state} onChange={e => setField("state", e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#7C9885]" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">ZIP</label>
              <input value={form.zip} onChange={e => setField("zip", e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#7C9885]" />
            </div>
          </div>

          {/* Delivery day (subscription) OR Delivery date picker (one-time) */}
          {customerType === "subscription" ? (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Delivery Day</label>
              <select value={form.delivery_day} onChange={e => setField("delivery_day", e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm capitalize focus:outline-none focus:ring-2 focus:ring-[#7C9885]">
                {DELIVERY_DAYS.map(d => (
                  <option key={d} value={d} className="capitalize">{d.charAt(0).toUpperCase() + d.slice(1)}</option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Delivery Date <span className="font-normal text-muted-foreground">(Displays next 4 weeks)</span>
              </label>
              <select
                value={form.delivery_date}
                onChange={e => setField("delivery_date", e.target.value)}
                className="w-full rounded-lg border border-[#7C9885] bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#7C9885]"
              >
                {upcomingDates.map(d => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            </div>
          )}

          {/* Delivery instructions */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Delivery Instructions</label>
            <input value={form.delivery_instructions} onChange={e => setField("delivery_instructions", e.target.value)}
              placeholder="e.g. Leave at front door"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#7C9885]" />
          </div>

          {/* Items */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">
                {customerType === "subscription" ? "Weekly Order Items" : "One-Time Order Items"}
              </label>
              <button onClick={addItem} className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-[#7C9885] hover:bg-[#7C9885]/10 transition-colors">
                <Plus className="h-3 w-3" /> Add item
              </button>
            </div>
            <div className="space-y-2">
              {items.map((item, i) => (
                <div key={i} className="flex items-center gap-2">
                  <select value={item.product_name}
                    onChange={e => setItem(i, "product_name", e.target.value)}
                    className="flex-1 rounded-lg border border-border bg-background px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#7C9885]">
                    {PRODUCT_OPTIONS.map(o => <option key={o.value} value={o.name}>{o.label}</option>)}
                  </select>
                  <input type="number" min={1} max={20} value={item.quantity}
                    onChange={e => setItem(i, "quantity", parseInt(e.target.value) || 1)}
                    className="w-16 rounded-lg border border-border bg-background px-2 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-[#7C9885]" />
                  {items.length > 1 && (
                    <button onClick={() => removeItem(i)} className="rounded-md p-1 hover:bg-red-50 transition-colors">
                      <Trash2 className="h-3.5 w-3.5 text-red-400" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Admin notes */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Internal Notes (admin only)</label>
            <textarea value={form.admin_notes} onChange={e => setField("admin_notes", e.target.value)}
              rows={2} placeholder="e.g. Pays on delivery, prefers back door…"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#7C9885]" />
          </div>
        </div>

        <div className="sticky bottom-0 flex items-center justify-end gap-3 border-t border-border bg-card px-5 py-4">
          <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-secondary transition-colors">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={saving}
            className={`flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-medium text-white disabled:opacity-50 transition-colors ${
              customerType === "subscription"
                ? "bg-[#7C9885] hover:bg-[#6a8673]"
                : "bg-[#5A81A5] hover:bg-[#4a6f92]"
            }`}>
            {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {customerType === "subscription" ? "Add Subscription Customer" : "Add One-Time Purchase"}
          </button>
        </div>
      </div>
    </div>
  )
}