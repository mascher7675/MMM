// components/homepage-contact-form.tsx

"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { CheckCircle, Loader2, MessageCircle, Phone, Send } from "lucide-react"
import { sendContactMessage } from "@/app/actions/contact"

function formatPhoneNumber(digits: string): string {
  const d = digits.slice(0, 10)
  if (d.length <= 3) return d.length ? `(${d}` : ""
  if (d.length <= 6) return `(${d.slice(0, 3)})-${d.slice(3)}`
  return `(${d.slice(0, 3)})-${d.slice(3, 6)}-${d.slice(6)}`
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}

interface FieldErrors {
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
  message?: string
}

export function HomepageContactForm() {
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [message, setMessage] = useState("")
  const [sending, setSending] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})

  function handlePhoneChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/\D/g, "").slice(0, 10)
    setPhone(formatPhoneNumber(digits))
    if (fieldErrors.phone) {
      setFieldErrors((prev) => ({ ...prev, phone: undefined }))
    }
  }

  function clearFieldError(field: keyof FieldErrors) {
    if (fieldErrors[field]) {
      setFieldErrors((prev) => ({ ...prev, [field]: undefined }))
    }
  }

  function validate(): boolean {
    const errors: FieldErrors = {}

    if (!firstName.trim()) errors.firstName = "First name is required."
    if (!lastName.trim()) errors.lastName = "Last name is required."

    if (!email.trim()) {
      errors.email = "Email address is required."
    } else if (!isValidEmail(email)) {
      errors.email = "Please enter a valid email address."
    }

    const phoneDigits = phone.replace(/\D/g, "")
    if (!phone.trim()) {
      errors.phone = "Phone number is required."
    } else if (phoneDigits.length !== 10) {
      errors.phone = "Phone number must be 10 digits."
    }

    if (!message.trim()) errors.message = "Message is required."

    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  async function handleSubmit() {
    setError(null)
    if (!validate()) return

    setSending(true)
    const fullName = `${firstName.trim()} ${lastName.trim()}`
    const result = await sendContactMessage({ name: fullName, email, phone, message })
    setSending(false)
    if (result.error) {
      setError(result.error)
    } else {
      setSuccess(true)
      setFirstName("")
      setLastName("")
      setEmail("")
      setPhone("")
      setMessage("")
      setFieldErrors({})
    }
  }

  return (
    <section id="contact" className="scroll-mt-40 border-t border-border bg-background py-16 md:py-20">
      <div className="mx-auto max-w-xl px-4 md:px-6">
        <div className="text-center">
          <h2 className="font-serif text-3xl font-medium tracking-tight text-foreground md:text-4xl">
            Get in Touch
          </h2>
          <p className="mx-auto mt-3 max-w-sm text-muted-foreground">
            Questions about delivery, products, or anything else? We&apos;d love to hear from you.
          </p>

          {/* Phone / Text CTA */}
          <div className="mt-5 inline-flex flex-col items-center gap-2 rounded-xl border border-border bg-secondary/40 px-6 py-4 text-center">
            <p className="text-sm font-medium text-foreground">
              For the fastest response, text or call us!
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <a
                href="sms:+15167437675"
                className="flex items-center gap-1.5 rounded-lg bg-sage/10 px-3 py-1.5 text-sm font-medium text-sage transition-colors hover:bg-sage/20"
              >
                <MessageCircle className="h-4 w-4" />
                Text us
              </a>
              <a
                href="tel:+15167437675"
                className="flex items-center gap-1.5 rounded-lg bg-sage/10 px-3 py-1.5 text-sm font-medium text-sage transition-colors hover:bg-sage/20"
              >
                <Phone className="h-4 w-4" />
                (516)-743-7675
              </a>
            </div>
          </div>

          <div className="mt-6 flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" />
            <span>or send us a message below</span>
            <div className="h-px flex-1 bg-border" />
          </div>
        </div>

        {success ? (
          <div className="mt-8 flex flex-col items-center rounded-xl border border-border bg-secondary/40 px-6 py-10 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-sage/10">
              <CheckCircle className="h-6 w-6 text-sage" />
            </div>
            <p className="font-medium text-foreground">Message sent!</p>
            <p className="mt-1 text-sm text-muted-foreground">
              We&apos;ll get back to you soon.
            </p>
            <button
              onClick={() => setSuccess(false)}
              className="mt-4 text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              Send another message
            </button>
          </div>
        ) : (
          <div className="mt-8 space-y-4">
            {error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}

            {/* First name / Last name */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Input
                  placeholder="First name"
                  value={firstName}
                  onChange={(e) => { setFirstName(e.target.value); clearFieldError("firstName") }}
                  className={fieldErrors.firstName ? "border-destructive focus-visible:ring-destructive" : ""}
                />
                {fieldErrors.firstName && (
                  <p className="text-xs text-destructive">{fieldErrors.firstName}</p>
                )}
              </div>
              <div className="space-y-1">
                <Input
                  placeholder="Last name"
                  value={lastName}
                  onChange={(e) => { setLastName(e.target.value); clearFieldError("lastName") }}
                  className={fieldErrors.lastName ? "border-destructive focus-visible:ring-destructive" : ""}
                />
                {fieldErrors.lastName && (
                  <p className="text-xs text-destructive">{fieldErrors.lastName}</p>
                )}
              </div>
            </div>

            {/* Email / Phone */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Input
                  type="text"
                  placeholder="Email address"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); clearFieldError("email") }}
                  className={fieldErrors.email ? "border-destructive focus-visible:ring-destructive" : ""}
                />
                {fieldErrors.email && (
                  <p className="text-xs text-destructive">{fieldErrors.email}</p>
                )}
              </div>
              <div className="space-y-1">
                <Input
                  type="tel"
                  placeholder="(123)-456-7890"
                  value={phone}
                  onChange={handlePhoneChange}
                  inputMode="numeric"
                  maxLength={14}
                  className={fieldErrors.phone ? "border-destructive focus-visible:ring-destructive" : ""}
                />
                {fieldErrors.phone && (
                  <p className="text-xs text-destructive">{fieldErrors.phone}</p>
                )}
              </div>
            </div>

            {/* Message */}
            <div className="space-y-1">
              <Textarea
                placeholder="How can we help?"
                rows={4}
                value={message}
                onChange={(e) => { setMessage(e.target.value); clearFieldError("message") }}
                className={fieldErrors.message ? "border-destructive focus-visible:ring-destructive" : ""}
              />
              {fieldErrors.message && (
                <p className="text-xs text-destructive">{fieldErrors.message}</p>
              )}
            </div>

            <Button
              onClick={handleSubmit}
              disabled={sending}
              className="w-full gap-2 bg-foreground text-background hover:bg-foreground/90"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {sending ? "Sending…" : "Send Message"}
            </Button>
          </div>
        )}
      </div>
    </section>
  )
}