// lib/delivery-utils.ts

// ---------------------------------------------------------------------------
// Shared delivery date utilities — no "use server", safe to import anywhere
// ---------------------------------------------------------------------------
const THURSDAY = 4
const FRIDAY = 5
const CUTOFF_HOUR = 22

export function computeNextDeliveryDate(deliveryDay: "thursday" | "friday"): string {
  const targetDay = deliveryDay === "friday" ? FRIDAY : THURSDAY
  const now = new Date()
  let daysUntil = (targetDay - now.getDay() + 7) % 7

  // If daysUntil === 0, today IS the delivery day.
  // Today's delivery is either in progress or already done, so advance to next week.
  if (daysUntil === 0) {
    daysUntil = 7
  }

  // If the delivery is tomorrow but we're past the 10 PM cutoff,
  // skip to the week after so we don't show an un-orderable date.
  if (daysUntil === 1 && now.getHours() >= CUTOFF_HOUR) {
    daysUntil = 8
  }

  const next = new Date(now)
  next.setDate(now.getDate() + daysUntil)
  next.setHours(0, 0, 0, 0)
  const yyyy = next.getFullYear()
  const mm = String(next.getMonth() + 1).padStart(2, "0")
  const dd = String(next.getDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

// ---------------------------------------------------------------------------
// Compute all 4 delivery dates for a new subscription billing cycle.
// Returns an array of 4 YYYY-MM-DD strings starting from the first delivery.
// ---------------------------------------------------------------------------
export function computeDeliveryDates(deliveryDay: "thursday" | "friday"): string[] {
  const first = computeNextDeliveryDate(deliveryDay)
  const base = new Date(first + "T12:00:00")
  return [0, 7, 14, 21].map((offset) => {
    const d = new Date(base)
    d.setDate(d.getDate() + offset)
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, "0")
    const dd = String(d.getDate()).padStart(2, "0")
    return `${yyyy}-${mm}-${dd}`
  })
}

// ---------------------------------------------------------------------------
// Recompute remaining delivery dates when a user changes their delivery day.
// Dates that are already in the past are preserved as-is; only future dates
// are shifted to the new delivery day on a weekly cadence.
//
// existingDates: the current stored delivery_dates array (YYYY-MM-DD strings)
// newDeliveryDay: the day the user is switching to
// ---------------------------------------------------------------------------
export function recomputeDeliveryDatesOnDayChange(
  existingDates: string[],
  newDeliveryDay: "thursday" | "friday"
): string[] {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Split into past (keep) and future (recompute)
  const past = existingDates.filter((d) => new Date(d + "T12:00:00") < today)
  const futureCount = 4 - past.length

  if (futureCount <= 0) return existingDates

  // Compute new "first upcoming" date on the new delivery day
  const firstNew = computeNextDeliveryDate(newDeliveryDay)
  const base = new Date(firstNew + "T12:00:00")

  const newFutureDates = Array.from({ length: futureCount }, (_, i) => {
    const d = new Date(base)
    d.setDate(d.getDate() + i * 7)
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, "0")
    const dd = String(d.getDate()).padStart(2, "0")
    return `${yyyy}-${mm}-${dd}`
  })

  return [...past, ...newFutureDates]
}

// ---------------------------------------------------------------------------
// Returns true if MILK TYPE changes are locked for the given delivery day.
//
// Lock/unlock schedule (per delivery day):
//   Thursday customers: locks Wed ≥ 5 PM, unlocks Thu ≥ 12 PM (noon)
//   Friday customers:   locks Thu ≥ 5 PM, unlocks Fri ≥ 12 PM (noon)
// ---------------------------------------------------------------------------
const MILK_LOCK_HOUR = 17    // 5 PM — milk changes lock the evening before delivery
const MILK_UNLOCK_HOUR = 12  // noon — milk changes reopen the morning of delivery

export function isDeliveryDayLocked(deliveryDay: "thursday" | "friday"): boolean {
  const targetDay = deliveryDay === "friday" ? FRIDAY : THURSDAY
  const dayBefore = (targetDay - 1 + 7) % 7
  const now = new Date()
  const day = now.getDay()
  const hour = now.getHours()

  // Locked: evening before delivery (day-before ≥ 5 PM)
  if (day === dayBefore && hour >= MILK_LOCK_HOUR) return true

  // Locked: delivery day itself before noon
  if (day === targetDay && hour < MILK_UNLOCK_HOUR) return true

  return false
}

// ---------------------------------------------------------------------------
// Returns true if DELIVERY DAY SWITCHING is locked.
//
// Lock/unlock schedule (shared — applies regardless of current delivery day):
//   Locks:   Wednesday ≥ 5 PM
//   Unlocks: Friday ≥ 12 PM (noon)
//   Locked window: Wed 5 PM → Fri 11:59 AM (covers both delivery days)
//
// This prevents customers from switching days mid-week to skip a delivery.
// ---------------------------------------------------------------------------
const DAY_CHANGE_LOCK_DAY = 3    // Wednesday
const DAY_CHANGE_LOCK_HOUR = 17  // 5 PM

export function isDeliveryDayChangeLocked(): boolean {
  const now = new Date()
  const day = now.getDay()
  const hour = now.getHours()

  // Locked: Wednesday at or after 5 PM
  if (day === DAY_CHANGE_LOCK_DAY && hour >= DAY_CHANGE_LOCK_HOUR) return true

  // Locked: Thursday (all day — between the two delivery days)
  if (day === THURSDAY) return true

  // Locked: Friday before noon (Friday deliveries still in progress)
  if (day === FRIDAY && hour < MILK_UNLOCK_HOUR) return true

  return false
}