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
//   Thursday customers: locks Wed ≥ 5 PM EST, unlocks Thu ≥ 3 PM EST
//   Friday customers:   locks Thu ≥ 5 PM EST, unlocks Fri ≥ 3 PM EST
//
// This matches the "cutoff is 5 PM the evening before delivery" rule. The
// reopen hour is 3 PM (not noon) because deliveries can run into the early
// afternoon — reopening skip/change controls at noon, while trucks are still
// out, would let a customer alter a delivery that's already in progress.
// ---------------------------------------------------------------------------
const UNLOCK_HOUR_EST = 15  // 3 PM — skip window reopens after delivery finishes

export function isSkipLocked(deliveryDay: "thursday" | "friday"): boolean {
  const targetDay = deliveryDay === "friday" ? FRIDAY : THURSDAY
  const dayBefore = (targetDay - 1 + 7) % 7
  const est = nowInEST()
  const day = est.getDay()
  const hour = est.getHours()

  // Locked: the evening before delivery, at or after 5 PM EST
  if (day === dayBefore && hour >= SKIP_CUTOFF_HOUR_EST) return true

  // Locked: delivery day itself, before 3 PM EST (delivery in progress)
  if (day === targetDay && hour < UNLOCK_HOUR_EST) return true

  return false
}

// ---------------------------------------------------------------------------
// isDeliveryDayMorning
//
// Returns true when TODAY is the customer's delivery weekday AND it's before
// the 3 PM reopen hour — i.e. the delivery is happening right now. This is the
// trigger for the "your delivery is on its way today" banner.
//
// Deliberately NOT the same as isSkipLocked: isSkipLocked is also true the
// EVENING BEFORE delivery (Wed ≥ 5 PM for a Thursday customer), which is not a
// "delivery is on its way today" moment. This helper is true only during the
// delivery-day window itself (midnight → 3 PM on the delivery day), so the
// banner never shows the night before.
//
// Note: this returns true even if the customer skipped this week's delivery —
// callers must additionally check that today's date isn't in skipped_dates
// before showing the banner (a skipped week has nothing on its way).
// ---------------------------------------------------------------------------
export function isDeliveryDayMorning(deliveryDay: "thursday" | "friday"): boolean {
  const targetDay = deliveryDay === "friday" ? FRIDAY : THURSDAY
  const est = nowInEST()
  return est.getDay() === targetDay && est.getHours() < UNLOCK_HOUR_EST
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
// Covers both delivery days: locks Wed ≥ 5 PM EST, unlocks Fri ≥ 3 PM EST.
// ---------------------------------------------------------------------------
export function isDeliveryDayChangeLocked(): boolean {
  const est = nowInEST()
  const day = est.getDay()
  const hour = est.getHours()

  // Locked: Wednesday at or after 5 PM EST
  if (day === 3 && hour >= SKIP_CUTOFF_HOUR_EST) return true

  // Locked: all of Thursday (between the two delivery days)
  if (day === THURSDAY) return true

  // Locked: Friday before 3 PM EST (Friday deliveries still in progress)
  if (day === FRIDAY && hour < UNLOCK_HOUR_EST) return true

  return false
}

// ---------------------------------------------------------------------------
// Shared Stripe cutoff timestamp helpers — DST-safe (added: strictly-Eastern
// fix).
//
// PROBLEM this replaces: app/actions/stripe.ts, app/actions/subscription.ts,
// and app/api/stripe/webhook/route.ts each independently declared their own
// `const CUTOFF_HOUR_UTC = 22` and did `Date.UTC(y, m-1, d, 22, 0, 0)` to
// mean "5 PM Eastern." That's only correct for EST (UTC-5), i.e. roughly
// early November through mid-March. For the rest of the year — including
// most of the delivery season — Eastern is EDT (UTC-4), so 5 PM ET is
// actually 21:00 UTC, not 22:00. Every cutoff computed with the old
// constant during EDT was silently an hour late (locking skips/cancels an
// hour after customers actually expected, and billing renewals an hour off
// from the advertised 5 PM).
//
// FIX: since this business serves Eastern-time customers exclusively, every
// cutoff should be computed by asking what UTC instant corresponds to 5 PM
// *wall-clock* time in America/New_York on the relevant date — using the
// Intl API (same mechanism nowInEST() already uses above) rather than a
// fixed offset. This automatically tracks DST transitions with no manual
// table to maintain.
// ---------------------------------------------------------------------------

/**
 * Converts a specific Eastern Time wall-clock moment (year/month/day/hour)
 * into a UTC Unix timestamp (seconds), correctly accounting for whether
 * that date falls in EST or EDT.
 *
 * Implementation: guess the UTC instant assuming EST (UTC-5), then check
 * what Eastern wall-clock time that guess actually lands on. If we're
 * really in EDT, the guess will be off by exactly one hour — correct for
 * that difference. A single correction pass is sufficient since the
 * EST/EDT offset only ever differs by one hour, and 5 PM is nowhere near
 * the ~2 AM DST transition moment, so there's no ambiguity to resolve.
 */
export function easternWallTimeToUnix(
  year: number,
  month: number, // 1-12
  day: number,
  hour: number,
  minute = 0
): number {
  const guessMs = Date.UTC(year, month - 1, day, hour + 5, minute, 0)

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(guessMs))

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0")
  const actualDay = get("day")
  const actualHour = get("hour")
  const actualMinute = get("minute")

  let diffMinutes = (hour * 60 + minute) - (actualHour * 60 + actualMinute)
  // Guard against a day rollover in the formatted result (not expected for
  // a ±1 hour DST correction at 5 PM, but harmless to guard).
  if (actualDay !== day) {
    diffMinutes += actualDay > day ? -24 * 60 : 24 * 60
  }

  return Math.floor((guessMs + diffMinutes * 60 * 1000) / 1000)
}

/**
 * The cutoff (5 PM Eastern, the evening before) for a given delivery date,
 * as a Unix timestamp in seconds. DST-safe.
 *
 * This is THE single source of truth for "what UTC instant is 5 PM Eastern
 * the evening before delivery date D" — use this everywhere instead of
 * hand-rolled Date.UTC(..., 22, ...) math.
 */
export function cutoffUnixForDeliveryDate(deliveryDateStr: string): number {
  const [y, m, d] = deliveryDateStr.split("-").map(Number)
  // Evening BEFORE the delivery date — JS Date normalizes day underflow
  // (e.g. day 0 rolls back into the previous month) regardless of time zone.
  const dayBefore = new Date(y, m - 1, d - 1)
  return easternWallTimeToUnix(
    dayBefore.getFullYear(),
    dayBefore.getMonth() + 1,
    dayBefore.getDate(),
    17,
    0
  )
}

/**
 * Converts a Unix timestamp (seconds) to its calendar date (YYYY-MM-DD) in
 * Eastern Time. DST-safe — replaces the old unixToESTDateStr() in the
 * webhook, which assumed a fixed UTC-5 offset.
 */
export function easternDateStrFromUnix(unixTs: number): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(unixTs * 1000))
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00"
  return `${get("year")}-${get("month")}-${get("day")}`
}