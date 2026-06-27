// lib/delivery-utils.ts

// ---------------------------------------------------------------------------
// Shared delivery date utilities — no "use server", safe to import anywhere
// ---------------------------------------------------------------------------
const THURSDAY = 4
const FRIDAY = 5

// ---------------------------------------------------------------------------
// ET (Eastern Time) helpers.
// Uses the Intl API to get the true wall-clock time in America/New_York,
// correctly handling both EST (UTC-5) and EDT (UTC-4) automatically.
// This means the 5 PM cutoff is always 5 PM as customers experience it,
// regardless of whether daylight saving time is in effect.
// ---------------------------------------------------------------------------

/** Returns the current time as a Date whose .getHours()/.getDay() reflect
 *  America/New_York wall-clock time (handles EST and EDT automatically). */
function nowInEST(): Date {
  const now = new Date()
  // Format the current time in ET to extract date parts
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(now)

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0")
  // Construct a Date using ET components so .getDay()/.getHours() work correctly
  return new Date(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"))
}

// Cutoff for skip/change actions: 5 PM EST the evening before delivery.
const SKIP_CUTOFF_HOUR_EST = 17  // 5 PM

// Cutoff used when computing the "next available" delivery date for new orders.
// Same 5 PM rule: once it's past 5 PM EST the evening before, we skip to the
// following week.
const ORDER_CUTOFF_HOUR_EST = 17  // 5 PM

// ---------------------------------------------------------------------------
// isSkipLocked
//
// Returns true when the skip/unskip window has closed for the given delivery day.
//
// Lock schedule (per delivery day):
//   Thursday customers: locks Wed ≥ 5 PM EST, unlocks Thu ≥ 12 PM EST (noon)
//   Friday customers:   locks Thu ≥ 5 PM EST, unlocks Fri ≥ 12 PM EST (noon)
//
// This matches the "cutoff is 5 PM the evening before delivery" rule.
// ---------------------------------------------------------------------------
const UNLOCK_HOUR_EST = 12  // noon — skip window reopens after delivery

export function isSkipLocked(deliveryDay: "thursday" | "friday"): boolean {
  const targetDay = deliveryDay === "friday" ? FRIDAY : THURSDAY
  const dayBefore = (targetDay - 1 + 7) % 7
  const est = nowInEST()
  const day = est.getDay()
  const hour = est.getHours()

  // Locked: the evening before delivery, at or after 5 PM EST
  if (day === dayBefore && hour >= SKIP_CUTOFF_HOUR_EST) return true

  // Locked: delivery day itself, before noon EST (delivery in progress)
  if (day === targetDay && hour < UNLOCK_HOUR_EST) return true

  return false
}

// ---------------------------------------------------------------------------
// computeNextDeliveryDate
//
// Returns the next available delivery date (YYYY-MM-DD) for a given delivery day.
// "Available" means the cutoff (5 PM EST the evening before) has not yet passed.
// ---------------------------------------------------------------------------
export function computeNextDeliveryDate(deliveryDay: "thursday" | "friday"): string {
  const targetDay = deliveryDay === "friday" ? FRIDAY : THURSDAY
  const est = nowInEST()
  let daysUntil = (targetDay - est.getDay() + 7) % 7

  // If today IS the delivery day, advance to next week (today's delivery is done/in-progress).
  if (daysUntil === 0) {
    daysUntil = 7
  }

  // If delivery is tomorrow and it's past 5 PM EST, skip to the following week.
  if (daysUntil === 1 && est.getHours() >= ORDER_CUTOFF_HOUR_EST) {
    daysUntil = 8
  }

  // Build the date string by advancing from today's ET calendar date by daysUntil.
  // We use the ET date components from nowInEST() so the result always reflects
  // the correct calendar date in Eastern Time.
  const result = new Date(est)
  result.setDate(result.getDate() + daysUntil)
  const yyyy = result.getFullYear()
  const mm = String(result.getMonth() + 1).padStart(2, "0")
  const dd = String(result.getDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

// ---------------------------------------------------------------------------
// computeDeliveryDates
//
// For the weekly model, we compute the next N upcoming delivery dates on the
// given delivery day starting from the next available one.
// Default count = 8 (8 weeks / 2 months of upcoming dates).
// ---------------------------------------------------------------------------
export function computeDeliveryDates(
  deliveryDay: "thursday" | "friday",
  count = 8
): string[] {
  const first = computeNextDeliveryDate(deliveryDay)
  const base = new Date(first + "T12:00:00Z")
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(base)
    d.setUTCDate(d.getUTCDate() + i * 7)
    const yyyy = d.getUTCFullYear()
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0")
    const dd = String(d.getUTCDate()).padStart(2, "0")
    return `${yyyy}-${mm}-${dd}`
  })
}

// ---------------------------------------------------------------------------
// getUpcomingDeliveryDates
//
// Returns the next N delivery dates for a subscription, starting from today,
// excluding any dates already in skipped_dates.
// Used by the account page to show what's coming.
// ---------------------------------------------------------------------------
export function getUpcomingDeliveryDates(
  deliveryDay: "thursday" | "friday",
  skippedDates: string[] = [],
  count = 8
): string[] {
  return computeDeliveryDates(deliveryDay, count + skippedDates.length)
    .filter((d) => !skippedDates.includes(d))
    .slice(0, count)
}

// ---------------------------------------------------------------------------
// recomputeDeliveryDatesOnDayChange
//
// Kept for backwards compatibility with the delivery-day change flow.
// In the weekly model this is less important (dates are computed on the fly)
// but is still used when a customer switches their delivery day.
// ---------------------------------------------------------------------------
export function recomputeDeliveryDatesOnDayChange(
  existingDates: string[],
  newDeliveryDay: "thursday" | "friday"
): string[] {
  const today = nowInEST()
  // Zero out sub-day components so comparison is date-only
  const todayDateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`

  const past = existingDates.filter((d) => d < todayDateStr)
  const futureCount = Math.max(existingDates.length - past.length, 4)

  const firstNew = computeNextDeliveryDate(newDeliveryDay)
  const base = new Date(firstNew + "T12:00:00Z")

  const newFutureDates = Array.from({ length: futureCount }, (_, i) => {
    const d = new Date(base)
    d.setUTCDate(d.getUTCDate() + i * 7)
    const yyyy = d.getUTCFullYear()
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0")
    const dd = String(d.getUTCDate()).padStart(2, "0")
    return `${yyyy}-${mm}-${dd}`
  })

  return [...past, ...newFutureDates]
}

// ---------------------------------------------------------------------------
// isDeliveryDayLocked
//
// Returns true when MILK TYPE changes are locked for the given delivery day.
// Same lock window as skip: 5 PM EST the evening before delivery.
// ---------------------------------------------------------------------------
export function isDeliveryDayLocked(deliveryDay: "thursday" | "friday"): boolean {
  return isSkipLocked(deliveryDay)
}

// ---------------------------------------------------------------------------
// isDeliveryDayChangeLocked
//
// Returns true when DELIVERY DAY SWITCHING is locked.
// Covers both delivery days: locks Wed ≥ 5 PM EST, unlocks Fri ≥ 12 PM EST.
// ---------------------------------------------------------------------------
export function isDeliveryDayChangeLocked(): boolean {
  const est = nowInEST()
  const day = est.getDay()
  const hour = est.getHours()

  // Locked: Wednesday at or after 5 PM EST
  if (day === 3 && hour >= SKIP_CUTOFF_HOUR_EST) return true

  // Locked: all of Thursday (between the two delivery days)
  if (day === THURSDAY) return true

  // Locked: Friday before noon EST (Friday deliveries still in progress)
  if (day === FRIDAY && hour < UNLOCK_HOUR_EST) return true

  return false
}