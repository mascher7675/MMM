//components/account/subscription-panel.tsx

"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
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
} from "lucide-react"
import {
  updateDeliveryDay,
  cancelSubscriptionAtPeriodEnd,
  reactivateSubscription,
  createBillingPortalSession,
  syncPeriodEndFromStripe,
  swapSubscriptionMilk,
  requestSubscriptionPause,
  cancelPauseRequest,
} from "@/app/actions/subscription"
import { isDeliveryDayLocked } from "@/lib/delivery-utils"
import { PRODUCTS } from "@/lib/products"
import Image from "next/image"
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
  delivery_dates: string[] | null
  subscription_items: SubscriptionItem[]
  // Pause fields
  pause_status: "none" | "pending" | "approved" | null
  pause_requested_from: string | null
  pause_requested_until: string | null
  pause_skip_dates: string[] | null
  pause_note: string | null
  stripe_pause_resumes_at: string | null
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
const CUTOFF_HOUR = 17

function getNextDeliveryDate(targetDay: typeof THURSDAY | typeof FRIDAY): Date {
  const now = new Date()
  const result = new Date(now)
  let daysUntil = (targetDay - now.getDay() + 7) % 7
  if (daysUntil === 0) daysUntil = 7
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

// Deterministic date helpers — never use toLocaleDateString() which can
// differ between Node.js (SSR) and the browser, causing hydration errors.
const WEEKDAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"]
const MONTHS_LONG = ["January","February","March","April","May","June","July","August","September","October","November","December"]
const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]

function parseDateParts(dateStr: string): { y: number; m: number; d: number } {
  const ymd = dateStr.length > 10 ? dateStr.slice(0, 10) : dateStr
  const [y, m, d] = ymd.split("-").map(Number)
  return { y, m, d }
}

function formatDateLong(dateStr: string): string {
  // "Thursday, May 21" style
  const { y, m, d } = parseDateParts(dateStr)
  const jsDate = new Date(y, m - 1, d)
  return `${WEEKDAYS[jsDate.getDay()]}, ${MONTHS_LONG[m - 1]} ${d}`
}

function formatDateShort(dateStr: string): string {
  // "May 21" style
  const { m, d } = parseDateParts(dateStr)
  return `${MONTHS_SHORT[m - 1]} ${d}`
}

function formatDateFull(dateStr: string): string {
  // "May 21, 2026" style
  const { y, m, d } = parseDateParts(dateStr)
  return `${MONTHS_LONG[m - 1]} ${d}, ${y}`
}

function toDateStr(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
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
// Helper — resolve product image for a single item
// ---------------------------------------------------------------------------
function getItemImage(item: SubscriptionItem): string {
  const product = PRODUCTS.find((p) => p.id === item.product_id)
  if (product?.image) return product.image
  const mt = milkTypeFromProductId(item.product_id)
  if (mt) {
    const byType = PRODUCTS.find((p) => p.milkType === mt && p.size === item.size)
    if (byType?.image) return byType.image
  }
  return PRODUCTS[0]?.image ?? "/images/2jars-home.jpg"
}

// ---------------------------------------------------------------------------
// Reusable collapsible row
// ---------------------------------------------------------------------------
function CollapsibleRow({
  icon,
  label,
  sublabel,
  open,
  onToggle,
  children,
  isFirst = false,
}: {
  icon: React.ReactNode
  label: string
  sublabel?: string
  open: boolean
  onToggle: () => void
  children: React.ReactNode
  isFirst?: boolean
}) {
  return (
    <div className={!isFirst ? "border-t border-border" : ""}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full cursor-pointer items-center justify-between px-4 py-3 text-left transition-colors hover:bg-secondary/40"
      >
        <div className="flex items-center gap-2.5">
          <span className="text-muted-foreground">{icon}</span>
          <div>
            <span className="text-sm font-medium text-foreground">{label}</span>
            {sublabel && !open && (
              <span className="ml-2 text-xs text-muted-foreground">{sublabel}</span>
            )}
          </div>
        </div>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="border-t border-border px-4 pb-4 pt-3">
          {children}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// No subscription CTA
// ---------------------------------------------------------------------------
function NoSubscriptionCard() {
  return (
    <div className="flex flex-col items-center py-8 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-sage/10">
        <ShoppingBag className="h-7 w-7 text-sage" />
      </div>
      <h3 className="mb-1 font-serif text-lg font-medium text-foreground">No active subscription</h3>
      <p className="mb-6 max-w-xs text-sm text-muted-foreground">
        Get fresh deliveries to your door every week.
      </p>
      <Button asChild>
        <Link href="/subscribe">Start a Subscription</Link>
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Paused subscription card (status === "paused")
// ---------------------------------------------------------------------------
function PausedSubscriptionCard({ subscription }: { subscription: Subscription }) {
  const items = subscription.subscription_items
  const itemSummary = items.length > 0
    ? items.map((i) => `${i.product_name} ×${i.quantity}`).join(", ")
    : "Your subscription"

  return (
    <div className="rounded-lg border border-border bg-card/50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
        <PauseCircle className="h-5 w-5 shrink-0 text-amber-500" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="secondary" className="text-xs shrink-0">Paused</Badge>
            <span className="text-sm text-muted-foreground truncate">{itemSummary}</span>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="px-4 py-4 space-y-3">
        <p className="text-sm text-muted-foreground">
          Your subscription is currently paused. Deliveries are on hold — we&apos;ll resume them once your pause period ends or you reach out to us.
        </p>
        {subscription.stripe_pause_resumes_at && (
          <p className="text-xs text-muted-foreground">
            Billing resumes automatically on{" "}
            <span className="font-medium text-foreground">
              {formatDateFull(subscription.stripe_pause_resumes_at)}
            </span>
          </p>
        )}
        {subscription.pause_skip_dates && subscription.pause_skip_dates.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Skipping:{" "}
            <span className="font-medium text-foreground">
              {subscription.pause_skip_dates
                .slice()
                .sort()
                .map((d) => formatDateLong(d))
                .join(", ")}
            </span>
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Questions?{" "}
          <Link href="/#contact" className="underline hover:text-foreground">
            Contact us
          </Link>{" "}
          and we&apos;ll get your deliveries back on track.
        </p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Single subscription card
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

  // ── All state & hooks must come first — before any early returns ──────────

  const [isUpdatingDay, setIsUpdatingDay] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)
  const [isReactivating, setIsReactivating] = useState(false)
  const [isOpeningBilling, setIsOpeningBilling] = useState(false)
  const [isSendingPause, setIsSendingPause] = useState(false)
  const [isCancellingPause, setIsCancellingPause] = useState(false)
  const [selectedSkipDates, setSelectedSkipDates] = useState<string[]>([])

  const [selectedDay, setSelectedDay] = useState<"thursday" | "friday">(
    isValidActiveSubscription(subscription)
      ? (subscription.delivery_day as "thursday" | "friday")
      : "thursday"
  )
  const [pauseNote, setPauseNote] = useState("")

  const [dayUpdateSuccess, setDayUpdateSuccess] = useState(false)
  const [pauseSuccess, setPauseSuccess] = useState(false)
  const [reactivateSuccess, setReactivateSuccess] = useState(false)
  const [localPauseStatus, setLocalPauseStatus] = useState<"none" | "pending" | "approved" | null>(null)
  const [submittedSkipDates, setSubmittedSkipDates] = useState<string[]>([])
  const [pauseDialogOpen, setPauseDialogOpen] = useState(false)

  const [openSection, setOpenSection] = useState<"order" | "milk" | "delivery" | null>(null)

  function toggleSection(section: "order" | "milk" | "delivery") {
    setOpenSection((prev) => (prev === section ? null : section))
  }

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

  // All date/time state is null on SSR and populated client-side only to avoid
  // hydration mismatches from new Date() differing between server and browser.
  const [todayISO, setTodayISO] = useState<string | null>(null)
  const [isSelectedDayLocked, setIsSelectedDayLocked] = useState(false)
  const [isMilkLocked, setIsMilkLocked] = useState(false)
  const [deliveryOptions, setDeliveryOptions] = useState<{ day: "thursday" | "friday"; date: Date }[]>([])

  useEffect(() => {
    const d = new Date()
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, "0")
    const dd = String(d.getDate()).padStart(2, "0")
    setTodayISO(`${yyyy}-${mm}-${dd}`)
    setIsSelectedDayLocked(isDeliveryDayLocked(selectedDay))
    setIsMilkLocked(isDeliveryDayLocked(subscription.delivery_day as "thursday" | "friday"))
    setDeliveryOptions(
      [
        { day: "thursday" as const, date: getNextDeliveryDate(THURSDAY) },
        { day: "friday" as const, date: getNextDeliveryDate(FRIDAY) },
      ].sort((a, b) => a.date.getTime() - b.date.getTime())
    )
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Re-check lock state when selectedDay changes
  useEffect(() => {
    setIsSelectedDayLocked(isDeliveryDayLocked(selectedDay))
  }, [selectedDay])

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

  // ── Early returns (after all hooks) ───────────────────────────────────────

  if (subscription.status === "paused") {
    return <PausedSubscriptionCard subscription={subscription} />
  }

  if (!isValidActiveSubscription(subscription)) {
    const sub = subscription
    return (
      <div className="rounded-lg border border-border bg-card/50 px-4 py-3">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs shrink-0">
            {sub.status === "cancelled" ? "Cancelled" : "Inactive"}
          </Badge>
          <span className="text-sm text-muted-foreground truncate">
            {sub.subscription_items.length > 0
              ? sub.subscription_items.map((i) => `${i.product_name} ×${i.quantity}`).join(", ")
              : "No items"}
          </span>
        </div>
      </div>
    )
  }

  // ── Active subscription render ─────────────────────────────────────────────

  const activeSubscription = subscription
  const pauseStatus = localPauseStatus ?? activeSubscription.pause_status ?? "none"
  const isCancellationScheduled = activeSubscription.cancel_at_period_end

  const monthlyTotal = activeSubscription.subscription_items.reduce(
    (sum, item) => sum + item.price_cents * item.quantity,
    0
  )

  const currentMilkSummary = activeSubscription.subscription_items
    .map((item) => {
      const mt = milkTypeFromProductId(item.product_id)
      return mt ? MILK_OPTIONS.find((o) => o.type === mt)?.label : null
    })
    .filter(Boolean)
    .join(", ")

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
    const result = await requestSubscriptionPause(
      activeSubscription.id,
      selectedSkipDates,
      pauseNote
    )
    setIsSendingPause(false)
    if (result.error) {
      setError(result.error)
    } else {
      const dates = [...selectedSkipDates]
      setPauseDialogOpen(false)
      setPauseNote("")
      setSelectedSkipDates([])
      setSubmittedSkipDates(dates)
      setPauseSuccess(true)
      setTimeout(() => {
        setPauseSuccess(false)
        setLocalPauseStatus("pending")
      }, 5000)
    }
  }

  async function handleCancelPauseRequest() {
    setIsCancellingPause(true)
    setError(null)
    const result = await cancelPauseRequest(activeSubscription.id)
    setIsCancellingPause(false)
    if (result.error) {
      setError(result.error)
    } else {
      setPauseSuccess(false)
      setLocalPauseStatus(null)
      setSubmittedSkipDates([])
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

  const remainingDeliveries = todayISO
    ? allDeliveries.filter((d) => {
        const dISO = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
        return dISO >= todayISO
      })
    : []

  const lastDeliveryDisplay: string | null = finalDeliveryDate
    ? formatDateLong(toDateStr(finalDeliveryDate))
    : cancelSessionFinalDate ?? null

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* ── Cancellation banner ─────────────────────────────────────────── */}
      {isCancellationScheduled && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="flex-1 space-y-2">
              <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
                Cancellation scheduled
              </p>
              {remainingDeliveries.length > 0 ? (
                <div className="space-y-1">
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    You have{" "}
                    <span className="font-semibold">
                      {remainingDeliveries.length}{" "}
                      {remainingDeliveries.length === 1 ? "delivery" : "deliveries"}
                    </span>{" "}
                    remaining:
                  </p>
                  <ul className="space-y-0.5">
                    {remainingDeliveries.map((d, i) => (
                      <li
                        key={d.toISOString()}
                        className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400"
                      >
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400 dark:bg-amber-500 shrink-0" />
                        <span className={i === remainingDeliveries.length - 1 ? "font-medium" : ""}>
                          {formatDateLong(toDateStr(d))}
                          {i === remainingDeliveries.length - 1 && " — final delivery"}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : lastDeliveryDisplay ? (
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  Your last delivery was on <span className="font-medium">{lastDeliveryDisplay}</span>.
                </p>
              ) : (
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  {isSyncingPeriodEnd ? (
                    <span className="flex items-center gap-1.5">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Loading delivery schedule…
                    </span>
                  ) : (
                    "Your deliveries will stop at the end of the current billing period."
                  )}
                </p>
              )}
            </div>
          </div>
          <div className="mt-3">
            {reactivateSuccess ? (
              <div className="flex items-center gap-2 rounded-md border border-sage/40 bg-sage/10 px-3 py-2 text-xs text-sage">
                <CheckCircle className="h-3.5 w-3.5" />
                Reactivated — your deliveries will continue as normal.
              </div>
            ) : (
              <Button
                onClick={handleReactivate}
                disabled={isReactivating}
                variant="outline"
                size="sm"
                className="w-full gap-2 border-amber-300 bg-white text-amber-900 hover:bg-amber-50 dark:border-amber-700 dark:bg-transparent dark:text-amber-200"
              >
                {isReactivating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                Keep my subscription
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Main panel */}
      <div className="rounded-lg border border-border overflow-hidden">

        {/* Order details */}
        <div>
          <button
            type="button"
            onClick={() => toggleSection("order")}
            className="flex w-full cursor-pointer items-center justify-between px-4 py-3 text-left transition-colors hover:bg-secondary/40"
          >
            <div className="flex items-center gap-2 min-w-0">
              {isCancellationScheduled ? (
                <Badge variant="secondary" className="text-xs shrink-0">Cancelling</Badge>
              ) : (
                <Badge className="bg-sage text-white text-xs shrink-0">Active</Badge>
              )}
              <span className="text-sm text-muted-foreground truncate">
                {activeSubscription.subscription_items.map((i) => `${i.product_name} ×${i.quantity}`).join(", ")}
              </span>
            </div>
            <ChevronDown className={`h-4 w-4 shrink-0 ml-2 text-muted-foreground transition-transform duration-200 ${openSection === "order" ? "rotate-180" : ""}`} />
          </button>

          {openSection === "order" && (
            <div className="border-t border-border px-4 pb-4 pt-3 space-y-3">
              {activeSubscription.subscription_items.map((item) => (
                <div key={item.id} className="flex items-center gap-3">
                  {/* Small rounded thumbnail */}
                  <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-border">
                    <Image
                      src={getItemImage(item)}
                      alt={item.product_name}
                      fill
                      className="object-cover"
                      sizes="48px"
                    />
                  </div>
                  {/* Name + price */}
                  <div className="flex flex-1 items-center justify-between min-w-0">
                    <span className="text-sm text-foreground truncate">{item.product_name} × {item.quantity}</span>
                    <span className="ml-2 shrink-0 text-sm text-muted-foreground">{formatPrice(item.price_cents * item.quantity)}/mo</span>
                  </div>
                </div>
              ))}

              {/* Total */}
              <div className="flex justify-between text-sm font-semibold border-t border-border pt-2">
                <span className="text-foreground">Total</span>
                <span className="text-foreground">{formatPrice(monthlyTotal)}/mo</span>
              </div>

              {/* Billing button */}
              <button
                type="button"
                onClick={handleManageBilling}
                disabled={isOpeningBilling}
                className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary/40 hover:text-foreground disabled:opacity-50"
              >
                {isOpeningBilling ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                Manage billing & payment method
              </button>
            </div>
          )}
        </div>

        {/* Change milk */}
        <CollapsibleRow
          icon={<Repeat2 className="h-4 w-4" />}
          label="Change Your Milk"
          sublabel={currentMilkSummary || undefined}
          open={openSection === "milk"}
          onToggle={() => { toggleSection("milk"); setSwapError(null) }}
        >
          <div className="mb-3 rounded-md border border-border bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Editing window:</span> Changes close at{" "}
            <span className="font-medium">5 PM the evening before</span> your delivery and reopen at{" "}
            <span className="font-medium">12 PM (noon) on delivery day</span>.
          </div>
          {isMilkLocked && (
            <div className="mb-3 flex items-center gap-1.5 rounded-md border border-border bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
              <Lock className="h-3 w-3 shrink-0" />
              Milk type changes are locked until 12 PM on your delivery day. Check back at noon!
            </div>
          )}
          {swapError && (
            <div className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {swapError}
            </div>
          )}
          {(() => {
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

              let itemLabel: string
              if (swappableItems.length === 1) {
                itemLabel = ""
              } else if (sizeCount[item.size] > 1) {
                sizeIndex[item.size] = (sizeIndex[item.size] ?? 0) + 1
                const bottleWord = item.quantity > 1 ? `Bottles` : `Bottle`
                itemLabel = `${item.size} — ${bottleWord} ${sizeIndex[item.size]}${item.quantity > 1 ? ` (×${item.quantity})` : ""}`
              } else {
                itemLabel = item.quantity > 1 ? `${item.size} (×${item.quantity})` : item.size
              }

              const showDivider = itemIndex > 0 && swappableItems.length > 1

              return (
                <div key={item.id} className={`space-y-2.5${showDivider ? " border-t border-border pt-3 mt-1" : ""}`}>
                  {itemLabel && (
                    <p className="text-xs font-medium text-muted-foreground">{itemLabel}</p>
                  )}
                  <div className="grid grid-cols-3 gap-2">
                    {MILK_OPTIONS.map(({ type, label }) => (
                      <button
                        key={type}
                        type="button"
                        disabled={isSwapping || isMilkLocked}
                        onClick={() => setSelectedMilkTypes((prev) => ({ ...prev, [item.id]: type }))}
                        className={`rounded-lg border-2 px-2 py-2 text-center text-xs font-medium transition-all disabled:opacity-50 ${
                          selectedMilk === type
                            ? "border-sage bg-sage/10 text-foreground"
                            : "border-border hover:border-sage/50 text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {label}
                        {type === currentMilk && (
                          <span className="block text-[10px] font-normal text-muted-foreground mt-0.5">current</span>
                        )}
                      </button>
                    ))}
                  </div>
                  <div className="flex justify-center">
                    {swapSuccess ? (
                      <div className="flex items-center gap-1.5 text-xs text-sage">
                        <CheckCircle className="h-3.5 w-3.5" />
                        Updated! Takes effect next delivery.
                      </div>
                    ) : (
                      <Button
                        onClick={() => handleMilkSwap(item, selectedMilk as "oat" | "almond" | "hemp")}
                        disabled={!hasChanged || isSwapping || isMilkLocked}
                        variant="outline"
                        size="sm"
                        className="gap-2 px-6 cursor-pointer"
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
        </CollapsibleRow>

        {/* Delivery day */}
        <CollapsibleRow
          icon={<CalendarDays className="h-4 w-4" />}
          label="Delivery Day"
          sublabel={(() => {
            const day = activeSubscription.delivery_day
            const label = day.charAt(0).toUpperCase() + day.slice(1) + "s"
            if (deliveryOptions.length === 0) return `${label}`
            const match = deliveryOptions.find((o) => o.day === day)
            const dateStr = match ? formatDateShort(toDateStr(match.date)) : ""
            return dateStr ? `${label} · Next: ${dateStr}` : label
          })()}
          open={openSection === "delivery"}
          onToggle={() => toggleSection("delivery")}
        >
          <div className="space-y-3">
            <div className="rounded-md border border-border bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Editing window:</span> Changes close at{" "}
              <span className="font-medium">5 PM the evening before</span> your delivery and reopen at{" "}
              <span className="font-medium">12 PM (noon) on delivery day</span>.
            </div>
            <div className="grid grid-cols-2 gap-2">
              {deliveryOptions.map(({ day, date }) => {
                const locked = isDeliveryDayLocked(day)
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => !locked && setSelectedDay(day)}
                    disabled={locked}
                    className={`rounded-lg border-2 p-3 text-left transition-all ${
                      locked
                        ? "cursor-not-allowed border-border opacity-50"
                        : selectedDay === day
                        ? "cursor-pointer border-sage bg-sage/10"
                        : "cursor-pointer border-border hover:border-sage/50"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-foreground capitalize">{day}s</p>
                      {locked && <Lock className="h-3 w-3 text-muted-foreground" />}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">Next: {formatDateShort(toDateStr(date))}</p>
                  </button>
                )
              })}
            </div>
            {isSelectedDayLocked && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Lock className="h-3 w-3 shrink-0" />
                Changes to {selectedDay} delivery are locked until 12 PM on {selectedDay}. Check back at noon!
              </p>
            )}
            <div className="flex justify-center">
              <Button
                onClick={handleUpdateDay}
                disabled={isUpdatingDay || selectedDay === activeSubscription.delivery_day || isSelectedDayLocked}
                variant="outline"
                size="sm"
                className="gap-2 px-6 cursor-pointer"
              >
                {isUpdatingDay ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : dayUpdateSuccess ? (
                  <CheckCircle className="h-4 w-4 text-sage" />
                ) : null}
                {dayUpdateSuccess ? "Delivery day updated!" : "Save Delivery Day"}
              </Button>
            </div>
          </div>
        </CollapsibleRow>
      </div>

      {/* ── Manage subscription (pause & cancel) ────────────────────────── */}
      {!isCancellationScheduled && (
        <div className="rounded-lg border border-border overflow-hidden">

          {/* ── Pause section — state machine on pause_status ── */}
          {pauseSuccess ? (
            <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
              <CheckCircle className="h-4 w-4 shrink-0 text-sage" />
              <span className="text-sm text-foreground">Pause request sent! We&apos;ll be in touch shortly.</span>
            </div>
          ) : pauseStatus === "approved" ? (
            <div className="flex items-start gap-3 border-b border-border px-4 py-3">
              <PauseCircle className="h-4 w-4 shrink-0 text-amber-500 mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">Deliveries paused</p>
                {activeSubscription.pause_skip_dates && activeSubscription.pause_skip_dates.length > 0 && (() => {
                  const sorted = activeSubscription.pause_skip_dates.slice().sort()
                  const lastSkip = sorted[sorted.length - 1]
                  return (
                    <>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Skipping:{" "}
                        {sorted.map((d) => formatDateLong(d)).join(", ")}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Deliveries resume the week after{" "}
                        {formatDateShort(lastSkip)}.
                      </p>
                    </>
                  )
                })()}
                {!activeSubscription.pause_skip_dates?.length && activeSubscription.stripe_pause_resumes_at && (
                  <p className="text-xs text-muted-foreground">
                    Billing resumes automatically on{" "}
                    {formatDateFull(activeSubscription.stripe_pause_resumes_at)}
                  </p>
                )}
              </div>
            </div>
          ) : pauseStatus === "pending" ? (
            <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
              <div className="flex items-start gap-2.5 min-w-0">
                <PauseCircle className="h-4 w-4 shrink-0 text-amber-500 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-foreground">Pause request pending</p>
                  <p className="text-xs text-muted-foreground">
                    {(() => {
                      const dates = submittedSkipDates.length > 0
                        ? submittedSkipDates
                        : (activeSubscription.pause_skip_dates ?? [])
                      return dates.length > 0
                        ? `Skipping: ${dates.slice().sort().map((d) => formatDateLong(d)).join(", ")}`
                        : "Awaiting confirmation"
                    })()}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCancelPauseRequest}
                disabled={isCancellingPause}
                className="shrink-0 text-xs text-muted-foreground underline hover:text-foreground disabled:opacity-50"
              >
                {isCancellingPause ? "Cancelling…" : "Cancel request"}
              </button>
            </div>
          ) : (
            <AlertDialog open={pauseDialogOpen} onOpenChange={(o) => {
              setPauseDialogOpen(o)
              if (!o) { setSelectedSkipDates([]); setPauseNote("") }
            }}>
              <AlertDialogTrigger asChild>
                <button
                  type="button"
                  onClick={() => setPauseDialogOpen(true)}
                  className="flex w-full cursor-pointer items-center gap-2.5 border-b border-border px-4 py-3 text-left text-sm transition-colors hover:bg-secondary/40"
                >
                  <PauseCircle className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div>
                    <p className="font-medium text-foreground">Request a Pause</p>
                    <p className="text-xs text-muted-foreground">Skip upcoming deliveries while away</p>
                  </div>
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent className="max-w-md">
                <AlertDialogHeader>
                  <AlertDialogTitle>Request a Pause</AlertDialogTitle>
                  <AlertDialogDescription>
                    Select the upcoming deliveries you&apos;d like to skip. Your billing will shift forward to account for the missed weeks — no refund needed.
                  </AlertDialogDescription>
                </AlertDialogHeader>

                {(() => {
                  if (!todayISO) return null
                  const upcomingDates = (activeSubscription.delivery_dates ?? [])
                    .map((d: string) => d.length > 10 ? d.slice(0, 10) : d)
                    .filter((d: string) => d >= todayISO)
                    .sort()

                  if (upcomingDates.length === 0) {
                    return (
                      <p className="mt-2 text-sm text-muted-foreground">
                        No upcoming deliveries found in this billing cycle.
                      </p>
                    )
                  }

                  return (
                    <div className="mt-3 space-y-2">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Select deliveries to skip
                      </p>
                      {upcomingDates.map((d: string) => {
                        const checked = selectedSkipDates.includes(d)
                        const label = formatDateLong(d)
                        return (
                          <button
                            key={d}
                            type="button"
                            onClick={() =>
                              setSelectedSkipDates((prev) =>
                                prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]
                              )
                            }
                            className={`flex w-full cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                              checked
                                ? "border-amber-300 bg-amber-50 text-amber-900"
                                : "border-border hover:bg-secondary/40"
                            }`}
                          >
                            <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 transition-colors ${
                              checked ? "border-amber-400 bg-amber-400" : "border-muted-foreground/30"
                            }`}>
                              {checked && (
                                <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 10 10">
                                  <path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              )}
                            </span>
                            {label}
                          </button>
                        )
                      })}
                    </div>
                  )
                })()}

                <Textarea
                  placeholder="Reason (optional) — e.g. Going on vacation June 10–24"
                  rows={2}
                  value={pauseNote}
                  onChange={(e) => setPauseNote(e.target.value)}
                  className="mt-3"
                />

                <div className="mt-4 flex justify-end gap-3">
                  <Button
                    variant="outline"
                    onClick={() => { setPauseDialogOpen(false); setSelectedSkipDates([]); setPauseNote("") }}
                  >
                    Never mind
                  </Button>
                  <Button
                    onClick={handlePauseRequest}
                    disabled={isSendingPause || selectedSkipDates.length === 0}
                  >
                    {isSendingPause ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending…</> : "Send Request"}
                  </Button>
                </div>
              </AlertDialogContent>
            </AlertDialog>
          )}

          {/* ── Cancel subscription ─────────────────────────────────────── */}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button
                type="button"
                className="flex w-full cursor-pointer items-center gap-2.5 px-4 py-3 text-left text-sm transition-colors hover:bg-destructive/5"
              >
                <XCircle className="h-4 w-4 shrink-0 text-destructive/70" />
                <div>
                  <p className="font-medium text-destructive/90">Cancel Subscription</p>
                  <p className="text-xs text-muted-foreground">Deliveries stop at end of billing period</p>
                </div>
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Cancel your subscription?</AlertDialogTitle>
                <AlertDialogDescription>
                  Your deliveries will continue through the end of your current billing period — you&apos;ll receive everything you&apos;ve already paid for. After that, billing and deliveries will stop.
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
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main exported component — renders one card per subscription
// ---------------------------------------------------------------------------
export function SubscriptionPanel({ userId, subscriptions }: SubscriptionPanelProps) {
  const visibleSubscriptions = subscriptions.filter(
    (s) => s.status === "active" || s.status === "paused" || s.cancel_at_period_end
  )

  if (visibleSubscriptions.length === 0) {
    return <NoSubscriptionCard />
  }

  return (
    <div className="space-y-6">
      {visibleSubscriptions.map((sub, i) => (
        <div key={sub.id} className="space-y-4">
          {visibleSubscriptions.length > 1 && (
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Subscription {i + 1}
            </p>
          )}
          <SingleSubscriptionCard
            subscription={sub}
            index={i}
            totalCount={visibleSubscriptions.length}
          />
        </div>
      ))}

      <div className="flex justify-center pt-1">
        <Button variant="outline" size="sm" asChild className="gap-2 text-muted-foreground">
          <Link href="/subscribe">
            <Plus className="h-4 w-4" />
            Add another subscription
          </Link>
        </Button>
      </div>
    </div>
  )
}