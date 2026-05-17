//components/checkout-address-form.tsx

"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Loader2, MapPin } from "lucide-react"
import { updateProfile } from "@/app/actions/profile"
import { sendMessage } from "@/app/actions/messages"

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

// Day-of-week numbers: 0 = Sunday, 1 = Monday, ... 4 = Thursday, 5 = Friday
const THURSDAY = 4
const FRIDAY = 5
const CUTOFF_HOUR = 22 // 10pm

/**
 * Returns the next available delivery date for a given target day (THURSDAY or FRIDAY).
 * Cutoff is 10pm the day before delivery.
 * e.g. for Thursday delivery, cutoff is Wednesday at 10pm.
 * If it's past the cutoff, we skip to the following week.
 */
function getNextDeliveryDate(targetDay: typeof THURSDAY | typeof FRIDAY): Date {
  const now = new Date()
  const result = new Date(now)

  // How many days until the target day?
  let daysUntil = (targetDay - now.getDay() + 7) % 7

  // If daysUntil is 0, today IS the target day — already delivered, next week
  if (daysUntil === 0) {
    daysUntil = 7
  }

  // The cutoff is 5pm the day BEFORE delivery (i.e. daysUntil - 1 days from now at 17:00)
  // If we're currently within 1 day of target AND past 5pm, skip to next week
  if (daysUntil === 1 && now.getHours() >= CUTOFF_HOUR) {
    daysUntil = 8 // next occurrence
  }

  result.setDate(now.getDate() + daysUntil)
  result.setHours(0, 0, 0, 0)
  return result
}

/** Format a date as "Thursday, Feb 13" */
function formatDeliveryDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  })
}

/** Returns a note about the order cutoff for a given delivery date */
function getCutoffNote(deliveryDate: Date): string {
  const cutoff = new Date(deliveryDate)
  cutoff.setDate(cutoff.getDate() - 1)
  cutoff.setHours(CUTOFF_HOUR, 0, 0, 0)

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

  // Compute next available dates once on render (they won't change mid-session)
  const nextThursday = getNextDeliveryDate(THURSDAY)
  const nextFriday = getNextDeliveryDate(FRIDAY)

  // Always show the soonest option first (left)
  const deliveryOptions = [
    { day: "thursday" as const, date: nextThursday },
    { day: "friday" as const, date: nextFriday },
  ].sort((a, b) => a.date.getTime() - b.date.getTime())

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

    if (!formData.deliveryDay) {
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
            ? "Your subscription will deliver on this day each week."
            : "We deliver fresh, same-day on Thursdays and Fridays."}
        </p>
        <div className="grid grid-cols-2 gap-3 pt-1">
          {deliveryOptions.map(({ day, date }) => (
            <button
              key={day}
              type="button"
              onClick={() => setFormData({ ...formData, deliveryDay: day })}
              className={`rounded-lg border-2 p-4 text-left transition-all ${
                formData.deliveryDay === day
                  ? "border-sage bg-sage/10"
                  : "border-border hover:border-sage/50"
              }`}
            >
              <p className="font-medium text-foreground">
                {formatDeliveryDate(date)}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {getCutoffNote(date)}
              </p>
            </button>
          ))}
        </div>
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