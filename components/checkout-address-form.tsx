//components/checkout-address-form.tsx

"use client"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Loader2, MapPin, ChevronDown, Check } from "lucide-react"
import { updateProfile } from "@/app/actions/profile"
import { sendMessage } from "@/app/actions/messages"
import { computeDeliveryDates } from "@/lib/delivery-utils"

interface AddressFormData {
  firstName: string
  lastName: string
  phone: string
  address: string
  city: string
  state: string
  zip: string
  deliveryInstructions: string
  deliveryDay?: "thursday" | "friday"
  deliveryDate?: string // YYYY-MM-DD — the exact delivery date the customer picked
}

interface CheckoutAddressFormProps {
  userId: string | null
  initialData?: Partial<AddressFormData>
  onComplete: (data: AddressFormData) => void
  hasSubscriptionItems?: boolean
}

// North Fork deliverable towns
const DELIVERABLE_TOWNS = [
  "Orient",
  "East Marion",
  "Greenport",
  "Greenport West",
  "Southold",
  "Peconic",
  "Cutchogue",
  "New Suffolk",
  "Mattituck",
  "Laurel",
  "Jamesport",
  "Northville",
  "Aquebogue",
  "Riverhead",
  "Baiting Hollow",
  "Wading River",
  "Calverton",
]

// North Fork deliverable ZIP codes
const DELIVERABLE_ZIPS = [
  "11957", // Orient
  "11939", // East Marion
  "11944", // Greenport
  "11971", // Southold
  "11958", // Peconic
  "11935", // Cutchogue
  "11956", // New Suffolk
  "11952", // Mattituck
  "11948", // Laurel
  "11947", // Jamesport
  "11931", // Northville / Aquebogue
  "11901", // Riverhead
  "11933", // Baiting Hollow / Calverton
  "11792", // Wading River
]

/**
 * Returns the next TWO available delivery dates for a given delivery day —
 * "this week's" and "next week's" occurrence — as Dates at local midnight,
 * for DISPLAY ONLY. Each carries its own YYYY-MM-DD string, which is what
 * actually gets submitted (see deliveryDate on AddressFormData) — the
 * calendar date the customer clicked, not just the weekday.
 *
 * ⚠️ This MUST stay a thin wrapper over computeDeliveryDates() in
 * lib/delivery-utils.ts. That helper is the single source of truth for
 * "next available" (it applies the same 5pm Eastern cutoff used everywhere
 * else on the site, including app/actions/stripe.ts, which now honors this
 * exact date — see the note on handleSubmit below).
 *
 * This file previously reimplemented the logic locally with a 10pm cutoff
 * (`CUTOFF_HOUR = 22`) read off the BROWSER's clock via now.getHours(),
 * while every other cutoff on the site — and the "Order by ... at 5pm" label
 * rendered directly beneath these buttons — is 5pm Eastern. The two
 * disagreed, so the date shown here could be a full week earlier than the
 * date actually saved to the order and emailed to the customer (e.g. any
 * Wednesday between 5pm and 10pm ET, or any customer on a non-Eastern
 * device). Do not reintroduce local date math here.
 */
function getDeliveryDateOptions(
  deliveryDay: "thursday" | "friday"
): { date: Date; iso: string }[] {
  return computeDeliveryDates(deliveryDay, 2).map((iso) => {
    const [y, m, d] = iso.split("-").map(Number)
    // Local midnight on that calendar date — safe for toLocaleDateString().
    // (Never `new Date("YYYY-MM-DD")`, which parses as UTC and can render as
    // the previous day for Eastern viewers.)
    return { date: new Date(y, m - 1, d), iso }
  })
}

/** Format a date as "Thursday, Feb 13" */
function formatDeliveryDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  })
}

/**
 * Returns a note about the order cutoff for a given delivery date.
 * The cutoff is 5pm Eastern the evening before delivery — the same rule
 * enforced by computeNextDeliveryDate() and cutoffUnixForDeliveryDate().
 */
function getCutoffNote(deliveryDate: Date): string {
  const cutoff = new Date(deliveryDate)
  cutoff.setDate(cutoff.getDate() - 1)

  const dayName = cutoff.toLocaleDateString("en-US", { weekday: "long" })
  return `Order by ${dayName} at 5pm`
}

/**
 * Formats a raw digits string (up to 10) into (XXX)-XXX-XXXX pattern.
 * e.g. "1234567890" -> "(123)-456-7890"
 */
function formatPhoneNumber(digits: string): string {
  const d = digits.slice(0, 10)
  if (d.length <= 3) return d.length ? `(${d}` : ""
  if (d.length <= 6) return `(${d.slice(0, 3)})-${d.slice(3)}`
  return `(${d.slice(0, 3)})-${d.slice(3, 6)}-${d.slice(6)}`
}

export function CheckoutAddressForm({
  userId,
  initialData,
  onComplete,
  hasSubscriptionItems = false,
}: CheckoutAddressFormProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showRequestForm, setShowRequestForm] = useState(false)
  const [requestSubmitted, setRequestSubmitted] = useState(false)
  const [isDayPickerOpen, setIsDayPickerOpen] = useState(false)
  const dayPickerRef = useRef<HTMLDivElement>(null)

  // Close the delivery-day dropdown when clicking outside it
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dayPickerRef.current &&
        !dayPickerRef.current.contains(e.target as Node)
      ) {
        setIsDayPickerOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const [formData, setFormData] = useState<AddressFormData>({
    firstName: initialData?.firstName || "",
    lastName: initialData?.lastName || "",
    phone: initialData?.phone || "",
    address: initialData?.address || "",
    city: initialData?.city || "",
    state: initialData?.state || "NY",
    zip: initialData?.zip || "",
    deliveryInstructions: initialData?.deliveryInstructions || "",
  })

  // Compute the next two available dates per day once on render (won't change mid-session)
  const thursdayDates = getDeliveryDateOptions("thursday") // [this week, next week]
  const fridayDates = getDeliveryDateOptions("friday")

  // The two soonest upcoming dates (one per weekday), soonest first.
  // NOTE: these are NOT necessarily in the same calendar week — e.g. on a
  // Thursday morning, the soonest Thursday slot is already 7 days out (today's
  // cutoff has passed) while the soonest Friday slot is tomorrow. Labeled
  // "Soonest" in the UI rather than "This week" for exactly this reason.
  const thisWeekOptions = [
    { day: "thursday" as const, date: thursdayDates[0].date, iso: thursdayDates[0].iso },
    { day: "friday" as const, date: fridayDates[0].date, iso: fridayDates[0].iso },
  ].sort((a, b) => a.date.getTime() - b.date.getTime())

  // The next two dates after that (one per weekday), same reasoning applies —
  // labeled "Later" in the UI, not "Next week".
  const nextWeekOptions = [
    { day: "thursday" as const, date: thursdayDates[1].date, iso: thursdayDates[1].iso },
    { day: "friday" as const, date: fridayDates[1].date, iso: fridayDates[1].iso },
  ].sort((a, b) => a.date.getTime() - b.date.getTime())

  // Flat list for the dropdown, plus a lookup for the currently selected date
  // (used to look up the weekday when saving, and to render the cutoff note).
  const allDateOptions = [...thisWeekOptions, ...nextWeekOptions]
  const selectedDateOption = allDateOptions.find(
    (o) => o.iso === formData.deliveryDate
  )

  const isCityDeliverable = (city: string, state: string): boolean => {
    const normalizedCity = city.trim()
    const normalizedState = state.trim().toUpperCase()
    if (normalizedState !== "NY") return false
    return DELIVERABLE_TOWNS.some(
      (town) => normalizedCity.toLowerCase() === town.toLowerCase()
    )
  }

  const isZipDeliverable = (zip: string): boolean => {
    return DELIVERABLE_ZIPS.includes(zip.trim())
  }

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Strip everything except digits, then reformat
    const digits = e.target.value.replace(/\D/g, "").slice(0, 10)
    setFormData({ ...formData, phone: formatPhoneNumber(digits) })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

    if (
      !formData.firstName ||
      !formData.lastName ||
      !formData.address ||
      !formData.city ||
      !formData.zip
    ) {
      setError("Please fill in all required fields")
      setIsLoading(false)
      return
    }

    if (formData.zip.length !== 5 || !/^\d{5}$/.test(formData.zip)) {
      setError("Please enter a valid 5-digit ZIP code")
      setIsLoading(false)
      return
    }

    if (!formData.deliveryDay || !formData.deliveryDate) {
      setError("Please select a delivery day")
      setIsLoading(false)
      return
    }

    const cityOk = isCityDeliverable(formData.city, formData.state)
    const zipOk = isZipDeliverable(formData.zip)

    // City is in our zone but ZIP doesn't match — likely a typo
    if (cityOk && !zipOk) {
      setError(
        `Please double-check your ZIP code — it doesn't match ${formData.city}.`
      )
      setIsLoading(false)
      return
    }

    // City is not in our zone — show the outside delivery area panel
    if (!cityOk) {
      setShowRequestForm(true)
      setIsLoading(false)
      return
    }

    if (userId) {
      const result = await updateProfile({
        userId,
        firstName: formData.firstName,
        lastName: formData.lastName,
        phone: formData.phone,
        address: formData.address,
        city: formData.city,
        state: formData.state,
        zip: formData.zip,
        deliveryInstructions: formData.deliveryInstructions,
      })

      if (result.error) {
        setError("Failed to save address. Please try again.")
        setIsLoading(false)
        return
      }
    }

    setIsLoading(false)
    onComplete(formData)
  }

  const handleRequestDelivery = async () => {
    setIsLoading(true)
    const result = await sendMessage({
      type: "contact",
      subject: "Delivery Area Request",
      body: `Customer requested delivery outside the current zone.\n\nName: ${formData.firstName} ${formData.lastName}\nPhone: ${formData.phone}\nAddress: ${formData.address}, ${formData.city}, ${formData.state} ${formData.zip}`,
    })
    setIsLoading(false)
    if (!result.error) {
      setRequestSubmitted(true)
    }
  }

  if (showRequestForm) {
    if (requestSubmitted) {
      return (
        <div className="space-y-6">
          <div className="rounded-lg border border-green-500/50 bg-green-500/10 p-8 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-500/20">
              <svg
                className="h-6 w-6 text-green-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h3 className="mb-2 font-serif text-xl font-medium text-foreground">
              Request Submitted
            </h3>
            <p className="mb-6 text-sm text-muted-foreground">
              Thank you for your interest! We'll contact you at{" "}
              <strong>{formData.phone}</strong> within 1-2 business days to
              discuss delivery options for your area.
            </p>
            <Button asChild variant="outline">
              <a href="/">Return to Home</a>
            </Button>
          </div>
        </div>
      )
    }

    return (
      <div className="space-y-6">
        <div className="rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-6">
          <h3 className="mb-2 font-serif text-lg font-medium text-foreground">
            Outside Delivery Area
          </h3>
          <p className="mb-4 text-sm text-muted-foreground">
            We currently deliver to the North Fork area. Your address in{" "}
            <strong>{formData.city}</strong> is outside our current delivery
            zone.
          </p>
          <p className="mb-6 text-sm text-muted-foreground">
            However, we'd love to hear from you! Submit your information and
            we'll reach out to discuss potential delivery options.
          </p>

          <div className="space-y-4">
            <div className="rounded-lg bg-background/50 p-4">
              <p className="text-sm">
                <strong>Name:</strong> {formData.firstName} {formData.lastName}
              </p>
              <p className="text-sm">
                <strong>Phone:</strong> {formData.phone}
              </p>
              <p className="text-sm">
                <strong>Address:</strong> {formData.address}, {formData.city},{" "}
                {formData.state} {formData.zip}
              </p>
            </div>

            <div className="flex gap-3">
              <Button
                onClick={handleRequestDelivery}
                className="flex-1"
                disabled={isLoading}
              >
                {isLoading && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Request Delivery
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowRequestForm(false)}
                className="flex-1"
                disabled={isLoading}
              >
                Update Address
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex items-center gap-3 pb-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sage/10">
          <MapPin className="h-5 w-5 text-sage" />
        </div>
        <div>
          <h2 className="font-serif text-xl font-medium">Delivery Address</h2>
          <p className="text-sm text-muted-foreground">
            Where should we deliver your order?
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="firstName">First Name *</Label>
          <Input
            id="firstName"
            required
            value={formData.firstName}
            onChange={(e) =>
              setFormData({ ...formData, firstName: e.target.value })
            }
            placeholder="John"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lastName">Last Name *</Label>
          <Input
            id="lastName"
            required
            value={formData.lastName}
            onChange={(e) =>
              setFormData({ ...formData, lastName: e.target.value })
            }
            placeholder="Doe"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="phone">Phone Number *</Label>
        <Input
          id="phone"
          type="tel"
          required
          value={formData.phone}
          onChange={handlePhoneChange}
          placeholder="(123)-456-7890"
          inputMode="numeric"
          maxLength={14}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="address">Street Address *</Label>
        <Input
          id="address"
          required
          value={formData.address}
          onChange={(e) =>
            setFormData({ ...formData, address: e.target.value })
          }
          placeholder="123 Main Street"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="city">City *</Label>
          <Input
            id="city"
            required
            value={formData.city}
            onChange={(e) =>
              setFormData({ ...formData, city: e.target.value })
            }
            placeholder="Greenport"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="state">State *</Label>
          <Input
            id="state"
            required
            value={formData.state}
            onChange={(e) =>
              setFormData({ ...formData, state: e.target.value })
            }
            placeholder="NY"
            maxLength={2}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="zip">ZIP Code *</Label>
          <Input
            id="zip"
            required
            value={formData.zip}
            onChange={(e) =>
              setFormData({ ...formData, zip: e.target.value.replace(/\D/g, "").slice(0, 5) })
            }
            placeholder="11944"
            maxLength={5}
            inputMode="numeric"
          />
        </div>
      </div>

      {/* Delivery Day Selection — always shown, required for all orders */}
      <div className="space-y-2">
        <Label>
          {hasSubscriptionItems ? "Weekly Delivery Day *" : "Delivery Day *"}
        </Label>
        <p className="text-xs text-muted-foreground">
          {hasSubscriptionItems
            ? "Your subscription will deliver on this day each week. Picking a next-week date just delays your first delivery — every delivery after that follows your weekly day automatically."
            : "We deliver fresh, same-day on Thursdays and Fridays between 1pm to 5pm."}
        </p>
        <div className="relative" ref={dayPickerRef}>
          <button
            type="button"
            onClick={() => setIsDayPickerOpen((open) => !open)}
            className={`flex h-11 w-full items-center justify-between rounded-lg border bg-background px-3 text-sm transition-colors ${
              isDayPickerOpen
                ? "border-sage ring-2 ring-sage/20"
                : "border-border hover:border-sage/50"
            }`}
          >
            <span
              className={
                selectedDateOption
                  ? "text-foreground"
                  : "text-muted-foreground"
              }
            >
              {selectedDateOption
                ? formatDeliveryDate(selectedDateOption.date)
                : "Select a delivery date"}
            </span>
            <ChevronDown
              className={`h-4 w-4 text-muted-foreground transition-transform ${
                isDayPickerOpen ? "rotate-180" : ""
              }`}
            />
          </button>

          {isDayPickerOpen && (
            <div className="absolute z-10 mt-1.5 w-full overflow-hidden rounded-lg border border-border bg-background shadow-md">
              <p className="px-3 pt-2.5 pb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Soonest
              </p>
              {thisWeekOptions.map(({ date, iso }) => (
                <button
                  key={iso}
                  type="button"
                  onClick={() => {
                    const match = allDateOptions.find((o) => o.iso === iso)
                    setFormData({
                      ...formData,
                      deliveryDate: iso,
                      deliveryDay: match?.day,
                    })
                    setIsDayPickerOpen(false)
                  }}
                  className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-sage/10 ${
                    formData.deliveryDate === iso
                      ? "text-sage"
                      : "text-foreground"
                  }`}
                >
                  {formatDeliveryDate(date)}
                  {formData.deliveryDate === iso && (
                    <Check className="h-4 w-4" />
                  )}
                </button>
              ))}

              <p className="px-3 pt-2.5 pb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground border-t border-border">
                Later
              </p>
              {nextWeekOptions.map(({ date, iso }) => (
                <button
                  key={iso}
                  type="button"
                  onClick={() => {
                    const match = allDateOptions.find((o) => o.iso === iso)
                    setFormData({
                      ...formData,
                      deliveryDate: iso,
                      deliveryDay: match?.day,
                    })
                    setIsDayPickerOpen(false)
                  }}
                  className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-sage/10 ${
                    formData.deliveryDate === iso
                      ? "text-sage"
                      : "text-foreground"
                  }`}
                >
                  {formatDeliveryDate(date)}
                  {formData.deliveryDate === iso && (
                    <Check className="h-4 w-4" />
                  )}
                </button>
              ))}
              <div className="pb-1" />
            </div>
          )}
        </div>
        {selectedDateOption && (
          <p className="text-xs text-muted-foreground">
            {getCutoffNote(selectedDateOption.date)}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="deliveryInstructions">
          Delivery Instructions (Optional)
        </Label>
        <Textarea
          id="deliveryInstructions"
          value={formData.deliveryInstructions}
          onChange={(e) =>
            setFormData({ ...formData, deliveryInstructions: e.target.value })
          }
          placeholder="e.g., Leave on front porch, Gate code is 1234"
          rows={3}
        />
      </div>

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Continue to Payment
      </Button>
    </form>
  )
}