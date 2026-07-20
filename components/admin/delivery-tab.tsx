// components/admin/delivery-tab.tsx
"use client"

import { useState, useRef } from "react"
import { Truck, RefreshCw, Save, Check, GripVertical, MapPin, Phone, Package } from "lucide-react"
import { getDeliveryList, saveRouteOrder } from "@/app/actions/admin"
import type { DeliveryStop } from "@/app/actions/admin"

/**
 * Returns the current or next upcoming date for a given weekday (4=Thu, 5=Fri).
 * If today IS the delivery day, returns today — the route is valid all day.
 */
function getNextWeekdayDate(targetDay: 4 | 5): Date {
  const now = new Date()
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const daysUntil = (targetDay - today.getDay() + 7) % 7
  const result = new Date(today)
  result.setDate(today.getDate() + daysUntil)
  return result
}

/** Format any stored phone string into (xxx)-xxx-xxxx */
function fmtPhone(raw: string | null | undefined): string {
  if (!raw) return ""
  const digits = raw.replace(/\D/g, "").slice(0, 10)
  if (digits.length <= 3) return digits.length ? `(${digits}` : ""
  if (digits.length <= 6) return `(${digits.slice(0, 3)})-${digits.slice(3)}`
  return `(${digits.slice(0, 3)})-${digits.slice(3, 6)}-${digits.slice(6)}`
}

/** Combine items with the same product name (e.g. two orders each with "Almond Milk - 16oz" x1)
 *  into a single entry with summed quantity, so the UI shows "x2" instead of two separate tags. */
function groupItems<T extends { name: string; quantity: number }>(items: T[]): T[] {
  const map = new Map<string, T>()
  for (const item of items) {
    const existing = map.get(item.name)
    if (existing) {
      existing.quantity += item.quantity
    } else {
      map.set(item.name, { ...item })
    }
  }
  return Array.from(map.values())
}

export function DeliveryTab() {
  // Default to whichever delivery day comes first, rather than always
  // "thursday". The day buttons already render in soonest-first order
  // (sortedDeliveryDays below), so hardcoding "thursday" meant that on a
  // FRIDAY — the morning you're actually driving the Friday route — the tab
  // opened on next week's Thursday while the Friday button sat first and
  // unselected. Lazy initializer because sortedDeliveryDays isn't defined
  // until after this hook; getNextWeekdayDate is module-level, so it's safe
  // to call here.
  const [day, setDay] = useState<"thursday" | "friday">(() =>
    getNextWeekdayDate(4).getTime() <= getNextWeekdayDate(5).getTime() ? "thursday" : "friday"
  )
  const [list, setList] = useState<DeliveryStop[]>([])
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isDirty, setIsDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [notesVisible, setNotesVisible] = useState<Set<string>>(new Set())

  const toggleStopNotes = (id: string) => {
    const next = new Set(notesVisible)
    next.has(id) ? next.delete(id) : next.add(id)
    setNotesVisible(next)
  }

  const deliveryDates: Record<"thursday" | "friday", Date> = {
    thursday: getNextWeekdayDate(4),
    friday: getNextWeekdayDate(5),
  }
  const sortedDeliveryDays = (["thursday", "friday"] as Array<"thursday" | "friday">).sort(
    (a, b) => deliveryDates[a].getTime() - deliveryDates[b].getTime()
  )

  const dragIndex = useRef<number | null>(null)
  const dragOverIndex = useRef<number | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    setIsDirty(false)
    setSaveSuccess(false)
    const d = deliveryDates[day]
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    const result = await getDeliveryList(day, dateStr)
    setLoading(false)
    setLoaded(true)
    if (result.error) setError(result.error)
    else setList(result.data)
  }

  const handleDragStart = (index: number) => { dragIndex.current = index }

  const handleDragEnter = (index: number) => {
    dragOverIndex.current = index
    if (dragIndex.current === null || dragIndex.current === index) return
    const newList = [...list]
    const dragged = newList.splice(dragIndex.current, 1)[0]
    newList.splice(index, 0, dragged)
    dragIndex.current = index
    setList(newList)
    setIsDirty(true)
  }

  const handleDragEnd = () => {
    dragIndex.current = null
    dragOverIndex.current = null
  }

  const handleSaveRoute = async () => {
    setSaving(true)
    // `day` (this tab's own state) must travel with the save — see
    // saveRouteOrder in app/actions/admin.ts and migration
    // 018_add_friday_route_position: Thursday and Friday now have
    // independent stored orderings, so this call has to say which one it's
    // reordering.
    const result = await saveRouteOrder(list.map(s => s.customerId), day)
    setSaving(false)
    if (result.error) { setError(result.error); return }
    setIsDirty(false)
    setSaveSuccess(true)
    setTimeout(() => setSaveSuccess(false), 3000)
  }

  const handlePrint = () => {
    const totals: Record<string, number> = {}
    list.forEach(stop => stop.items.forEach(item => {
      totals[item.name] = (totals[item.name] ?? 0) + item.quantity
    }))

    const stopsHtml = list.map((stop, i) => `
      <div class="stop">
        <div class="stop-header">
          <div class="stop-num">${i + 1}</div>
          <div class="stop-info">
            <div class="stop-name">
              ${stop.customerName}
              ${stop.isCashCustomer ? '<span class="badge cash">Cash</span>' : ''}
              ${stop.hasSub && stop.hasOneTime ? '<span class="badge sub">Subscription</span><span class="badge one-time">+ One Time</span>' : stop.isOneTime ? '<span class="badge one-time">One-Time</span>' : '<span class="badge sub">Subscription</span>'}
            </div>
            <div class="stop-address">📍 ${stop.address}, ${stop.city} ${stop.zip}</div>
            ${stop.customerPhone ? `<div class="stop-phone">📞 ${fmtPhone(stop.customerPhone)}</div>` : ''}
            ${stop.deliveryInstructions ? `<div class="note note-amber">${!stop.isCashCustomer ? '<strong>From Customer:</strong> ' : ''}${stop.deliveryInstructions}</div>` : ''}
            ${stop.adminNotes ? `<div class="note note-blue">${stop.adminNotes}</div>` : ''}
            <div class="items">
              ${groupItems(stop.items).map(item => `<span class="item-tag">${item.name} × ${item.quantity}</span>`).join('')}
            </div>
          </div>
          <div class="bottle-count">${stop.items.reduce((s, item) => s + item.quantity, 0)} bottle${stop.items.reduce((s, item) => s + item.quantity, 0) !== 1 ? 's' : ''}</div>
        </div>
      </div>
    `).join('')

    const summaryHtml = Object.entries(totals).sort(([a], [b]) => a.localeCompare(b)).map(([name, qty]) => `
      <div class="summary-row"><span>${name}</span><span>× ${qty}</span></div>
    `).join('')

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${day.charAt(0).toUpperCase() + day.slice(1)} Delivery List</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 13px; color: #111; padding: 24px; }
    h1 { font-size: 18px; font-weight: 600; margin-bottom: 4px; }
    .subtitle { font-size: 12px; color: #666; margin-bottom: 20px; }
    .stop { border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; margin-bottom: 10px; }
    .stop-header { display: flex; align-items: flex-start; gap: 10px; }
    .stop-num { width: 26px; height: 26px; border-radius: 50%; background: #7C9885; color: white; font-size: 11px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 2px; }
    .stop-info { flex: 1; }
    .stop-name { font-weight: 600; font-size: 14px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
    .stop-address, .stop-phone { font-size: 12px; color: #555; margin-top: 3px; }
    .badge { font-size: 10px; padding: 1px 6px; border-radius: 999px; font-weight: 500; }
    .badge.cash { background: #fef3c7; border: 1px solid #fcd34d; color: #92400e; }
    .badge.one-time { background: #dbeafe; border: 1px solid #93c5fd; color: #1e3a8a; }
    .badge.sub { background: #dcfce7; border: 1px solid #86efac; color: #166534; }
    .note { margin-top: 5px; padding: 4px 8px; border-radius: 5px; font-size: 11px; }
    .note-amber { background: #fffbeb; border: 1px solid #fde68a; color: #92400e; }
    .note-blue { background: #eff6ff; border: 1px solid #bfdbfe; color: #1e40af; }
    .items { margin-top: 6px; display: flex; flex-wrap: wrap; gap: 4px; }
    .item-tag { background: #f1f5f9; border-radius: 999px; padding: 2px 8px; font-size: 11px; }
    .bottle-count { font-size: 11px; color: #666; white-space: nowrap; margin-top: 3px; }
    .summary { border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; margin-top: 16px; background: #f8fafc; }
    .summary h2 { font-size: 13px; font-weight: 600; margin-bottom: 10px; }
    .summary-row { display: flex; justify-content: space-between; font-size: 13px; padding: 2px 0; }
    .summary-row span:first-child { color: #555; }
    .summary-row span:last-child { font-weight: 600; }
  </style>
</head>
<body>
  <h1>${day.charAt(0).toUpperCase() + day.slice(1)} Deliveries</h1>
  <div class="subtitle">${list.length} stop${list.length !== 1 ? 's' : ''} · Printed ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</div>
  ${stopsHtml}
  <div class="summary"><h2>Bottle Summary</h2>${summaryHtml}</div>
</body>
</html>`

    const win = window.open('', '_blank', 'width=800,height=900')
    if (!win) return
    win.document.write(html)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); win.close() }, 300)
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="mb-3 text-sm font-medium text-muted-foreground">Select delivery day to generate route list:</p>
        <div className="flex gap-3">
          {sortedDeliveryDays.map(d => (
            <button
              key={d}
              onClick={() => { setDay(d); setLoaded(false); setIsDirty(false) }}
              className={`rounded-lg border px-5 py-3 text-sm font-medium transition-all ${
                day === d ? "border-[#7C9885] bg-[#7C9885]/10 text-[#7C9885]" : "border-border bg-card text-muted-foreground hover:border-[#7C9885]/50"
              }`}
            >
              <span className="block capitalize">{d}</span>
              <span className="block text-xs font-normal opacity-75">
                {deliveryDates[d].toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </span>
            </button>
          ))}
          <button
            onClick={load}
            disabled={loading}
            className="ml-auto flex items-center gap-2 rounded-lg bg-[#7C9885] px-4 py-2 text-sm font-medium text-white hover:bg-[#6a8673] disabled:opacity-50 transition-colors"
          >
            {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
            Load {day.charAt(0).toUpperCase() + day.slice(1)} Deliveries
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      {loaded && !error && (
        <>
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-xl font-medium capitalize">
              {day} Deliveries · {deliveryDates[day].toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
            </h2>
            <div className="flex items-center gap-3">
              <span className="rounded-full bg-[#7C9885]/10 px-3 py-1 text-sm font-medium text-[#7C9885]">
                {list.length} stop{list.length !== 1 ? "s" : ""}
              </span>
              {isDirty && (
                <button
                  onClick={handleSaveRoute}
                  disabled={saving}
                  className="flex items-center gap-1.5 rounded-lg bg-[#7C9885] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#6a8673] disabled:opacity-50 transition-colors"
                >
                  {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Save Route Order
                </button>
              )}
              {saveSuccess && (
                <span className="flex items-center gap-1 text-xs font-medium text-[#7C9885]">
                  <Check className="h-3.5 w-3.5" /> Route saved
                </span>
              )}
              <button
                onClick={handlePrint}
                className="rounded-md border border-border bg-card px-3 py-1.5 text-xs hover:bg-secondary transition-colors"
              >
                Print List
              </button>
            </div>
          </div>

          {isDirty && (
            <div className="rounded-lg border border-[#7C9885]/30 bg-[#7C9885]/5 px-4 py-2 text-xs text-[#7C9885]">
              Route order changed — click <strong>Save Route Order</strong> to persist for future loads.
            </div>
          )}

          {list.length === 0 && (
            <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
              No deliveries scheduled for {day}.
            </div>
          )}

          <div className="space-y-2">
            {list.map((stop, i) => (
              <div
                key={stop.customerId}
                draggable
                onDragStart={() => handleDragStart(i)}
                onDragEnter={() => handleDragEnter(i)}
                onDragEnd={handleDragEnd}
                onDragOver={e => e.preventDefault()}
                className="group rounded-lg border border-border bg-card p-4 cursor-grab active:cursor-grabbing active:border-[#7C9885] active:shadow-md transition-all select-none"
              >
                <div className="flex items-start gap-3">
                  <div className="flex flex-col items-center gap-1">
                    <GripVertical className="h-4 w-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#7C9885] text-xs font-bold text-white">
                      {i + 1}
                    </div>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{stop.customerName}</p>
                        {stop.isCashCustomer ? (
                          <span className="rounded-full border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">Cash</span>
                        ) : (
                          <span className="rounded-full border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">Online</span>
                        )}
                        {stop.hasSub && stop.hasOneTime ? (
                          <>
                            <span className="rounded-full border border-[#7C9885]/30 px-2 py-0.5 text-[10px] text-[#7C9885]">Subscription</span>
                            <span className="rounded-full border border-[#5A81A5]/30 px-2 py-0.5 text-[10px] text-[#5A81A5]">+ One Time</span>
                          </>
                        ) : stop.isOneTime ? (
                          <span className="rounded-full border border-[#5A81A5]/30 px-2 py-0.5 text-[10px] text-[#5A81A5]">One Time</span>
                        ) : (
                          <span className="rounded-full border border-[#7C9885]/30 px-2 py-0.5 text-[10px] text-[#7C9885]">Subscription</span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        <Package className="mr-1 inline h-3.5 w-3.5" />
                        {stop.items.reduce((s, i) => s + i.quantity, 0)} bottle{stop.items.reduce((s, i) => s + i.quantity, 0) !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      <MapPin className="mr-1 inline h-3.5 w-3.5" />
                      {stop.address}, {stop.city} {stop.zip}
                    </p>
                    {stop.customerPhone && (
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        <Phone className="mr-1 inline h-3.5 w-3.5" />
                        <a href={`tel:${stop.customerPhone}`} className="hover:text-foreground transition-colors">{fmtPhone(stop.customerPhone)}</a>
                      </p>
                    )}
                    {(stop.deliveryInstructions || stop.adminNotes) && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {stop.deliveryInstructions && (
                          <button
                            onClick={() => toggleStopNotes(`delivery-${stop.customerId}`)}
                            className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors ${
                              notesVisible.has(`delivery-${stop.customerId}`)
                                ? "border-amber-300 bg-amber-100 text-amber-800"
                                : "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                            }`}
                          >
                            Delivery note {notesVisible.has(`delivery-${stop.customerId}`) ? "▲" : "▼"}
                          </button>
                        )}
                        {stop.adminNotes && (
                          <button
                            onClick={() => toggleStopNotes(`admin-${stop.customerId}`)}
                            className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors ${
                              notesVisible.has(`admin-${stop.customerId}`)
                                ? "border-blue-300 bg-blue-100 text-blue-800"
                                : "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                            }`}
                          >
                            Admin note {notesVisible.has(`admin-${stop.customerId}`) ? "▲" : "▼"}
                          </button>
                        )}
                      </div>
                    )}
                    {notesVisible.has(`delivery-${stop.customerId}`) && stop.deliveryInstructions && (
                      <p className="mt-1.5 rounded-md bg-amber-50 border border-amber-200 px-2 py-1 text-xs text-amber-800">
                        {!stop.isCashCustomer && <span className="font-semibold">From Customer: </span>}
                        {stop.deliveryInstructions}
                      </p>
                    )}
                    {notesVisible.has(`admin-${stop.customerId}`) && stop.adminNotes && (
                      <p className="mt-1 rounded-md bg-blue-50 border border-blue-200 px-2 py-1 text-xs text-blue-800">
                        {stop.adminNotes}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-2">
                      {groupItems(stop.items).map((item, j) => (
                        <span key={j} className="rounded-full bg-secondary px-2 py-0.5 text-xs">
                          {item.name} × {item.quantity}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Bottle summary */}
          <div className="rounded-lg border border-border bg-secondary/30 p-4">
            <p className="mb-2 text-sm font-medium">Bottle Summary</p>
            {(() => {
              const totals: Record<string, number> = {}
              list.forEach(stop => stop.items.forEach(item => {
                totals[item.name] = (totals[item.name] ?? 0) + item.quantity
              }))
              return Object.entries(totals).sort(([a], [b]) => a.localeCompare(b)).map(([name, qty]) => (
                <div key={name} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{name}</span>
                  <span className="font-medium">× {qty}</span>
                </div>
              ))
            })()}
          </div>
        </>
      )}
    </div>
  )
}