//app/auth/sign-up/page.tsx
 
"use client"
 
import React, { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Eye, EyeOff } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
 
function formatPhoneNumber(digits: string): string {
  const d = digits.slice(0, 10)
  if (d.length <= 3) return d.length ? `(${d}` : ""
  if (d.length <= 6) return `(${d.slice(0, 3)})-${d.slice(3)}`
  return `(${d.slice(0, 3)})-${d.slice(3, 6)}-${d.slice(6)}`
}
 
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}
 
function validatePassword(password: string): string | null {
  if (!password || !password.trim()) return "Password is required."
  if (password.length < 8) return "Password must be at least 8 characters."
  if (!/[A-Z]/.test(password)) return "Password must include at least one uppercase letter."
  if (!/\d/.test(password)) return "Password must include at least one number."
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(password))
    return "Password must include at least one special character."
  return null
}
 
interface FieldErrors {
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
  password?: string
}
 
export default function SignUpPage() {
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [generalError, setGeneralError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
 
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
 
    if (!password.trim()) {
      errors.password = "Password is required."
    } else {
      const passwordError = validatePassword(password)
      if (passwordError) errors.password = passwordError
    }
 
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }
 
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setGeneralError(null)
 
    if (!validate()) return
 
    setLoading(true)
 
    const supabase = createClient()
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo:
          process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL ||
          `${window.location.origin}/account`,
        data: {
          first_name: firstName,
          last_name: lastName,
          phone: phone.trim(),
        },
      },
    })
 
    if (signUpError) {
      const msg = signUpError.message.toLowerCase()
      if (
        msg.includes("already registered") ||
        msg.includes("already been registered") ||
        msg.includes("user already exists")
      ) {
        setFieldErrors((prev) => ({
          ...prev,
          email: "This email is already associated with an account.",
        }))
      } else {
        setGeneralError(signUpError.message)
      }
      setLoading(false)
      return
    }
 
    // Write phone to the profile row directly (trigger only sets name/email)
    if (data.user) {
      await supabase
        .from("profiles")
        .update({ phone: phone.trim() })
        .eq("id", data.user.id)
    }
 
    router.push("/auth/sign-up-success")
  }
 
  return (
    <div className="flex min-h-screen">
      {/* Left side - Form */}
      <div className="flex w-full flex-col justify-center px-4 py-12 lg:w-1/2 lg:px-12">
        <div className="mx-auto w-full max-w-sm">
          <Link href="/" className="mb-12 inline-flex items-center gap-5">
            <Image
              src="/images/white-logo-notext.png"
              alt="Modern Milk Maid"
              width={100}
              height={100}
              className="h-24 w-24"
            />
            <div className="flex flex-col">
              <span className="font-serif text-2xl font-semibold tracking-wide whitespace-nowrap">Modern Milk Maid</span>
              <span className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Plant Based Milks</span>
            </div>
          </Link>
 
          <h1 className="font-serif text-3xl font-medium tracking-tight text-foreground">
            Create an account
          </h1>
          <p className="mt-2 text-muted-foreground">
            Join our North Fork milk delivery community
          </p>
 
          <form onSubmit={handleSubmit} className="mt-8 space-y-4" noValidate>
 
            {/* General error */}
            {generalError && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                {generalError}
              </div>
            )}
 
            {/* First / Last name */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="firstName">First name</Label>
                <Input
                  id="firstName"
                  placeholder="Jane"
                  value={firstName}
                  onChange={(e) => { setFirstName(e.target.value); clearFieldError("firstName") }}
                  className={fieldErrors.firstName ? "border-destructive focus-visible:ring-destructive" : "border-border/50"}
                />
                {fieldErrors.firstName && (
                  <p className="text-xs text-destructive">{fieldErrors.firstName}</p>
                )}
              </div>
              <div className="space-y-1">
                <Label htmlFor="lastName">Last name</Label>
                <Input
                  id="lastName"
                  placeholder="Doe"
                  value={lastName}
                  onChange={(e) => { setLastName(e.target.value); clearFieldError("lastName") }}
                  className={fieldErrors.lastName ? "border-destructive focus-visible:ring-destructive" : "border-border/50"}
                />
                {fieldErrors.lastName && (
                  <p className="text-xs text-destructive">{fieldErrors.lastName}</p>
                )}
              </div>
            </div>
 
            {/* Phone */}
            <div className="space-y-1">
              <Label htmlFor="phone">Phone number</Label>
              <Input
                id="phone"
                type="tel"
                placeholder="(631)-555-1234"
                value={phone}
                onChange={handlePhoneChange}
                inputMode="numeric"
                maxLength={14}
                className={fieldErrors.phone ? "border-destructive focus-visible:ring-destructive" : "border-border/50"}
              />
              {fieldErrors.phone && (
                <p className="text-xs text-destructive">{fieldErrors.phone}</p>
              )}
            </div>
 
            {/* Email */}
            <div className="space-y-1">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="text"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => { setEmail(e.target.value); clearFieldError("email") }}
                className={fieldErrors.email ? "border-destructive focus-visible:ring-destructive" : "border-border/50"}
              />
              {fieldErrors.email && (
                <p className="text-xs text-destructive">{fieldErrors.email}</p>
              )}
            </div>
 
            {/* Password */}
            <div className="space-y-1">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Min 8 chars, 1 uppercase, 1 number, 1 special"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); clearFieldError("password") }}
                  className={`pr-10 ${fieldErrors.password ? "border-destructive focus-visible:ring-destructive" : "border-border/50"}`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {fieldErrors.password && (
                <p className="text-xs text-destructive">{fieldErrors.password}</p>
              )}
            </div>
 
            <Button
              type="submit"
              className="w-full bg-foreground text-background hover:bg-foreground/90"
              disabled={loading}
            >
              {loading ? "Creating account…" : "Create Account"}
            </Button>
          </form>
 
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/auth/login" className="font-medium text-sage hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
 
      {/* Right side - Image */}
      <div className="hidden bg-secondary lg:block lg:w-1/2">
        <div className="relative h-full">
          <Image
            src="/images/almond-milk.jpg"
            alt="Fresh almond milk"
            fill
            className="object-cover"
          />
          <div className="absolute inset-0 bg-foreground/10" />
        </div>
      </div>
    </div>
  )
}