//components/account/subscription-panel.tsx
 
"use client"
 
import { useState, useEffect, useRef, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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
  Check,
  CheckCircle,
  Loader2,
  ShoppingBag,
  RotateCcw,
  CreditCard,
  Lock,
  Repeat2,
  ChevronDown,
  Plus,
  SkipForward,
  Truck,
  Recycle,
} from "lucide-react"
import {
  updateDeliveryDay,
  cancelSubscriptionAtPeriodEnd,
  reactivateSubscription,
  createBillingPortalSession,
  syncPeriodEndFromStripe,
  swapSubscriptionMilk,
  skipWeeklyDelivery,
  unskipWeeklyDelivery,
  toggleJarCollectionInterest,
} from "@/app/actions/subscription"
import { isSkipLocked, isDeliveryDayChangeLocked, computeDeliveryDates, isDeliveryDayMorning } from "@/lib/delivery-utils"
import { PRODUCTS } from "@/lib/products"
import { computeProcessingFeeCents } from "@/lib/fees"
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
  skipped_dates: string[] | null
  jar_collection_interest: boolean | null
  subscription_items: SubscriptionItem[]
}
 
interface SubscriptionPanelProps {
  userId: string
  subscriptions: Subscription[]
}
 
// ---------------------------------------------------------------------------
// Milk type config
// ---------------------------------------------------------------------------
const MILK_OPTIONS: { type: "oat" | "almond" | "hemp" | "cashew"; label: string }[] = [
  { type: "oat", label: "Oat" },
  { type: "almond", label: "Almond" },
  { type: "hemp", label: "Hemp Seed" },
  { type: "cashew", label: "Cashew" },
]
 
function milkTypeFromProductId(productId: string | undefined): "oat" | "almond" | "hemp" | "cashew" | null {
  if (!productId) return null
  if (productId.startsWith("oat")) return "oat"
  if (productId.startsWith("almond")) return "almond"
  if (productId.startsWith("hemp")) return "hemp"
  if (productId.startsWith("cashew")) return "cashew"
  return null
}
 
// ---------------------------------------------------------------------------
// Delivery day helpers
// ---------------------------------------------------------------------------
const THURSDAY = 4
const FRIDAY = 5
 
function getNextDeliveryDate(targetDay: typeof THURSDAY | typeof FRIDAY): Date {
  const now = new Date()
  const result = new Date(now)
  let daysUntil = (targetDay - now.getDay() + 7) % 7
  if (daysUntil === 0) daysUntil = 7
  // 5 PM cutoff — if delivery is tomorrow and it's past 5 PM, skip to next week
  if (daysUntil === 1 && now.getHours() >= 17) daysUntil = 8
  result.setDate(now.getDate() + daysUntil)
  result.setHours(0, 0, 0, 0)
  return result
}

// Same as getNextDeliveryDate, but walks forward week-by-week past any dates
// that are already in skippedDates, so the displayed "Next:" date reflects
// what will actually be delivered next, not just the next calendar weekday.
function getNextDeliveryDateSkipAware(
  targetDay: typeof THURSDAY | typeof FRIDAY,
  skippedDates: string[]
): Date {
  let candidate = getNextDeliveryDate(targetDay)
  let guard = 0
  while (guard < 52) {
    const iso = `${candidate.getFullYear()}-${String(candidate.getMonth() + 1).padStart(2, "0")}-${String(candidate.getDate()).padStart(2, "0")}`
    if (!skippedDates.includes(iso)) return candidate
    candidate = new Date(candidate)
    candidate.setDate(candidate.getDate() + 7)
    guard++
  }
  return candidate
}
 
// Deterministic date helpers — avoid toLocaleDateString() to prevent hydration errors
const WEEKDAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"]
const MONTHS_LONG = ["January","February","March","April","May","June","July","August","September","October","November","December"]
const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
 
function parseDateParts(dateStr: string): { y: number; m: number; d: number } {
  const ymd = dateStr.length > 10 ? dateStr.slice(0, 10) : dateStr
  const [y, m, d] = ymd.split("-").map(Number)
  return { y, m, d }
}
 
function formatDateLong(dateStr: string): string {
  const { y, m, d } = parseDateParts(dateStr)
  const jsDate = new Date(y, m - 1, d)
  return `${WEEKDAYS[jsDate.getDay()]}, ${MONTHS_LONG[m - 1]} ${d}`
}
 
function formatDateShort(dateStr: string): string {
  const { m, d } = parseDateParts(dateStr)
  return `${MONTHS_SHORT[m - 1]} ${d}`
}
 
function formatDateFull(dateStr: string): string {
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
  icon, label, sublabel, open, onToggle, children, isFirst = false,
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
// Weekly skip row — one row per upcoming delivery date
// ---------------------------------------------------------------------------
function SkipDeliveryRow({
  subscriptionIds,
  deliveryDate,
  isSkipped,
  locked,
  onToggle,
}: {
  // One row can drive multiple merged subscriptions at once — skipping a week
  // applies the same skip/unskip to every one of the customer's subscriptions.
  subscriptionIds: string[]
  deliveryDate: string
  isSkipped: boolean
  locked: boolean
  onToggle: (date: string, skipped: boolean) => void
}) {
  const [isPending, startTransition] = useTransition()
  const [rowError, setRowError] = useState<string | null>(null)

  function handleClick() {
    if (locked || isPending) return
    setRowError(null)
    startTransition(async () => {
      const results = await Promise.all(
        subscriptionIds.map((id) =>
          isSkipped
            ? unskipWeeklyDelivery(id, deliveryDate)
            : skipWeeklyDelivery(id, deliveryDate)
        )
      )
      const firstError = results.find((r) => r.error)?.error
      if (!firstError) {
        onToggle(deliveryDate, !isSkipped)
      } else {
        setRowError(firstError)
      }
    })
  }
 
  return (
    <div className="space-y-1">
      <div
        className={`flex items-center justify-between rounded-lg border px-3 py-2.5 transition-colors ${
          isSkipped
            ? "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30"
            : "border-border"
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`flex h-2 w-2 shrink-0 rounded-full ${isSkipped ? "bg-amber-400" : "bg-sage"}`} />
          <span className="text-sm text-foreground">{formatDateLong(deliveryDate)}</span>
          {isSkipped && (
            <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400 shrink-0">
              Skipped
            </Badge>
          )}
        </div>
        <button
          type="button"
          onClick={handleClick}
          disabled={locked || isPending}
          className="ml-3 shrink-0 cursor-pointer text-xs font-medium underline transition-colors text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : isSkipped ? (
            "Unskip"
          ) : (
            "Skip"
          )}
        </button>
      </div>
      {rowError && (
        <p className="px-1 text-xs text-destructive">{rowError}</p>
      )}
    </div>
  )
}
 
// ---------------------------------------------------------------------------
// Single subscription card
// ---------------------------------------------------------------------------
// A MergedItem is a subscription line item tagged with the id of the
// subscription it belongs to, so a milk swap can target the right one even
// when several subscriptions are merged into a single panel.
type MergedItem = SubscriptionItem & { __subId: string }

function SingleSubscriptionCard({
  subscriptions,
}: {
  // One OR MANY of the customer's live subscriptions, rendered as a single
  // panel. Shared edits (delivery day, skip a week, jar collection) fan out to
  // every subscription; milk swaps target the item's own subscription; cancel
  // lets the customer pick which subscriptions to end.
  subscriptions: Subscription[]
}) {
  const router = useRouter()

  // ── Merge model ───────────────────────────────────────────────────────────
  const allSubs = subscriptions
  const isMerged = allSubs.length > 1
  // The "primary" sub drives shared display fields (delivery day, billing,
  // skip dates). Prefer a live, non-cancelling one so those fields reflect an
  // active subscription; fall back gracefully.
  const primary =
    allSubs.find((s) => isValidActiveSubscription(s) && !s.cancel_at_period_end) ??
    allSubs.find((s) => isValidActiveSubscription(s)) ??
    allSubs[0]
  // Every line item across all merged subs, each tagged with its owning sub id.
  const mergedItems: MergedItem[] = allSubs.flatMap((s) =>
    s.subscription_items.map((it) => ({ ...it, __subId: s.id }))
  )
  // Subscriptions the customer can still choose to cancel (not already winding
  // down). Drives the cancel picker.
  const cancellableSubs = allSubs.filter((s) => !s.cancel_at_period_end)
  // Subscriptions currently scheduled to cancel — reactivate targets these.
  const cancellingSubs = allSubs.filter((s) => s.cancel_at_period_end)

  // ── State ─────────────────────────────────────────────────────────────────
  const [isUpdatingDay, setIsUpdatingDay] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)
  const [isReactivating, setIsReactivating] = useState(false)
  const [isOpeningBilling, setIsOpeningBilling] = useState(false)
 
  const [selectedDay, setSelectedDay] = useState<"thursday" | "friday">(
    isValidActiveSubscription(primary)
      ? (primary.delivery_day as "thursday" | "friday")
      : "thursday"
  )
 
  const [dayUpdateSuccess, setDayUpdateSuccess] = useState(false)
  const [reactivateSuccess, setReactivateSuccess] = useState(false)
 
  const [openSection, setOpenSection] = useState<"order" | "milk" | "delivery" | "skip" | "jars" | null>(null)
  function toggleSection(section: "order" | "milk" | "delivery" | "skip" | "jars") {
    setOpenSection((prev) => (prev === section ? null : section))
  }
 
  const [swappingItemId, setSwappingItemId] = useState<string | null>(null)
  const [swapSuccessItemId, setSwapSuccessItemId] = useState<string | null>(null)
  const [swapError, setSwapError] = useState<string | null>(null)
  const [selectedMilkTypes, setSelectedMilkTypes] = useState<Record<string, "oat" | "almond" | "hemp" | "cashew">>(() => {
    if (!isValidActiveSubscription(primary)) return {}
    const initial: Record<string, "oat" | "almond" | "hemp" | "cashew"> = {}
    for (const item of mergedItems) {
      const mt = milkTypeFromProductId(item.product_id)
      if (mt) initial[item.id] = mt
    }
    return initial
  })

  const [cancelSessionFinalDate, setCancelSessionFinalDate] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Which subscriptions the customer has selected to cancel (merged view only).
  // Defaults to all cancellable subs so the common "cancel everything" case is
  // one click.
  const [selectedCancelIds, setSelectedCancelIds] = useState<string[]>(
    cancellableSubs.map((s) => s.id)
  )
 
  // Local optimistic state for skipped dates
  const [localSkippedDates, setLocalSkippedDates] = useState<string[]>(
    (primary.skipped_dates ?? []).map((d) => d.length > 10 ? d.slice(0, 10) : d)
  )

  // Local optimistic state for jar collection interest, plus its own
  // pending/success flags — same pattern as the delivery-day save button.
  const [jarCollectionInterest, setJarCollectionInterest] = useState(
    Boolean(primary.jar_collection_interest)
  )
  const [isSavingJarPreference, setIsSavingJarPreference] = useState(false)
  const [jarPreferenceError, setJarPreferenceError] = useState<string | null>(null)
 
  // Client-only state to avoid hydration errors
  const [todayISO, setTodayISO] = useState<string | null>(null)
  const [isSelectedDayLocked, setIsSelectedDayLocked] = useState(false)
  const [isMilkLocked, setIsMilkLocked] = useState(false)
  const [isDeliverySkipLocked, setIsDeliverySkipLocked] = useState(false)
  // True only during the delivery-day window itself (midnight → 3 PM ET on the
  // customer's delivery weekday). Drives the "on its way today" banner. Computed
  // client-side to avoid SSR/browser hydration mismatch, same as the locks below.
  const [isDeliveryMorning, setIsDeliveryMorning] = useState(false)
  const [deliveryOptions, setDeliveryOptions] = useState<{ day: "thursday" | "friday"; date: Date }[]>([])
  // Upcoming delivery dates computed client-side only
  const [upcomingDates, setUpcomingDates] = useState<string[]>([])
 
  useEffect(() => {
    const d = new Date()
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, "0")
    const dd = String(d.getDate()).padStart(2, "0")
    setTodayISO(`${yyyy}-${mm}-${dd}`)
 
    const delivDay = primary.delivery_day as "thursday" | "friday"
    setIsSelectedDayLocked(isDeliveryDayChangeLocked())
    setIsMilkLocked(isSkipLocked(delivDay))
    setIsDeliverySkipLocked(isSkipLocked(delivDay))
    setIsDeliveryMorning(isDeliveryDayMorning(delivDay))
    // Compute upcoming 6 delivery dates on client only
    setUpcomingDates(computeDeliveryDates(delivDay, 6))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
 
  // Recompute the "Next:" date shown for each delivery-day option whenever
  // skipped dates change, so skipping the next delivery immediately updates
  // the Delivery Day sublabel instead of showing a date that's been skipped.
  useEffect(() => {
    setDeliveryOptions(
      [
        { day: "thursday" as const, date: getNextDeliveryDateSkipAware(THURSDAY, localSkippedDates) },
        { day: "friday" as const, date: getNextDeliveryDateSkipAware(FRIDAY, localSkippedDates) },
      ].sort((a, b) => a.date.getTime() - b.date.getTime())
    )
  }, [localSkippedDates]) // eslint-disable-line react-hooks/exhaustive-deps
 
  useEffect(() => {
    setIsSelectedDayLocked(isDeliveryDayChangeLocked())
  }, [selectedDay])
 
  const didSyncRef = useRef(false)
  const [isSyncingPeriodEnd, setIsSyncingPeriodEnd] = useState(false)
  useEffect(() => {
    if (
      !didSyncRef.current &&
      primary?.cancel_at_period_end &&
      !primary.current_period_end &&
      primary.id
    ) {
      didSyncRef.current = true
      setIsSyncingPeriodEnd(true)
      syncPeriodEndFromStripe(primary.id).then(({ current_period_end }) => {
        setIsSyncingPeriodEnd(false)
        if (current_period_end) router.refresh()
      })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
 
  // ── Early returns (after all hooks) ───────────────────────────────────────
 
  if (!isValidActiveSubscription(primary)) {
    const sub = primary
    return (
      <div className="rounded-lg border border-border bg-card/50 px-4 py-3">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs shrink-0">
            {sub.status === "cancelled" ? "Cancelled" : sub.status === "paused" ? "Paused" : "Inactive"}
          </Badge>
          <span className="text-sm text-muted-foreground truncate">
            {mergedItems.length > 0
              ? mergedItems.map((i) => `${i.product_name} ×${i.quantity}`).join(", ")
              : "No items"}
          </span>
        </div>
      </div>
    )
  }

  // ── Active subscription ───────────────────────────────────────────────────

  const activeSubscription = primary
  // Every merged sub must be winding down for the panel to read as "cancelling".
  const isCancellationScheduled = allSubs.every((s) => s.cancel_at_period_end)

  const weeklyTotal = mergedItems.reduce(
    (sum, item) => sum + item.price_cents * item.quantity,
    0
  )

  // The card-processing fee is charged as its own recurring line item on each
  // Stripe subscription, so it's computed per subscription and summed — not one
  // fee on the combined subtotal. This matches what the customer is actually
  // billed weekly.
  const weeklyProcessingFee = allSubs.reduce((sum, s) => {
    const subSubtotal = s.subscription_items.reduce(
      (a, it) => a + it.price_cents * it.quantity,
      0
    )
    return sum + computeProcessingFeeCents(subSubtotal)
  }, 0)
  const weeklyGrandTotal = weeklyTotal + weeklyProcessingFee

  const currentMilkSummary = mergedItems
    .map((item) => {
      const mt = milkTypeFromProductId(item.product_id)
      return mt ? MILK_OPTIONS.find((o) => o.type === mt)?.label : null
    })
    .filter(Boolean)
    .join(", ")
 
  // ── Handlers ─────────────────────────────────────────────────────────────
 
  async function handleUpdateDay() {
    if (selectedDay === activeSubscription.delivery_day) return
    setIsUpdatingDay(true)
    setError(null)
    // Apply the new delivery day to every merged subscription so they all
    // arrive on the same day.
    const results = await Promise.all(
      allSubs.map((s) => updateDeliveryDay(s.id, selectedDay))
    )
    setIsUpdatingDay(false)
    const firstError = results.find((r) => r.error)?.error
    if (firstError) {
      setError(firstError)
    } else {
      setDayUpdateSuccess(true)
      setTimeout(() => setDayUpdateSuccess(false), 3000)
      router.refresh()
    }
  }
 
  // Called from the cancel dialog's "Skip a delivery instead" button: closes
  // the dialog (via AlertDialogCancel) and opens/scrolls to the Skip section.
  function handleSkipInstead() {
    setOpenSection("skip")
    requestAnimationFrame(() => {
      document
        .getElementById(`skip-section-${activeSubscription.id}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" })
    })
  }

  async function handleCancel() {
    // In the merged view the customer picks which subscriptions to cancel; with
    // a single subscription it's just that one.
    const idsToCancel = isMerged
      ? cancellableSubs.filter((s) => selectedCancelIds.includes(s.id)).map((s) => s.id)
      : cancellableSubs.map((s) => s.id)
    if (idsToCancel.length === 0) return
    setIsCancelling(true)
    setError(null)
    try {
      for (const id of idsToCancel) {
        const result = await cancelSubscriptionAtPeriodEnd(id)
        if (result.error) throw new Error(result.error)
        if (!result.finalDeliveryDate) {
          await syncPeriodEndFromStripe(id)
        }
      }
    } catch (e) {
      setIsCancelling(false)
      setError(e instanceof Error ? e.message : "Something went wrong cancelling.")
      return
    }
    setIsCancelling(false)
    window.location.reload()
  }
 
  async function handleReactivate() {
    setIsReactivating(true)
    setError(null)
    // Reactivate every subscription that's currently scheduled to cancel.
    const results = await Promise.all(
      cancellingSubs.map((s) => reactivateSubscription(s.id))
    )
    setIsReactivating(false)
    const firstError = results.find((r) => r.error)?.error
    if (firstError) {
      setError(firstError)
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
 
  async function handleMilkSwap(item: MergedItem, newMilkType: "oat" | "almond" | "hemp" | "cashew") {
    const currentMilk = milkTypeFromProductId(item.product_id)
    if (newMilkType === currentMilk) return
    setSwappingItemId(item.id)
    setSwapError(null)
    const newProductId = `${newMilkType}-${item.size.replace("oz", "")}oz`
    // Swap on the subscription this specific item belongs to.
    const result = await swapSubscriptionMilk(item.__subId, item.id, newProductId)
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
 
  function handleSkipToggle(date: string, nowSkipped: boolean) {
    setLocalSkippedDates((prev) =>
      nowSkipped ? [...prev, date].sort() : prev.filter((d) => d !== date)
    )
  }

  async function handleJarCollectionToggle(interested: boolean) {
    if (interested === jarCollectionInterest || isSavingJarPreference) return
    const previous = jarCollectionInterest
    setJarCollectionInterest(interested) // optimistic
    setIsSavingJarPreference(true)
    setJarPreferenceError(null)
    // Apply the jar-collection preference to every merged subscription.
    const results = await Promise.all(
      allSubs.map((s) => toggleJarCollectionInterest(s.id, interested))
    )
    setIsSavingJarPreference(false)
    const firstError = results.find((r) => r.error)?.error
    if (firstError) {
      setJarCollectionInterest(previous) // revert on failure
      setJarPreferenceError(firstError)
    }
  }
 
  // ── Delivery date calculations ────────────────────────────────────────────
  // Session 14: final_delivery_date is now always set correctly and
  // directly by cancelSubscriptionAtPeriodEnd on the server — either a real
  // upcoming delivery date (already charged AND its cutoff has already
  // passed, so it's locked in and will still ship) or null (nothing more
  // owed or scheduled — refunded immediately if the cutoff hadn't passed
  // yet). No client-side re-derivation from current_period_end needed
  // anymore; the old getFinalDeliveryDate()/remainingDeliveries logic
  // searched the wrong direction relative to our billing model (cutoff is
  // the day BEFORE delivery, not on/after it) and could show a delivery
  // date days in the past. Trust the server value directly.
  const finalDeliveryDisplay: string | null = activeSubscription.final_delivery_date
    ? formatDateLong(activeSubscription.final_delivery_date)
    : null

  // The date by which the customer can still reactivate — their next billing
  // cutoff. Shown in the cancellation banner.
  const reactivateByDisplay: string | null = activeSubscription.current_period_end
    ? formatDateLong(activeSubscription.current_period_end)
    : null

  // The "final delivery is still coming / contact us" messaging is only
  // relevant through the delivery day itself. Once that day has passed, this
  // week's delivery has been made and the line drops off (the reactivate
  // option still remains until the next billing cutoff).
  const finalDeliveryStillUpcoming: boolean =
    !!activeSubscription.final_delivery_date &&
    todayISO !== null &&
    activeSubscription.final_delivery_date.slice(0, 10) >= todayISO

  const skippedCount = localSkippedDates.filter((d) => upcomingDates.includes(d)).length
 
  // ── Render ────────────────────────────────────────────────────────────────
 
  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
 
      {/* Cancellation banner — adaptive.
          Both cancel paths keep the subscription reactivatable until the next
          billing cutoff. final_delivery_date distinguishes them:
            • null  → cancelled before cutoff, this week refunded (no delivery)
            • set   → cancelled after cutoff, the paid delivery still ships
          The "final delivery / contact us" line only shows through the
          delivery day (finalDeliveryStillUpcoming). */}
      {isCancellationScheduled && (
        <div className="overflow-hidden rounded-xl border border-sage/30 bg-linear-to-br from-sage/[0.07] to-transparent p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sage/15 text-sage">
              <RotateCcw className="h-4 w-4" />
            </div>
            <div className="flex-1 space-y-1.5">
              <p className="text-sm font-semibold text-foreground">
                {finalDeliveryStillUpcoming ? "One last delivery, then cancelled" : "Subscription cancelled"}
              </p>

              {/* Primary status line */}
              {finalDeliveryDisplay ? (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Your delivery on <span className="font-medium text-foreground">{finalDeliveryDisplay}</span> was
                  already charged, so it will still {finalDeliveryStillUpcoming ? "arrive" : "have arrived"}. No
                  further deliveries are scheduled after that.
                </p>
              ) : isSyncingPeriodEnd ? (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Finalising your cancellation…
                </p>
              ) : (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  You won&apos;t be charged again, and your upcoming delivery has been refunded. Reactivate and we&apos;ll restore that delivery, re-charging the refunded amount.
                </p>
              )}

              {/* Reactivate deadline */}
              <p className="text-xs leading-relaxed text-muted-foreground">
                Changed your mind?{" "}
                {reactivateByDisplay ? (
                  <>Reactivate before <span className="font-medium text-foreground">{reactivateByDisplay}</span> to keep your weekly deliveries.</>
                ) : (
                  <>Reactivate before your next billing date to keep your weekly deliveries.</>
                )}
              </p>
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
                size="sm"
                className="w-full gap-2 bg-sage text-white hover:bg-sage/90"
              >
                {isReactivating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                Keep my subscription
              </Button>
            )}
          </div>

          {/* "This week" help line — only relevant through the delivery day */}
          {finalDeliveryStillUpcoming && (
            <p className="mt-2 text-center text-[11px] text-muted-foreground">
              Need help with this delivery? Just contact us.
            </p>
          )}
        </div>
      )}

      {/* Delivery-today banner — shows only on the customer's delivery
          weekday, before 3 PM ET, when this week isn't skipped and the
          subscription isn't in a cancellation-scheduled state (the
          cancellation banner above already covers that state). Purely
          informational; changes no delivery/billing logic. */}
      {isDeliveryMorning &&
        !isCancellationScheduled &&
        !(todayISO && localSkippedDates.includes(todayISO)) && (
          <div className="flex items-center gap-2.5 rounded-lg bg-sage px-4 py-3 text-sage-foreground">
            <Truck className="h-5 w-5 shrink-0" />
            <span className="text-sm font-medium">Your delivery is on its way today</span>
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
                {mergedItems.map((i) => `${i.product_name} ×${i.quantity}`).join(", ")}
              </span>
            </div>
            <ChevronDown className={`h-4 w-4 shrink-0 ml-2 text-muted-foreground transition-transform duration-200 ${openSection === "order" ? "rotate-180" : ""}`} />
          </button>

          {openSection === "order" && (
            <div className="border-t border-border px-4 pb-4 pt-3 space-y-3">
              {mergedItems.map((item) => (
                <div key={item.id} className="flex items-center gap-3">
                  <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-border">
                    <Image
                      src={getItemImage(item)}
                      alt={item.product_name}
                      fill
                      className="object-cover"
                      sizes="48px"
                    />
                  </div>
                  <div className="flex flex-1 items-center justify-between min-w-0">
                    <span className="text-sm text-foreground truncate">{item.product_name} × {item.quantity}</span>
                    <span className="ml-2 shrink-0 text-sm text-muted-foreground">{formatPrice(item.price_cents * item.quantity)}/wk</span>
                  </div>
                </div>
              ))}
              <div className="space-y-1 border-t border-border pt-2">
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Subtotal</span>
                  <span>{formatPrice(weeklyTotal)}/wk</span>
                </div>
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Processing fee</span>
                  <span>{formatPrice(weeklyProcessingFee)}/wk</span>
                </div>
                <div className="flex justify-between text-sm font-semibold pt-1">
                  <span className="text-foreground">Total</span>
                  <span className="text-foreground">{formatPrice(weeklyGrandTotal)}/wk</span>
                </div>
              </div>
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
            <span className="font-medium">3 PM on delivery day</span>.
          </div>
          {isMilkLocked && (
            <div className="mb-3 flex items-center gap-1.5 rounded-md border border-border bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
              <Lock className="h-3 w-3 shrink-0" />
              Milk type changes are locked until 3 PM on your delivery day.
            </div>
          )}
          {swapError && (
            <div className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {swapError}
            </div>
          )}
          {(() => {
            return mergedItems.map((item) => {
              const currentMilk = milkTypeFromProductId(item.product_id)
              const selectedMilk = selectedMilkTypes[item.id] ?? currentMilk ?? "oat"
              const hasChanged = selectedMilk !== currentMilk
              const isSwapping = swappingItemId === item.id
              const swapSuccess = swapSuccessItemId === item.id

              return (
                <div key={item.id} className="space-y-3 mb-4 last:mb-0">
                  {mergedItems.length > 1 && (
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      {item.product_name}
                    </p>
                  )}
                  <div className="grid grid-cols-2 gap-3 items-stretch">
                    {MILK_OPTIONS.map(({ type, label }) => (
                      <button
                        key={type}
                        type="button"
                        disabled={isMilkLocked || isSwapping}
                        onClick={() => setSelectedMilkTypes((prev) => ({ ...prev, [item.id]: type }))}
                        className={`flex flex-col items-center justify-center rounded-lg border-2 px-3 h-16 w-full text-center text-sm font-medium transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
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
                        onClick={() => handleMilkSwap(item, selectedMilk as "oat" | "almond" | "hemp" | "cashew")}
                        disabled={!hasChanged || isSwapping || isMilkLocked}
                        variant="outline"
                        size="sm"
                        className="gap-2 px-6 cursor-pointer"
                      >
                        {isSwapping ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : null}
                        {isSwapping ? "Saving…" : hasChanged ? "Save Change" : "No Changes"}
                      </Button>
                    )}
                  </div>
                </div>
              )
            })
          })()}
        </CollapsibleRow>
 
        {/* Skip deliveries */}
        <div id={`skip-section-${activeSubscription.id}`}>
        <CollapsibleRow
          icon={<SkipForward className="h-4 w-4" />}
          label="Skip a Delivery"
          sublabel={skippedCount > 0 ? `${skippedCount} skipped` : "No upcoming skips"}
          open={openSection === "skip"}
          onToggle={() => toggleSection("skip")}
        >
          <div className="space-y-3">
            <div className="rounded-md border border-border bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Cutoff:</span> Skip or unskip before{" "}
              <span className="font-medium">
                5 PM {activeSubscription.delivery_day === "friday" ? "Thursday" : "Wednesday"}
              </span>{" "}
              (the evening before) — no charge for skipped weeks.
            </div>
 
            {isDeliverySkipLocked && (
              <div className="flex items-center gap-1.5 rounded-md border border-border bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
                <Lock className="h-3 w-3 shrink-0" />
                The skip window for this week&apos;s delivery is closed. Please contact us if necessary.
              </div>
            )}
 
            {upcomingDates.length === 0 ? (
              <p className="text-sm text-muted-foreground">Loading upcoming deliveries…</p>
            ) : (
              <div className="space-y-2">
                {upcomingDates.map((date, idx) => (
                  <SkipDeliveryRow
                    key={date}
                    subscriptionIds={allSubs.map((s) => s.id)}
                    deliveryDate={date}
                    isSkipped={localSkippedDates.includes(date)}
                    locked={isDeliverySkipLocked && idx === 0 && (() => {
                      if (!todayISO) return false
                      const today = new Date(todayISO + "T12:00:00Z")
                      const delivery = new Date(date + "T12:00:00Z")
                      const diffDays = Math.round((delivery.getTime() - today.getTime()) / 86400000)
                      return diffDays <= 1
                    })()}
                    onToggle={handleSkipToggle}
                  />
                ))}
              </div>
            )}
          </div>
        </CollapsibleRow>
 
        {/* Delivery day (end skip-section anchor above) */}
        </div>
        <CollapsibleRow
          icon={<CalendarDays className="h-4 w-4" />}
          label="Delivery Day"
          sublabel={(() => {
            const day = activeSubscription.delivery_day
            const label = day.charAt(0).toUpperCase() + day.slice(1) + "s"
            if (deliveryOptions.length === 0) return label
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
              <span className="font-medium">5 PM Wednesday</span> and reopen{" "}
              <span className="font-medium">Friday at 3 PM</span>.
            </div>
            {isSelectedDayLocked && (
              <div className="flex items-center gap-1.5 rounded-md border border-border bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
                <Lock className="h-3 w-3 shrink-0" />
                Delivery day changes are locked for this week. Check back Friday at 3 PM.
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              {deliveryOptions.map(({ day, date }) => {
                const locked = isDeliveryDayChangeLocked()
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
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Next: {formatDateShort(toDateStr(date))}
                      {getNextDeliveryDate(day === "friday" ? FRIDAY : THURSDAY).getTime() !== date.getTime() && (
                        <span className="text-muted-foreground/70"> (this week skipped)</span>
                      )}
                    </p>
                  </button>
                )
              })}
            </div>
 
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

        {/* Jar collection */}
        <CollapsibleRow
          icon={<Recycle className="h-4 w-4" />}
          label="Jar Collection"
          sublabel={jarCollectionInterest ? "Requested for next delivery" : "Not requested"}
          open={openSection === "jars"}
          onToggle={() => toggleSection("jars")}
        >
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Interested in jar collection on your next delivery? Just leave your empty jars outside and we&apos;ll pick them up.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleJarCollectionToggle(true)}
                disabled={isSavingJarPreference}
                className={`flex-1 rounded-md border px-3 py-2 text-sm transition-all disabled:cursor-not-allowed disabled:opacity-60 ${
                  jarCollectionInterest
                    ? "border-sage bg-sage/10 font-medium text-sage cursor-pointer"
                    : "border-border bg-background text-muted-foreground hover:border-sage/50 cursor-pointer"
                }`}
              >
                Yes, please
              </button>
              <button
                type="button"
                onClick={() => handleJarCollectionToggle(false)}
                disabled={isSavingJarPreference}
                className={`flex-1 rounded-md border px-3 py-2 text-sm transition-all disabled:cursor-not-allowed disabled:opacity-60 ${
                  !jarCollectionInterest
                    ? "border-sage bg-sage/10 font-medium text-sage cursor-pointer"
                    : "border-border bg-background text-muted-foreground hover:border-sage/50 cursor-pointer"
                }`}
              >
                Not this time
              </button>
            </div>
            {isSavingJarPreference && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Saving…
              </p>
            )}
            {jarPreferenceError && (
              <p className="text-xs text-destructive">{jarPreferenceError}</p>
            )}
          </div>
        </CollapsibleRow>
      </div>
 
      {/* Cancel subscription — text link */}
      {!isCancellationScheduled && (
        <div className="flex justify-center pt-1">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button
                type="button"
                className="text-xs text-muted-foreground underline underline-offset-2 decoration-muted-foreground/40 transition-colors hover:text-destructive/70 hover:decoration-destructive/40 cursor-pointer"
              >
                Cancel subscription
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Need a break, or leaving for good?</AlertDialogTitle>
                <AlertDialogDescription>
                  If you just need to pause, skip a delivery and keep your subscription — you&apos;re never charged for skipped weeks.
                </AlertDialogDescription>
              </AlertDialogHeader>

              {/* Lighter path: skip instead (closes dialog + opens Skip section) */}
              <AlertDialogCancel asChild>
                <Button
                  type="button"
                  onClick={handleSkipInstead}
                  className="mt-0 w-full gap-2 bg-sage text-white hover:bg-sage/90"
                >
                  <SkipForward className="h-4 w-4" />
                  Skip a delivery instead
                </Button>
              </AlertDialogCancel>

              {/* Merged view: let the customer pick which subscriptions to end */}
              {isMerged && cancellableSubs.length > 1 && (
                <div className="mt-1 rounded-md border border-border bg-secondary/20 p-3">
                  <p className="mb-2 text-xs font-medium text-foreground">
                    Which would you like to cancel?
                  </p>
                  <div className="space-y-2">
                    {cancellableSubs.map((s) => {
                      const checked = selectedCancelIds.includes(s.id)
                      const label = s.subscription_items
                        .map((i) => `${i.product_name} ×${i.quantity}`)
                        .join(", ")
                      return (
                        <label key={s.id} className="flex cursor-pointer items-start gap-2.5 text-sm">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) =>
                              setSelectedCancelIds((prev) =>
                                e.target.checked
                                  ? [...prev, s.id]
                                  : prev.filter((id) => id !== s.id)
                              )
                            }
                            className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-sage"
                          />
                          <span className="leading-snug text-foreground">{label || "Subscription"}</span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* What happens if they do cancel — adapts to cutoff */}
              <div className="mt-1 border-t border-border pt-4">
                <p className="mb-3 text-xs font-medium text-muted-foreground">If you cancel:</p>
                <ul className="space-y-2.5">
                  {(isDeliverySkipLocked
                    ? [
                        "Your already-charged delivery still ships — cancelling only stops deliveries after it",
                        "You won't be charged again",
                        "Reactivate any time before your next billing date",
                      ]
                    : [
                        "If you've already been charged for your upcoming delivery, it's refunded in full",
                        "You won't be charged again",
                        "Reactivate any time before your next billing date",
                      ]
                  ).map((item, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm text-foreground">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-sage" />
                      <span className="leading-snug">{item}</span>
                    </li>
                  ))}
                </ul>
                {isDeliverySkipLocked && (
                  <p className="mt-3 text-xs text-muted-foreground">
                    Need help with this week&apos;s delivery? Just contact us.
                  </p>
                )}
              </div>

              <AlertDialogFooter>
                <AlertDialogCancel className="cursor-pointer">Keep subscription</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleCancel}
                  disabled={isCancelling || (isMerged && selectedCancelIds.length === 0)}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90 cursor-pointer"
                >
                  {isCancelling && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isMerged && selectedCancelIds.length !== cancellableSubs.length
                    ? "Cancel selected"
                    : "Cancel subscription"}
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
// Main exported component — merges all of the customer's live subscriptions
// into a single editable panel
// ---------------------------------------------------------------------------
export function SubscriptionPanel({ userId, subscriptions }: SubscriptionPanelProps) {
  // Only show subscriptions that are still "live" in some sense — active
  // (including pending-cancellation, which is still status "active" until
  // the webhook finalizes it) or paused. Once a subscription's status flips
  // to "cancelled", it's dropped from view. cancel_at_period_end is NOT used
  // here on its own — it's set once and never reset, so it would otherwise
  // keep a fully-cancelled subscription visible forever. Cancelled
  // subscriptions remain fully visible in order history / admin, just not
  // on this live account panel.
  const visibleSubscriptions = subscriptions.filter(
    (s) => s.status === "active" || s.status === "paused"
  )
 
  if (visibleSubscriptions.length === 0) {
    return <NoSubscriptionCard />
  }
 
  return (
    <div className="space-y-6">
      {/* All of the customer's live subscriptions are merged into one panel so
          there's a single place to edit delivery day, milk, skips, and to
          cancel. */}
      <SingleSubscriptionCard subscriptions={visibleSubscriptions} />

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