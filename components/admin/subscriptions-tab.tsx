// components/admin/subscriptions-tab.tsx
"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ChevronDown, ChevronUp, Mail, SkipForward, PlayCircle, ExternalLink, X } from "lucide-react"
import {
  adminSkipWeeklyDelivery,
  adminUnskipWeeklyDelivery,
  adminUpdateSubscriptionStatus,
} from "@/app/actions/admin"
import { fmt, fmtDate, STATUS_COLORS } from "./admin-types"
import { computeDeliveryDates, computeNextDeliveryDate } from "@/lib/delivery-utils"
import type { AdminSubscription } from "@/app/actions/admin"

interface Props {
  subscriptions: AdminSubscription[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(d: string): string {
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
  })
}

// ---------------------------------------------------------------------------
// Skip Modal — admin picks which upcoming dates to skip for a subscription
// ---------------------------------------------------------------------------
interface SkipModalProps {
  sub: AdminSubscription
  onClose: () => void
  onSuccess: () => void
}

function SkipModal({ sub, onClose, onSuccess }: SkipModalProps) {
  const deliveryDay = (sub.delivery_day ?? "thursday") as "thursday" | "friday"
  // Compute next 8 upcoming weekly delivery dates on the client
  const upcomingDates = computeDeliveryDates(deliveryDay, 8)
  const currentSkipped = (sub.skipped_dates ?? []).map((d) => d.length > 10 ? d.slice(0, 10) : d)

  const [selected, setSelected] = useState<Set<string>>(new Set(currentSkipped))
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const toggle = (v: string) => {
    const next = new Set(selected)
    next.has(v) ? next.delete(v) : next.add(v)
    setSelected(next)
  }

  const handleSubmit = () => {
    setError(null)
    const toSkip = Array.from(selected).filter((d) => !currentSkipped.includes(d))
    const toUnskip = currentSkipped.filter((d) => !selected.has(d))

    startTransition(async () => {
      if (toSkip.length > 0) {
        const r = await adminSkipWeeklyDelivery(sub.id, toSkip)
        if (r.error) { setError(r.error); return }
      }
      for (const date of toUnskip) {
        const r = await adminUnskipWeeklyDelivery(sub.id, date)
        if (r.error) { setError(r.error); return }
      }
      onSuccess()
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-xl border border-border bg-card shadow-xl mx-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <SkipForward className="h-5 w-5 text-amber-500" />
            <h2 className="font-semibold text-foreground">Skip / Unskip Deliveries</h2>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-secondary">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Customer info */}
        <div className="px-5 pt-4 pb-2 space-y-0.5">
          <p className="text-sm text-muted-foreground">
            Customer: <span className="font-medium text-foreground">{sub.customer_name ?? "Unknown"}</span>
          </p>
          <p className="text-sm text-muted-foreground">
            Delivery day: <span className="font-medium text-foreground capitalize">{deliveryDay}s</span>
          </p>
        </div>

        {/* Date checkboxes */}
        <div className="px-5 pb-2">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Upcoming deliveries — check to skip
          </p>
          <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
            {upcomingDates.map((date) => {
              const isChecked = selected.has(date)
              const wasSkipped = currentSkipped.includes(date)
              return (
                <label
                  key={date}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                    isChecked
                      ? "border-amber-400 bg-amber-50 text-amber-900"
                      : "border-border bg-card hover:bg-secondary/40"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggle(date)}
                    className="h-4 w-4 accent-amber-500"
                  />
                  <span className="flex-1">{formatDate(date)}</span>
                  {wasSkipped && !isChecked && (
                    <span className="text-xs font-medium text-sage">Unskipping</span>
                  )}
                  {isChecked && (
                    <span className="text-xs font-medium text-amber-600">Skip</span>
                  )}
                </label>
              )
            })}
          </div>
        </div>

        {error && (
          <p className="mx-5 mb-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
        )}

        <div className="mx-5 mt-3 mb-5 rounded-md bg-secondary/60 px-3 py-2.5">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Checked dates will be skipped — customer won&apos;t be on the delivery route and won&apos;t be charged for those weeks. Unchecking a previously skipped date restores it.
          </p>
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
          <button
            onClick={onClose}
            disabled={isPending}
            className="rounded-md border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-secondary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isPending}
            className="flex items-center gap-2 rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50 transition-colors"
          >
            {isPending ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <SkipForward className="h-4 w-4" />
            )}
            Save Changes
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function SubscriptionsTab({ subscriptions }: Props) {
  const router = useRouter()
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [skipModalSubId, setSkipModalSubId] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const [filter, setFilter] = useState("all")

  const toggle = (id: string) => {
    const next = new Set(expanded)
    next.has(id) ? next.delete(id) : next.add(id)
    setExpanded(next)
  }

  const filtered = filter === "all"
    ? subscriptions
    : subscriptions.filter((s) => s.status === filter)

  const skipModalSub = subscriptions.find((s) => s.id === skipModalSubId) ?? null

  return (
    <div className="space-y-4">

      {/* Skip modal */}
      {skipModalSub && (
        <SkipModal
          sub={skipModalSub}
          onClose={() => setSkipModalSubId(null)}
          onSuccess={() => {
            setSkipModalSubId(null)
            router.refresh()
          }}
        />
      )}

      {/* Filter tabs */}
      <div className="flex gap-1 rounded-lg border border-border bg-secondary/30 p-1 w-fit">
        {["all", "active", "cancelled"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors capitalize ${
              filter === f
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="text-sm text-muted-foreground py-6 text-center">No subscriptions found.</p>
      )}

      {filtered.map((sub) => {
        const isOpen = expanded.has(sub.id)
        const skippedDates = (sub.skipped_dates ?? []).map((d) => d.length > 10 ? d.slice(0, 10) : d)
        const hasSkips = skippedDates.length > 0

        return (
          <div key={sub.id} className="rounded-lg border border-border bg-card overflow-hidden">
            <button
              onClick={() => toggle(sub.id)}
              className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary/40"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_COLORS[sub.status] ?? STATUS_COLORS.default}`}>
                    {sub.status}
                  </span>
                  {hasSkips && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                      <SkipForward className="h-2.5 w-2.5" />
                      {skippedDates.length} skipped
                    </span>
                  )}
                  <span className="text-sm font-medium text-foreground">
                    {sub.customer_name ?? "Unknown"}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground capitalize">
                  {sub.delivery_day
                    ? sub.delivery_day.charAt(0).toUpperCase() + sub.delivery_day.slice(1) + "s"
                    : "—"}{" "}
                  ·{" "}
                  {sub.subscription_items
                    .map((item) => `${item.product_name ?? "Unknown"} × ${item.quantity}`)
                    .join(", ")}
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {sub.status === "active" && (
                  <div className="hidden text-right sm:block">
                    <p className="text-xs text-muted-foreground">Next delivery</p>
                    <p className="text-sm font-medium">{fmtDate(computeNextDeliveryDate(sub.delivery_day as "thursday" | "friday"))}</p>
                  </div>
                )}
                {isOpen ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            </button>

            {isOpen && (
              <div className="border-t border-border bg-secondary/20 p-4 space-y-4">

                {/* Items */}
                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Items
                  </p>
                  <div className="space-y-1">
                    {sub.subscription_items.map((item) => (
                      <div key={item.id} className="flex justify-between text-sm">
                        <span>{item.product_name ?? "—"} × {item.quantity}</span>
                        {item.price_cents != null && (
                          <span className="font-medium">{fmt(item.price_cents)}/wk</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Skipped dates */}
                {hasSkips && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-1">
                    <p className="text-xs font-semibold text-amber-900 flex items-center gap-1.5">
                      <SkipForward className="h-3.5 w-3.5" />
                      Skipped deliveries
                    </p>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {skippedDates.sort().map((d) => (
                        <span key={d} className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                          {formatDate(d)}
                          <button
                            onClick={() => startTransition(async () => {
                              await adminUnskipWeeklyDelivery(sub.id, d)
                              router.refresh()
                            })}
                            className="ml-0.5 hover:text-amber-600"
                            title="Remove skip"
                          >
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Contact */}
                {sub.customer_email && (
                  <p className="text-xs text-muted-foreground">
                    <Mail className="mr-1 inline h-3 w-3" />
                    <a href={`mailto:${sub.customer_email}`} className="hover:underline">
                      {sub.customer_email}
                    </a>
                  </p>
                )}

                {/* Actions */}
                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Actions
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {/* Active */}
                    <button
                      onClick={() =>
                        startTransition(async () => {
                          await adminUpdateSubscriptionStatus(sub.id, "active")
                          router.refresh()
                        })
                      }
                      className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                        sub.status === "active"
                          ? "border-[#7C9885] bg-[#7C9885] text-white"
                          : "border-border bg-card hover:bg-secondary"
                      }`}
                    >
                      Active
                    </button>

                    {/* Skip deliveries */}
                    <button
                      onClick={() => setSkipModalSubId(sub.id)}
                      className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-secondary transition-colors"
                    >
                      <SkipForward className="h-3.5 w-3.5" />
                      Skip Deliveries
                    </button>

                    {/* Cancelled */}
                    <button
                      onClick={() =>
                        startTransition(async () => {
                          await adminUpdateSubscriptionStatus(sub.id, "cancelled")
                          router.refresh()
                        })
                      }
                      className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                        sub.status === "cancelled"
                          ? "border-[#7C9885] bg-[#7C9885] text-white"
                          : "border-border bg-card hover:bg-secondary"
                      }`}
                    >
                      Cancelled
                    </button>
                  </div>
                </div>

                {/* Manage on Stripe */}
                {sub.stripe_subscription_id && (
                  <div>
                    <a
                      href={`https://dashboard.stripe.com/subscriptions/${sub.stripe_subscription_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-[#7C9885] hover:text-[#5a7363] hover:underline transition-colors"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Manage on Stripe
                    </a>
                  </div>
                )}

              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}