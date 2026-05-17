//components/account/subscription-panel.tsx

"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  CalendarDays,
  PauseCircle,
  XCircle,
  CheckCircle,
  Loader2,
  ShoppingBag,
  RotateCcw,
  CreditCard,
  AlertTriangle,
  Lock,
  Repeat2,
  ChevronDown,
  Plus,
  Milk,
  ChevronRight,
} from "lucide-react"
import {
  updateDeliveryDay,
  cancelSubscriptionAtPeriodEnd,
  reactivateSubscription,
  createBillingPortalSession,
  syncPeriodEndFromStripe,
  swapSubscriptionMilk,
} from "@/app/actions/subscription"
import { sendMessage } from "@/app/actions/messages"
import { isDeliveryDayLocked } from "@/lib/delivery-utils"
import { PRODUCTS } from "@/lib/products"
import Link from "next/link"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface SubscriptionItem {
  id: string
  product_name: string
  size: string
  quantity: number
  price_cents: number
  product_id?: string
}

export interface Subscription {
  id: string
  status: string
  delivery_day: string
  cancel_at_period_end: boolean
  current_period_end: string | null
  final_delivery_date: string | null
  stripe_subscription_id: string | null
  subscription_items: SubscriptionItem[]
}

interface SubscriptionPanelProps {
  userId: string
  subscriptions: Subscription[]
}

// ---------------------------------------------------------------------------
// Milk type config
// ---------------------------------------------------------------------------
const MILK_OPTIONS: { type: "oat" | "almond" | "hemp"; label: string }[] = [
  { type: "oat", label: "Oat" },
  { type: "almond", label: "Almond" },
  { type: "hemp", label: "Hemp Seed" },
]

function milkTypeFromProductId(productId: string | undefined): "oat" | "almond" | "hemp" | null {
  if (!productId) return null
  if (productId.startsWith("oat")) return "oat"
  if (productId.startsWith("almond")) return "almond"
  if (productId.startsWith("hemp")) return "hemp"
  return null
}

// ---------------------------------------------------------------------------
// Delivery day helpers
// ---------------------------------------------------------------------------
const THURSDAY = 4
const FRIDAY = 5
const CUTOFF_HOUR = 17  // 5 PM — changes lock
const UNLOCK_HOUR = 12  // noon on delivery day — changes reopen

function getNextDeliveryDate(targetDay: typeof THURSDAY | typeof FRIDAY): Date {
  const now = new Date()
  const result = new Date(now)
  let daysUntil = (targetDay - now.getDay() + 7) % 7
  if (daysUntil === 0) daysUntil = 7
  // If the delivery is tomorrow but we're past the 5 PM cutoff, skip another week.
  if (daysUntil === 1 && now.getHours() >= CUTOFF_HOUR) daysUntil = 8
  result.setDate(now.getDate() + daysUntil)
  result.setHours(0, 0, 0, 0)
  return result
}

function getFinalDeliveryDate(deliveryDay: string, periodEnd: Date): Date | null {
  const targetDayNum = deliveryDay === "friday" ? FRIDAY : THURSDAY
  const d = new Date(periodEnd)
  d.setHours(0, 0, 0, 0)
  for (let i = 0; i < 7; i++) {
    if (d.getDay() === targetDayNum) return d
    d.setDate(d.getDate() - 1)
  }
  return null
}

function formatDate(date: Date | string): string {
  const d = typeof date === "string"
    ? new Date(date.length === 10 ? date + "T12:00:00" : date)
    : date
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
}

function formatPrice(cents: number) {
  return `$${(cents / 100).toFixed(2)}`
}

// ---------------------------------------------------------------------------
// Guard — only returns true for active subscriptions with valid items
// ---------------------------------------------------------------------------
function isValidActiveSubscription(sub: Subscription): boolean {
  if (sub.status !== "active") return false
  if (!Array.isArray(sub.subscription_items) || sub.subscription_items.length === 0) return false
  const allItemsValid = sub.subscription_items.every(
    (item) =>
      typeof item.price_cents === "number" &&
      !isNaN(item.price_cents) &&
      item.price_cents > 0 &&
      typeof item.quantity === "number" &&
      item.quantity > 0
  )
  if (!allItemsValid) return false
  if (sub.delivery_day !== "thursday" && sub.delivery_day !== "friday") return false
  return true
}

// ---------------------------------------------------------------------------
// Small UI helpers
// ---------------------------------------------------------------------------
function SuccessBanner({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-sage/30 bg-sage/10 px-4 py-3 text-sm text-sage">
      <CheckCircle className="h-4 w-4 shrink-0" />
      {children}
    </div>
  )
}

function EditingWindowNote() {
  return (
    <div className="rounded-md border border-border bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
      <span className="font-medium text-foreground">Editing window:</span> Changes close at{" "}
      <span className="font-medium">5 PM the evening before</span> your delivery and reopen at{" "}
      <span className="font-medium">12 PM (noon) on delivery day</span>.
    </div>
  )
}

// ---------------------------------------------------------------------------
// No subscription CTA
// ---------------------------------------------------------------------------
function NoSubscriptionCard() {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center py-12 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-sage/10">
          <ShoppingBag className="h-8 w-8 text-sage" />
        </div>
        <h3 className="mb-2 text-xl font-semibold text-foreground">No active subscription</h3>
        <p className="mb-6 max-w-sm text-muted-foreground">
          Get fresh, locally-made non-dairy milk delivered to your door every week.
        </p>
        <Button asChild size="lg" className="bg-sage text-sage-foreground hover:bg-sage/90">
          <Link href="/subscribe">Start a Subscription</Link>
        </Button>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Single subscription card — full logic scoped to one subscription
// ---------------------------------------------------------------------------
function SingleSubscriptionCard({
  subscription,
  index,
  totalCount,
}: {
  subscription: Subscription
  index: number
  totalCount: number
}) {
  const router = useRouter()

  const [isUpdatingDay, setIsUpdatingDay] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)
  const [isReactivating, setIsReactivating] = useState(false)
  const [isOpeningBilling, setIsOpeningBilling] = useState(false)
  const [isSendingPause, setIsSendingPause] = useState(false)

  const [selectedDay, setSelectedDay] = useState<"thursday" | "friday">(
    isValidActiveSubscription(subscription)
      ? (subscription.delivery_day as "thursday" | "friday")
      : "thursday"
  )
  const [pauseReason, setPauseReason] = useState("")

  const [dayUpdateSuccess, setDayUpdateSuccess] = useState(false)
  const [pauseSuccess, setPauseSuccess] = useState(false)
  const [reactivateSuccess, setReactivateSuccess] = useState(false)

  // v0 uses tab-style (null | "milk" | "delivery"); we keep it but rename for clarity
  const [activePanel, setActivePanel] = useState<"milk" | "delivery" | null>(null)

  const [swappingItemId, setSwappingItemId] = useState<string | null>(null)
  const [swapSuccessItemId, setSwapSuccessItemId] = useState<string | null>(null)
  const [swapError, setSwapError] = useState<string | null>(null)
  const [selectedMilkTypes, setSelectedMilkTypes] = useState<Record<string, "oat" | "almond" | "hemp">>(() => {
    if (!isValidActiveSubscription(subscription)) return {}
    const initial: Record<string, "oat" | "almond" | "hemp"> = {}
    for (const item of subscription.subscription_items) {
      const mt = milkTypeFromProductId(item.product_id)
      if (mt) initial[item.id] = mt
    }
    return initial
  })

  const [cancelSessionFinalDate, setCancelSessionFinalDate] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // One-time backfill of current_period_end on mount
  const didSyncRef = useRef(false)
  const [isSyncingPeriodEnd, setIsSyncingPeriodEnd] = useState(false)
  useEffect(() => {
    if (
      !didSyncRef.current &&
      subscription?.cancel_at_period_end &&
      !subscription.current_period_end &&
      subscription.id
    ) {
      didSyncRef.current = true
      setIsSyncingPeriodEnd(true)
      syncPeriodEndFromStripe(subscription.id).then(({ current_period_end }) => {
        setIsSyncingPeriodEnd(false)
        if (current_period_end) router.refresh()
      })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Inactive / cancelled subscriptions — show a minimal read-only row.
  if (!isValidActiveSubscription(subscription)) {
    const sub = subscription as Subscription
    return (
      <Card className="bg-muted/30">
        <CardContent className="py-4">
          <div className="flex items-center gap-3">
            <Badge variant="secondary" className="shrink-0">
              {sub.status === "cancelled" ? "Cancelled" : "Inactive"}
            </Badge>
            <span className="text-sm text-muted-foreground truncate">
              {sub.subscription_items.length > 0
                ? sub.subscription_items.map((i) => `${i.product_name} ×${i.quantity}`).join(", ")
                : "No items"}
            </span>
          </div>
        </CardContent>
      </Card>
    )
  }

  const activeSubscription = subscription
  const isCancellationScheduled = activeSubscription.cancel_at_period_end
  const isSelectedDayLocked = isDeliveryDayLocked(selectedDay)
  const isMilkLocked = isDeliveryDayLocked(activeSubscription.delivery_day as "thursday" | "friday")

  const nextThursday = getNextDeliveryDate(THURSDAY)
  const nextFriday = getNextDeliveryDate(FRIDAY)
  const deliveryOptions = [
    { day: "thursday" as const, date: nextThursday },
    { day: "friday" as const, date: nextFriday },
  ].sort((a, b) => a.date.getTime() - b.date.getTime())

  const monthlyTotal = activeSubscription.subscription_items.reduce(
    (sum, item) => sum + item.price_cents * item.quantity,
    0
  )

  // ── Handlers ────────────────────────────────────────────────────────────

  async function handleUpdateDay() {
    if (selectedDay === activeSubscription.delivery_day) return
    setIsUpdatingDay(true)
    setError(null)
    const result = await updateDeliveryDay(activeSubscription.id, selectedDay)
    setIsUpdatingDay(false)
    if (result.error) {
      setError(result.error)
    } else {
      setDayUpdateSuccess(true)
      setTimeout(() => setDayUpdateSuccess(false), 3000)
      router.refresh()
    }
  }

  async function handlePauseRequest() {
    setIsSendingPause(true)
    setError(null)
    const result = await sendMessage({
      type: "pause_request",
      subject: "Subscription Pause Request",
      body: pauseReason
        ? `Customer requested a pause. Reason: ${pauseReason}`
        : "Customer requested a pause with no reason given.",
      subscriptionId: activeSubscription.id,
    })
    setIsSendingPause(false)
    if (result.error) {
      setError(result.error)
    } else {
      setPauseSuccess(true)
      setPauseReason("")
      router.refresh()
    }
  }

  async function handleCancel() {
    setIsCancelling(true)
    setError(null)
    const result = await cancelSubscriptionAtPeriodEnd(activeSubscription.id)
    if (result.error) {
      setIsCancelling(false)
      setError(result.error)
      return
    }
    if (!result.finalDeliveryDate) {
      await syncPeriodEndFromStripe(activeSubscription.id)
    }
    setIsCancelling(false)
    window.location.reload()
  }

  async function handleReactivate() {
    setIsReactivating(true)
    setError(null)
    const result = await reactivateSubscription(activeSubscription.id)
    setIsReactivating(false)
    if (result.error) {
      setError(result.error)
    } else {
      setCancelSessionFinalDate(null)
      setReactivateSuccess(true)
      setTimeout(() => setReactivateSuccess(false), 3000)
      router.refresh()
    }
  }

  async function handleManageBilling() {
    setIsOpeningBilling(true)
    setError(null)
    const result = await createBillingPortalSession(activeSubscription.id)
    setIsOpeningBilling(false)
    if (result.error) {
      setError(result.error)
    } else if (result.url) {
      window.location.href = result.url
    }
  }

  async function handleMilkSwap(item: SubscriptionItem, newMilkType: "oat" | "almond" | "hemp") {
    const currentMilk = milkTypeFromProductId(item.product_id)
    if (newMilkType === currentMilk) return
    setSwappingItemId(item.id)
    setSwapError(null)
    const result = await swapSubscriptionMilk(activeSubscription.id, item.id, newMilkType)
    setSwappingItemId(null)
    if (result.error) {
      setSwapError(result.error)
      setSelectedMilkTypes((prev) => ({ ...prev, [item.id]: currentMilk ?? prev[item.id] }))
    } else {
      setSwapSuccessItemId(item.id)
      setTimeout(() => setSwapSuccessItemId(null), 3000)
      router.refresh()
    }
  }

  // ── Delivery date calculations ───────────────────────────────────────────

  const finalDeliveryDate: Date | null = (() => {
    if (!isCancellationScheduled) return null
    if (activeSubscription.final_delivery_date) {
      return new Date(activeSubscription.final_delivery_date + "T12:00:00")
    }
    if (activeSubscription.current_period_end) {
      const periodEnd = new Date(activeSubscription.current_period_end)
      periodEnd.setUTCHours(23, 59, 59, 999)
      return getFinalDeliveryDate(activeSubscription.delivery_day, periodEnd)
    }
    return null
  })()

  const allDeliveries: Date[] = (() => {
    if (!finalDeliveryDate) return []
    const dates: Date[] = []
    const cursor = new Date(finalDeliveryDate)
    cursor.setHours(0, 0, 0, 0)
    for (let i = 0; i < 4; i++) {
      dates.unshift(new Date(cursor))
      cursor.setDate(cursor.getDate() - 7)
    }
    return dates
  })()

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const remainingDeliveries = allDeliveries.filter((d) => d >= today)

  const lastDeliveryDisplay: string | null = finalDeliveryDate
    ? finalDeliveryDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
    : cancelSessionFinalDate ?? null

  const currentMilkSummary = activeSubscription.subscription_items
    .map((item) => {
      const mt = milkTypeFromProductId(item.product_id)
      return mt ? MILK_OPTIONS.find((o) => o.type === mt)?.label : null
    })
    .filter(Boolean)
    .join(", ")

  const nextDeliveryDate = getNextDeliveryDate(
    activeSubscription.delivery_day === "friday" ? FRIDAY : THURSDAY
  )

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Label when multiple subscriptions exist */}
      {totalCount > 1 && (
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Subscription {index + 1}
        </p>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* ── Cancellation banner ─────────────────────────────────────────── */}
      {isCancellationScheduled && (
        <Card className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/50">
                <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-amber-900 dark:text-amber-200">
                  Cancellation Scheduled
                </p>
                {remainingDeliveries.length > 0 ? (
                  <div className="mt-2">
                    <p className="text-sm text-amber-700 dark:text-amber-400">
                      {remainingDeliveries.length}{" "}
                      {remainingDeliveries.length === 1 ? "delivery" : "deliveries"} remaining:
                    </p>
                    <ul className="mt-2 space-y-1">
                      {remainingDeliveries.map((d, i) => (
                        <li
                          key={d.toISOString()}
                          className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400"
                        >
                          <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400 dark:bg-amber-500 shrink-0" />
                          <span className={i === remainingDeliveries.length - 1 ? "font-medium" : ""}>
                            {formatDate(d)}
                            {i === remainingDeliveries.length - 1 && " (final)"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : lastDeliveryDisplay ? (
                  <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">
                    Last delivery was on {lastDeliveryDisplay}
                  </p>
                ) : (
                  <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">
                    {isSyncingPeriodEnd ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Loading delivery schedule…
                      </span>
                    ) : (
                      "Deliveries will stop at the end of the billing period."
                    )}
                  </p>
                )}
                <div className="mt-4">
                  {reactivateSuccess ? (
                    <SuccessBanner>Reactivated! Your deliveries will continue.</SuccessBanner>
                  ) : (
                    <Button
                      onClick={handleReactivate}
                      disabled={isReactivating}
                      variant="outline"
                      size="sm"
                      className="gap-2 border-amber-300 bg-white text-amber-900 hover:bg-amber-50 dark:border-amber-700 dark:bg-transparent dark:text-amber-200"
                    >
                      {isReactivating ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RotateCcw className="h-3.5 w-3.5" />
                      )}
                      Keep My Subscription
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Main subscription card ───────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-wrap items-center gap-2">
            {isCancellationScheduled ? (
              <Badge variant="secondary">Cancelling</Badge>
            ) : (
              <Badge className="bg-sage text-sage-foreground">Active</Badge>
            )}
            <span className="text-sm text-muted-foreground">
              {formatPrice(monthlyTotal)}/month
            </span>
          </div>
          <CardTitle className="text-lg">
            {activeSubscription.subscription_items.map((i) => i.product_name).join(", ")}
          </CardTitle>
          <CardDescription>
            Next delivery:{" "}
            {formatDate(nextDeliveryDate)}{" "}
            ({activeSubscription.delivery_day.charAt(0).toUpperCase() + activeSubscription.delivery_day.slice(1)}s)
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Quick summary grid */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-background">
                <Milk className="h-5 w-5 text-sage" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Milk Type</p>
                <p className="font-medium truncate">{currentMilkSummary || "—"}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-background">
                <CalendarDays className="h-5 w-5 text-sage" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Delivery Day</p>
                <p className="font-medium capitalize">{activeSubscription.delivery_day}s</p>
              </div>
            </div>
          </div>

          {/* Order details */}
          <div className="rounded-lg border border-border">
            <div className="border-b border-border px-4 py-3">
              <p className="text-sm font-medium">Order Details</p>
            </div>
            <div className="divide-y divide-border">
              {activeSubscription.subscription_items.map((item) => (
                <div key={item.id} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                      {item.quantity}×
                    </span>
                    <div>
                      <p className="text-sm font-medium">{item.product_name}</p>
                      <p className="text-xs text-muted-foreground">{item.size}</p>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {formatPrice(item.price_cents * item.quantity)}/mo
                  </p>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between border-t border-border bg-muted/30 px-4 py-3">
              <p className="text-sm font-semibold">Total</p>
              <p className="font-semibold">{formatPrice(monthlyTotal)}/mo</p>
            </div>
          </div>

          {/* Action buttons — toggle panels */}
          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              variant="outline"
              className="justify-between"
              onClick={() => {
                setActivePanel(activePanel === "milk" ? null : "milk")
                setSwapError(null)
              }}
            >
              <span className="flex items-center gap-2">
                <Repeat2 className="h-4 w-4" />
                Change Milk Type
              </span>
              <ChevronRight
                className={`h-4 w-4 transition-transform ${activePanel === "milk" ? "rotate-90" : ""}`}
              />
            </Button>
            <Button
              variant="outline"
              className="justify-between"
              onClick={() => setActivePanel(activePanel === "delivery" ? null : "delivery")}
            >
              <span className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4" />
                Change Delivery Day
              </span>
              <ChevronRight
                className={`h-4 w-4 transition-transform ${activePanel === "delivery" ? "rotate-90" : ""}`}
              />
            </Button>
          </div>

          {/* ── Change Milk Type Panel ─────────────────────────────────── */}
          {activePanel === "milk" && (
            <div className="space-y-4 rounded-lg border border-border p-4">
              <div className="flex items-center justify-between">
                <h4 className="font-medium">Change Your Milk</h4>
                <button
                  onClick={() => setActivePanel(null)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <XCircle className="h-5 w-5" />
                </button>
              </div>

              <EditingWindowNote />

              {isMilkLocked && (
                <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                  <Lock className="h-4 w-4 shrink-0" />
                  <span>Milk type changes are locked until 12 PM on your delivery day.</span>
                </div>
              )}

              {swapError && (
                <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {swapError}
                </div>
              )}

              {(() => {
                // Build labels — when multiple swappable items share a size, number them
                const swappableItems = activeSubscription.subscription_items.filter(
                  (i) => milkTypeFromProductId(i.product_id) !== null
                )
                const sizeCount: Record<string, number> = {}
                const sizeIndex: Record<string, number> = {}
                for (const i of swappableItems) {
                  sizeCount[i.size] = (sizeCount[i.size] ?? 0) + 1
                }

                return activeSubscription.subscription_items.map((item, itemIndex) => {
                  const currentMilk = milkTypeFromProductId(item.product_id)
                  const selectedMilk = selectedMilkTypes[item.id] ?? currentMilk
                  const isSwapping = swappingItemId === item.id
                  const swapSuccess = swapSuccessItemId === item.id
                  const hasChanged = selectedMilk !== currentMilk
                  if (!currentMilk) return null

                  let itemLabel = ""
                  if (swappableItems.length > 1) {
                    if (sizeCount[item.size] > 1) {
                      sizeIndex[item.size] = (sizeIndex[item.size] ?? 0) + 1
                      const bottleWord = item.quantity > 1 ? "Bottles" : "Bottle"
                      itemLabel = `${item.size} — ${bottleWord} ${sizeIndex[item.size]}${item.quantity > 1 ? ` (×${item.quantity})` : ""}`
                    } else {
                      itemLabel = item.quantity > 1 ? `${item.size} (×${item.quantity})` : item.size
                    }
                  }

                  const showDivider = itemIndex > 0 && swappableItems.length > 1

                  return (
                    <div
                      key={item.id}
                      className={`space-y-3${showDivider ? " border-t border-border pt-3" : ""}`}
                    >
                      {itemLabel && (
                        <p className="text-xs font-medium text-muted-foreground">{itemLabel}</p>
                      )}
                      <div className="grid grid-cols-3 gap-2">
                        {MILK_OPTIONS.map(({ type, label }) => (
                          <button
                            key={type}
                            type="button"
                            disabled={isSwapping || isMilkLocked}
                            onClick={() =>
                              setSelectedMilkTypes((prev) => ({ ...prev, [item.id]: type }))
                            }
                            className={`flex flex-col items-center justify-center gap-1 rounded-xl border-2 p-3 transition-all disabled:opacity-50 ${
                              selectedMilk === type
                                ? "border-sage bg-sage/10"
                                : "border-border hover:border-sage/50"
                            }`}
                          >
                            <span className="text-sm font-medium">{label}</span>
                            {type === currentMilk && (
                              <span className="text-[10px] text-muted-foreground">current</span>
                            )}
                          </button>
                        ))}
                      </div>
                      <div className="flex justify-end">
                        {swapSuccess ? (
                          <SuccessBanner>Updated! Takes effect next delivery.</SuccessBanner>
                        ) : (
                          <Button
                            onClick={() =>
                              handleMilkSwap(item, selectedMilk as "oat" | "almond" | "hemp")
                            }
                            disabled={!hasChanged || isSwapping || isMilkLocked}
                            className="gap-2 bg-sage text-sage-foreground hover:bg-sage/90 disabled:bg-muted disabled:text-muted-foreground"
                          >
                            {isSwapping && <Loader2 className="h-4 w-4 animate-spin" />}
                            {isSwapping ? "Saving…" : hasChanged ? "Save Change" : "No Changes"}
                          </Button>
                        )}
                      </div>
                    </div>
                  )
                })
              })()}
            </div>
          )}

          {/* ── Change Delivery Day Panel ────────────────────────────────── */}
          {activePanel === "delivery" && (
            <div className="space-y-4 rounded-lg border border-border p-4">
              <div className="flex items-center justify-between">
                <h4 className="font-medium">Change Delivery Day</h4>
                <button
                  onClick={() => setActivePanel(null)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <XCircle className="h-5 w-5" />
                </button>
              </div>

              <EditingWindowNote />

              <div className="grid grid-cols-2 gap-3">
                {deliveryOptions.map(({ day, date }) => {
                  const locked = isDeliveryDayLocked(day)
                  const isSelected = selectedDay === day
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => !locked && setSelectedDay(day)}
                      disabled={locked}
                      className={`relative flex flex-col items-center justify-center rounded-xl border-2 p-4 transition-all ${
                        locked
                          ? "cursor-not-allowed border-border opacity-50"
                          : isSelected
                          ? "border-sage bg-sage/10"
                          : "border-border hover:border-sage/50"
                      }`}
                    >
                      {locked && (
                        <Lock className="absolute right-2 top-2 h-4 w-4 text-muted-foreground" />
                      )}
                      <p className="text-base font-semibold capitalize">{day}s</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Next: {formatDate(date)}
                      </p>
                    </button>
                  )
                })}
              </div>

              {isSelectedDayLocked && (
                <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Lock className="h-3.5 w-3.5 shrink-0" />
                  Changes to {selectedDay} delivery are locked until 12 PM. Check back at noon!
                </p>
              )}

              <div className="flex justify-end">
                {dayUpdateSuccess ? (
                  <SuccessBanner>Delivery day updated!</SuccessBanner>
                ) : (
                  <Button
                    onClick={handleUpdateDay}
                    disabled={
                      isUpdatingDay ||
                      selectedDay === activeSubscription.delivery_day ||
                      isSelectedDayLocked
                    }
                    className="gap-2 bg-sage text-sage-foreground hover:bg-sage/90 disabled:bg-muted disabled:text-muted-foreground"
                  >
                    {isUpdatingDay && <Loader2 className="h-4 w-4 animate-spin" />}
                    {selectedDay === activeSubscription.delivery_day
                      ? "No Changes"
                      : "Save Delivery Day"}
                  </Button>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Manage Subscription Actions ────────────────────────────────── */}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button
          variant="outline"
          onClick={handleManageBilling}
          disabled={isOpeningBilling}
          className="gap-2"
        >
          {isOpeningBilling ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CreditCard className="h-4 w-4" />
          )}
          Manage Billing
        </Button>

        {!isCancellationScheduled && (
          <>
            {pauseSuccess ? (
              <div className="flex items-center gap-2 rounded-lg border border-sage/30 bg-sage/10 px-4 py-2 text-sm text-sage sm:flex-1">
                <CheckCircle className="h-4 w-4 shrink-0" />
                <span>Pause request sent! We'll reach out to confirm.</span>
              </div>
            ) : (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" className="gap-2">
                    <PauseCircle className="h-4 w-4" />
                    Request a Pause
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Request a Pause</AlertDialogTitle>
                    <AlertDialogDescription>
                      {"Let us know you'd like to pause and we'll take care of it. Add an optional note about how long or why."}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <Textarea
                    placeholder="e.g. Going on vacation for 2 weeks (optional)"
                    rows={3}
                    value={pauseReason}
                    onChange={(e) => setPauseReason(e.target.value)}
                    className="mt-2"
                  />
                  <AlertDialogFooter>
                    <AlertDialogCancel>Never mind</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handlePauseRequest}
                      disabled={isSendingPause}
                      className="bg-sage text-sage-foreground hover:bg-sage/90"
                    >
                      {isSendingPause && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Send Request
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  className="gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  <XCircle className="h-4 w-4" />
                  Cancel Subscription
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Cancel your subscription?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {"Your subscription will remain active until the end of your current billing period — you won't lose any deliveries you've already paid for. You can resubscribe at any time."}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep subscription</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleCancel}
                    disabled={isCancelling}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {isCancelling && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Yes, cancel
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main exported component — renders one card per subscription
// ---------------------------------------------------------------------------
export function SubscriptionPanel({ userId, subscriptions }: SubscriptionPanelProps) {
  const visibleSubscriptions = subscriptions.filter(
    (s) => s.status === "active" || s.cancel_at_period_end
  )

  if (visibleSubscriptions.length === 0) {
    return <NoSubscriptionCard />
  }

  return (
    <div className="space-y-6">
      {visibleSubscriptions.map((sub, i) => (
        <SingleSubscriptionCard
          key={sub.id}
          subscription={sub}
          index={i}
          totalCount={visibleSubscriptions.length}
        />
      ))}

      <div className="flex justify-center pt-2">
        <Button variant="outline" asChild className="gap-2">
          <Link href="/subscribe">
            <Plus className="h-4 w-4" />
            Add Another Subscription
          </Link>
        </Button>
      </div>
    </div>
  )
}