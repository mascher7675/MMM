// components/admin/subscriptions-tab.tsx
"use client"

import { useState, useTransition } from "react"
import { ChevronDown, ChevronUp, Mail, PauseCircle, PlayCircle, Clock, ExternalLink, X } from "lucide-react"
import {
  adminPauseSubscription,
  adminUpdateSubscriptionStatus,
  adminApprovePause,
  adminDenyPause,
  adminResumePause,
} from "@/app/actions/admin"
import { fmt, fmtDate, STATUS_COLORS } from "./admin-types"
import type { AdminSubscription } from "@/app/actions/admin"

interface Props {
  subscriptions: AdminSubscription[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatSkipDates(dates: string[] | null): string {
  if (!dates || dates.length === 0) return "—"
  return dates
    .slice()
    .sort()
    .map((d) =>
      new Date(d + "T12:00:00").toLocaleDateString("en-US", {
        weekday: "short", month: "short", day: "numeric",
      })
    )
    .join(", ")
}

/** Returns only the subscription's own stored delivery_dates that are today or in the future */
function datesForSub(sub: AdminSubscription): { label: string; value: string }[] {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  return (sub.delivery_dates ?? [])
    .filter((d) => new Date(d + "T12:00:00") >= today)
    .sort()
    .map((d) => ({
      value: d,
      label: new Date(d + "T12:00:00").toLocaleDateString("en-US", {
        weekday: "long", month: "short", day: "numeric",
      }),
    }))
}

// ---------------------------------------------------------------------------
// Pause Modal — admin picks which delivery dates to skip, then hits Stripe
// ---------------------------------------------------------------------------
interface PauseModalProps {
  sub: AdminSubscription
  onClose: () => void
  onSuccess: () => void
}

function PauseModal({ sub, onClose, onSuccess }: PauseModalProps) {
  const dates = datesForSub(sub)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const toggle = (v: string) => {
    const next = new Set(selected)
    next.has(v) ? next.delete(v) : next.add(v)
    setSelected(next)
  }

  const handleSubmit = () => {
    if (selected.size === 0) {
      setError("Select at least one delivery date to skip.")
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await adminPauseSubscription(sub.id, Array.from(selected))
      if (result.error) {
        setError(result.error)
      } else {
        onSuccess()
      }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-xl border border-border bg-card shadow-xl mx-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <PauseCircle className="h-5 w-5 text-amber-500" />
            <h2 className="font-semibold text-foreground">Pause Subscription</h2>
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
            Delivery day: <span className="font-medium text-foreground capitalize">{sub.delivery_day ?? "—"}s</span>
          </p>
        </div>

        {/* Date checkboxes */}
        <div className="px-5 pb-2">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Select delivery dates to skip
          </p>
          <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
            {dates.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No upcoming delivery dates found for this subscription.
              </p>
            )}
            {dates.map(({ value, label }) => {
              const isChecked = selected.has(value)
              return (
                <label
                  key={value}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                    isChecked
                      ? "border-amber-400 bg-amber-50 text-amber-900"
                      : "border-border bg-card hover:bg-secondary/40"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggle(value)}
                    className="h-4 w-4 accent-amber-500"
                  />
                  <span className="flex-1">{label}</span>
                  {isChecked && (
                    <span className="text-xs font-medium text-amber-600">Skip</span>
                  )}
                </label>
              )
            })}
          </div>
        </div>

        {/* Error */}
        {error && (
          <p className="mx-5 mb-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
        )}

        {/* Note */}
        <div className="mx-5 mt-3 mb-5 rounded-md bg-secondary/60 px-3 py-2.5">
          <p className="text-xs text-muted-foreground leading-relaxed">
            This will pause billing on Stripe and exclude the customer from the delivery route on the selected dates.
          </p>
        </div>

        {/* Footer */}
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
            disabled={isPending || selected.size === 0}
            className="flex items-center gap-2 rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50 transition-colors"
          >
            {isPending ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <PauseCircle className="h-4 w-4" />
            )}
            Pause {selected.size > 0 ? `(${selected.size} date${selected.size > 1 ? "s" : ""})` : ""}
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
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [confirmDeny, setConfirmDeny] = useState<string | null>(null)
  const [pauseModalSubId, setPauseModalSubId] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const [filter, setFilter] = useState("all")

  const toggle = (id: string) => {
    const next = new Set(expanded)
    next.has(id) ? next.delete(id) : next.add(id)
    setExpanded(next)
  }

  // Pending pause requests always surface first regardless of filter
  const pendingPauses = subscriptions.filter((s) => s.pause_status === "pending")
  const filtered = filter === "all"
    ? subscriptions
    : filter === "paused"
    ? subscriptions.filter((s) => s.status === "paused" || s.pause_status === "approved")
    : subscriptions.filter((s) => s.status === filter)

  const pauseModalSub = subscriptions.find((s) => s.id === pauseModalSubId) ?? null

  return (
    <div className="space-y-4">

      {/* Pause modal */}
      {pauseModalSub && (
        <PauseModal
          sub={pauseModalSub}
          onClose={() => setPauseModalSubId(null)}
          onSuccess={() => setPauseModalSubId(null)}
        />
      )}

      {/* ── Pending pause requests — always shown at the top ─────────────── */}
      {pendingPauses.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-600" />
            <p className="text-sm font-semibold text-amber-900">
              {pendingPauses.length} Pending Pause Request{pendingPauses.length > 1 ? "s" : ""}
            </p>
          </div>
          {pendingPauses.map((sub) => (
            <div
              key={sub.id}
              className="rounded-lg border border-amber-200 bg-white p-3 space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-foreground">{sub.customer_name}</p>
                  {sub.customer_email && (
                    <p className="text-xs text-muted-foreground">{sub.customer_email}</p>
                  )}
                </div>
                <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                  Pause Requested
                </span>
              </div>

              <div className="text-xs text-muted-foreground space-y-0.5">
                <p>
                  <span className="font-medium text-foreground">Skip dates: </span>
                  {formatSkipDates(sub.pause_skip_dates)}
                </p>
                {sub.pause_note && (
                  <p>
                    <span className="font-medium text-foreground">Reason: </span>
                    {sub.pause_note}
                  </p>
                )}
                <p className="capitalize">
                  <span className="font-medium text-foreground">Delivery day: </span>
                  {sub.delivery_day}s
                </p>
              </div>

              <div className="flex items-center gap-2 pt-1">
                {/* Approve */}
                <button
                  onClick={() =>
                    startTransition(() => { void adminApprovePause(sub.id) })
                  }
                  className="flex items-center gap-1.5 rounded-md bg-[#7C9885] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#6a8673] transition-colors"
                >
                  <PlayCircle className="h-3.5 w-3.5" />
                  Approve & Pause Stripe
                </button>

                {/* Deny */}
                {confirmDeny !== sub.id ? (
                  <button
                    onClick={() => setConfirmDeny(sub.id)}
                    className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-secondary transition-colors"
                  >
                    Deny
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Confirm deny?</span>
                    <button
                      onClick={() => {
                        setConfirmDeny(null)
                        startTransition(() => { void adminDenyPause(sub.id) })
                      }}
                      className="text-xs font-bold text-red-700 hover:text-red-900"
                    >
                      Yes
                    </button>
                    <button
                      onClick={() => setConfirmDeny(null)}
                      className="text-xs text-muted-foreground"
                    >
                      No
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Filters + count ──────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        {["all", "active", "paused", "cancelled"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              filter === f
                ? "bg-[#7C9885] text-white"
                : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
        <span className="ml-auto text-sm text-muted-foreground">
          {filtered.length} subscription{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {filtered.length === 0 && (
        <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
          No subscriptions found.
        </div>
      )}

      {/* ── Subscription list ─────────────────────────────────────────────── */}
      {filtered.map((sub) => {
        const isOpen = expanded.has(sub.id)
        const isPaused = sub.pause_status === "approved" || sub.status === "paused"

        return (
          <div key={sub.id} className="overflow-hidden rounded-lg border border-border bg-card">
            <button
              onClick={() => toggle(sub.id)}
              className="flex w-full items-center gap-4 p-4 text-left hover:bg-secondary/30 transition-colors"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{sub.customer_name || "Unknown"}</span>
                  {/* Single status badge only — no duplicate "Paused" badge */}
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      STATUS_COLORS[sub.status] ?? "bg-secondary"
                    }`}
                  >
                    {sub.status}
                  </span>
                  {sub.cancel_at_period_end && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                      Cancels at period end
                    </span>
                  )}
                  {sub.pause_status === "pending" && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                      Pause pending
                    </span>
                  )}
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
              <div className="flex items-center gap-3">
                {sub.next_delivery_date && !isPaused && (
                  <div className="hidden text-right sm:block">
                    <p className="text-xs text-muted-foreground">Next delivery</p>
                    <p className="text-sm font-medium">{fmtDate(sub.next_delivery_date)}</p>
                  </div>
                )}
                {isPaused && sub.stripe_pause_resumes_at && (
                  <div className="hidden text-right sm:block">
                    <p className="text-xs text-muted-foreground">Resumes</p>
                    <p className="text-sm font-medium">{fmtDate(sub.stripe_pause_resumes_at)}</p>
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
                        <span>
                          {item.product_name ?? "—"} × {item.quantity}
                        </span>
                        {item.price_cents != null && (
                          <span className="font-medium">{fmt(item.price_cents)}/mo</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Contact */}
                {sub.customer_email && (
                  <p className="text-xs text-muted-foreground">
                    <Mail className="mr-1 inline h-3 w-3" />
                    <a href={`mailto:${sub.customer_email}`} className="hover:underline">
                      {sub.customer_email}
                    </a>
                  </p>
                )}

                {/* Pause info (when approved/active pause) */}
                {isPaused && (
                  <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 space-y-1">
                    <p className="text-xs font-semibold text-blue-900 flex items-center gap-1.5">
                      <PauseCircle className="h-3.5 w-3.5" />
                      Subscription is paused
                    </p>
                    <p className="text-xs text-blue-800">
                      <span className="font-medium">Skipping: </span>
                      {formatSkipDates(sub.pause_skip_dates)}
                    </p>
                    {sub.pause_note && (
                      <p className="text-xs text-blue-800">
                        <span className="font-medium">Reason: </span>
                        {sub.pause_note}
                      </p>
                    )}
                    {sub.stripe_pause_resumes_at && (
                      <p className="text-xs text-blue-800">
                        <span className="font-medium">Auto-resumes: </span>
                        {new Date(sub.stripe_pause_resumes_at).toLocaleDateString("en-US", {
                          weekday: "long", month: "long", day: "numeric",
                        })}
                      </p>
                    )}
                    {/* Manual early resume */}
                    <button
                      onClick={() =>
                        startTransition(() => { void adminResumePause(sub.id) })
                      }
                      className="mt-2 flex items-center gap-1.5 rounded-md border border-blue-300 bg-white px-3 py-1.5 text-xs font-medium text-blue-800 hover:bg-blue-50 transition-colors"
                    >
                      <PlayCircle className="h-3.5 w-3.5" />
                      Resume early
                    </button>
                  </div>
                )}

                {/* Change Status — hidden when paused (use resume button above instead).
                    "Paused" removed from status buttons; use the Pause button below. */}
                {!isPaused && (
                  <div>
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Change Status
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {/* Active */}
                      <button
                        onClick={() =>
                          startTransition(() => {
                            void adminUpdateSubscriptionStatus(sub.id, "active")
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

                      {/* Pause — opens the date-picker modal, hits Stripe */}
                      <button
                        onClick={() => setPauseModalSubId(sub.id)}
                        className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-secondary transition-colors"
                      >
                        <PauseCircle className="h-3.5 w-3.5" />
                        Pause
                      </button>

                      {/* Cancelled */}
                      <button
                        onClick={() =>
                          startTransition(() => {
                            void adminUpdateSubscriptionStatus(sub.id, "cancelled")
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
                )}

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