//components/account/account-settings.tsx

"use client"

import React from "react"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { updateProfile } from "@/app/actions/profile"
import { signOut, updatePassword, updateEmail, verifyCurrentPassword } from "@/app/actions/auth"
import {
  ArrowLeft,
  Loader2,
  User,
  Lock,
  MapPin,
  Mail,
  Eye,
  EyeOff,
  CheckCircle2,
  ShieldCheck,
  AlertCircle,
  KeyRound,
  MailCheck,
  RefreshCw,
} from "lucide-react"
import Link from "next/link"
import type { User as SupabaseUser } from "@supabase/supabase-js"
import { Textarea } from "@/components/ui/textarea"

interface Profile {
  id: string
  first_name: string | null
  last_name: string | null
  phone: string | null
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
  delivery_instructions: string | null
}

interface AccountSettingsProps {
  user: SupabaseUser
  profile: Profile | null
}

function Req({ met, label }: { met: boolean; label: string }) {
  return (
    <li className={`flex items-center gap-1.5 text-xs transition-colors ${met ? "text-sage" : "text-muted-foreground"}`}>
      <CheckCircle2 className={`h-3.5 w-3.5 shrink-0 transition-opacity ${met ? "opacity-100" : "opacity-30"}`} />
      {label}
    </li>
  )
}

function AlertBanner({
  type,
  children,
}: {
  type: "success" | "error" | "info"
  children: React.ReactNode
}) {
  const styles = {
    success: "bg-sage/10 border-sage/20 text-sage",
    error: "bg-destructive/10 border-destructive/20 text-destructive",
    info: "bg-blue/10 border-blue/20 text-blue",
  }
  const icons = {
    success: <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />,
    error: <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />,
    info: <MailCheck className="h-4 w-4 shrink-0 mt-0.5" />,
  }
  return (
    <div className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm ${styles[type]}`}>
      {icons[type]}
      <div>{children}</div>
    </div>
  )
}

function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={`h-1.5 rounded-full transition-all duration-300 ${
            i < current ? "w-4 bg-sage" : i === current ? "w-4 bg-sage/50" : "w-1.5 bg-muted"
          }`}
        />
      ))}
    </div>
  )
}

export function AccountSettings({ user, profile }: AccountSettingsProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [isLoading, setIsLoading] = useState(false)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [formData, setFormData] = useState({
    firstName: profile?.first_name || "",
    lastName: profile?.last_name || "",
    phone: profile?.phone || "",
    address: profile?.address || "",
    city: profile?.city || "",
    state: profile?.state || "",
    zip: profile?.zip || "",
    deliveryInstructions: profile?.delivery_instructions || "",
  })

  const [emailStep, setEmailStep] = useState<"form" | "pending">("form")
  const [pendingEmail, setPendingEmail] = useState("")
  const [isEmailLoading, setIsEmailLoading] = useState(false)
  const [emailMessage, setEmailMessage] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null)
  const [emailData, setEmailData] = useState({ newEmail: "", confirmEmail: "" })
  // Independent from the password-change section's currentPassword/
  // showCurrentPassword state above — this form is verified separately
  // (see updateEmail's server-side re-auth) and shouldn't share state with
  // an unrelated form the user might have partially filled in elsewhere.
  const [emailCurrentPassword, setEmailCurrentPassword] = useState("")
  const [showEmailCurrentPassword, setShowEmailCurrentPassword] = useState(false)
  const [emailUpdatedBanner, setEmailUpdatedBanner] = useState(false)
  const [emailLinkUsedBanner, setEmailLinkUsedBanner] = useState(false)

  type PasswordStep = "verify" | "new" | "done"
  const [passwordStep, setPasswordStep] = useState<PasswordStep>("verify")
  const [isVerifyLoading, setIsVerifyLoading] = useState(false)
  const [isPasswordLoading, setIsPasswordLoading] = useState(false)
  const [currentPassword, setCurrentPassword] = useState("")
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [passwordData, setPasswordData] = useState({ newPassword: "", confirmPassword: "" })
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [verifyMessage, setVerifyMessage] = useState<{ type: "error"; text: string } | null>(null)
  const [passwordMessage, setPasswordMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)

  useEffect(() => {
    if (searchParams.get("email_updated") === "true") {
      setEmailUpdatedBanner(true)
      const url = new URL(window.location.href)
      url.searchParams.delete("email_updated")
      window.history.replaceState({}, "", url.toString())
    }
    if (searchParams.get("email_link_used") === "true") {
      setEmailLinkUsedBanner(true)
      const url = new URL(window.location.href)
      url.searchParams.delete("email_link_used")
      window.history.replaceState({}, "", url.toString())
    }
  }, [searchParams])

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setMessage(null)
    const result = await updateProfile({
      userId: user.id,
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
      setMessage({ type: "error", text: result.error })
    } else {
      setMessage({ type: "success", text: "Profile updated successfully!" })
    }
    setIsLoading(false)
  }

  const handleVerifyPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentPassword.trim()) {
      setVerifyMessage({ type: "error", text: "Please enter your current password." })
      return
    }
    setIsVerifyLoading(true)
    setVerifyMessage(null)
    const result = await verifyCurrentPassword(currentPassword)
    if (result.error) {
      setVerifyMessage({ type: "error", text: result.error })
    } else {
      setPasswordStep("new")
    }
    setIsVerifyLoading(false)
  }

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setPasswordMessage(null)

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setPasswordMessage({ type: "error", text: "Passwords do not match." })
      return
    }
    if (passwordData.newPassword === currentPassword) {
      setPasswordMessage({ type: "error", text: "New password must be different from your current password." })
      return
    }

    setIsPasswordLoading(true)
    // currentPassword is re-verified server-side. The "verify" step above only
    // gates the UI — updatePassword is a server action anyone with a session
    // could POST to directly, so it can't trust that the step happened.
    const result = await updatePassword(currentPassword, passwordData.newPassword)
    if (result.error) {
      setPasswordMessage({ type: "error", text: result.error })
    } else {
      setPasswordStep("done")
      setPasswordData({ newPassword: "", confirmPassword: "" })
      setCurrentPassword("")
    }
    setIsPasswordLoading(false)
  }

  const resetPasswordFlow = () => {
    setPasswordStep("verify")
    setCurrentPassword("")
    setPasswordData({ newPassword: "", confirmPassword: "" })
    setVerifyMessage(null)
    setPasswordMessage(null)
    setShowCurrentPassword(false)
    setShowNewPassword(false)
    setShowConfirmPassword(false)
  }

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setEmailMessage(null)

    const trimmedNew = emailData.newEmail.trim().toLowerCase()
    const trimmedConfirm = emailData.confirmEmail.trim().toLowerCase()

    if (!trimmedNew || !trimmedConfirm) {
      setEmailMessage({ type: "error", text: "Please fill in both email fields." })
      return
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(trimmedNew)) {
      setEmailMessage({ type: "error", text: "Please enter a valid email address." })
      return
    }
    if (trimmedNew !== trimmedConfirm) {
      setEmailMessage({ type: "error", text: "Email addresses do not match." })
      return
    }
    if (trimmedNew === user.email?.toLowerCase()) {
      setEmailMessage({ type: "error", text: "New email must be different from your current email." })
      return
    }
    if (!emailCurrentPassword.trim()) {
      setEmailMessage({ type: "error", text: "Please enter your current password to confirm this change." })
      return
    }

    setIsEmailLoading(true)
    const result = await updateEmail(emailCurrentPassword, trimmedNew)
    if (result.error) {
      setEmailMessage({ type: "error", text: result.error })
    } else {
      setPendingEmail(trimmedNew)
      setEmailStep("pending")
      setEmailData({ newEmail: "", confirmEmail: "" })
      setEmailCurrentPassword("")
    }
    setIsEmailLoading(false)
  }

  const handleSignOut = async () => {
    await signOut()
    router.push("/")
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/account"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-border transition-colors hover:bg-card"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="font-serif text-2xl font-medium text-foreground md:text-3xl">
            Account Settings
          </h1>
          <p className="text-sm text-muted-foreground">{user.email}</p>
        </div>
      </div>

      {emailUpdatedBanner && (
        <div className="flex items-start gap-3 rounded-lg border border-sage/30 bg-sage/10 px-4 py-3 text-sm text-sage">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-medium">Email address updated successfully!</p>
            <p className="text-sage/80">Your account now uses your new email address.</p>
          </div>
          <button
            onClick={() => setEmailUpdatedBanner(false)}
            className="ml-auto shrink-0 text-sage/60 hover:text-sage"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      {emailLinkUsedBanner && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-300/50 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-medium">That confirmation link had already been used.</p>
            <p className="text-amber-700/80">
              If you recently changed your email, it&apos;s likely already updated — check the
              address above. If it&apos;s still showing your old email, just request the change again.
            </p>
          </div>
          <button
            onClick={() => setEmailLinkUsedBanner(false)}
            className="ml-auto shrink-0 text-amber-700/60 hover:text-amber-800"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      {/* Profile Information */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sage/10">
              <User className="h-5 w-5 text-sage" />
            </div>
            <div>
              <CardTitle className="font-serif text-xl font-medium">Profile Information</CardTitle>
              <CardDescription>Update your personal details</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleProfileSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name</Label>
                <Input
                  id="firstName"
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  placeholder="Enter your first name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name</Label>
                <Input
                  id="lastName"
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  placeholder="Enter your last name"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number</Label>
              <Input
                id="phone"
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="(555) 555-5555"
              />
            </div>
            {message && (
              <AlertBanner type={message.type}>
                {message.text}
              </AlertBanner>
            )}
            <Button type="submit" disabled={isLoading} className="cursor-pointer">
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Delivery Address */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue/10">
              <MapPin className="h-5 w-5 text-blue" />
            </div>
            <div>
              <CardTitle className="font-serif text-xl font-medium">Delivery Information</CardTitle>
              <CardDescription>Where should we deliver your milk?</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleProfileSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="address">Street Address</Label>
              <Input
                id="address"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                placeholder="123 Main Street"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="city">City</Label>
                <Input
                  id="city"
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  placeholder="Greenport"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="state">State</Label>
                <Input
                  id="state"
                  value={formData.state}
                  onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                  placeholder="NY"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="zip">ZIP Code</Label>
                <Input
                  id="zip"
                  value={formData.zip}
                  onChange={(e) => setFormData({ ...formData, zip: e.target.value })}
                  placeholder="11944"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="deliveryInstructions">Delivery Instructions</Label>
              <Textarea
                id="deliveryInstructions"
                value={formData.deliveryInstructions}
                onChange={(e) => setFormData({ ...formData, deliveryInstructions: e.target.value })}
                placeholder="Leave by the side door, ring the bell, etc."
                rows={3}
              />
            </div>
            <Button type="submit" disabled={isLoading} className="cursor-pointer">
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Address
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Change Email */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue/10">
              <Mail className="h-5 w-5 text-blue" />
            </div>
            <div>
              <CardTitle className="font-serif text-xl font-medium">Change Email Address</CardTitle>
              <CardDescription>Update the email associated with your account</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {emailStep === "pending" ? (
            <div className="space-y-5">
              <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-muted/30 px-6 py-8 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-sage/10">
                  <MailCheck className="h-7 w-7 text-sage" />
                </div>
                <div className="space-y-1">
                  <p className="font-medium text-foreground">Check your inbox</p>
                  <p className="text-sm text-muted-foreground">
                    We sent a confirmation link to{" "}
                    <span className="font-medium text-foreground">{pendingEmail}</span>
                  </p>
                </div>
              </div>

              <div className="space-y-2 rounded-lg border border-border bg-muted/20 px-4 py-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  What happens next
                </p>
                <ol className="space-y-2">
                  {[
                    `Click the link sent to ${pendingEmail} to confirm your new address.`,
                    `You'll also receive a notice at ${user.email} for security.`,
                    "Once confirmed, your account will use the new email.",
                  ].map((step, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">
                        {i + 1}
                      </span>
                      {step}
                    </li>
                  ))}
                </ol>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={() => {
                    setEmailStep("form")
                    setEmailMessage(null)
                  }}
                  className="flex items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Use a different email address
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleEmailSubmit} className="space-y-4">
              <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2.5">
                <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Current email</p>
                  <p className="truncate text-sm font-medium text-foreground">{user.email}</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="newEmail">New Email Address</Label>
                <Input
                  id="newEmail"
                  type="email"
                  value={emailData.newEmail}
                  onChange={(e) => setEmailData({ ...emailData, newEmail: e.target.value })}
                  placeholder="you@example.com"
                  autoComplete="off"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmEmail">Confirm New Email Address</Label>
                <Input
                  id="confirmEmail"
                  type="email"
                  value={emailData.confirmEmail}
                  onChange={(e) => setEmailData({ ...emailData, confirmEmail: e.target.value })}
                  placeholder="you@example.com"
                  autoComplete="off"
                />
                {emailData.confirmEmail && emailData.newEmail && (
                  <p
                    className={`text-xs ${
                      emailData.newEmail.trim().toLowerCase() ===
                      emailData.confirmEmail.trim().toLowerCase()
                        ? "text-sage"
                        : "text-destructive"
                    }`}
                  >
                    {emailData.newEmail.trim().toLowerCase() ===
                    emailData.confirmEmail.trim().toLowerCase()
                      ? "✓ Emails match"
                      : "Emails do not match"}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="emailCurrentPassword">Current Password</Label>
                <div className="relative">
                  <Input
                    id="emailCurrentPassword"
                    type={showEmailCurrentPassword ? "text" : "password"}
                    value={emailCurrentPassword}
                    onChange={(e) => setEmailCurrentPassword(e.target.value)}
                    placeholder="Enter your current password to confirm"
                    className="pr-10"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowEmailCurrentPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                    aria-label={showEmailCurrentPassword ? "Hide password" : "Show password"}
                  >
                    {showEmailCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {emailMessage && (
                <AlertBanner type={emailMessage.type}>{emailMessage.text}</AlertBanner>
              )}

              <Button type="submit" disabled={isEmailLoading} className="cursor-pointer">
                {isEmailLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Send Confirmation Email
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      {/* Change Password */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
              <Lock className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="flex-1">
              <CardTitle className="font-serif text-xl font-medium">Change Password</CardTitle>
              <CardDescription>Update your account password</CardDescription>
            </div>
            {passwordStep !== "done" && (
              <StepDots current={passwordStep === "verify" ? 0 : 1} total={2} />
            )}
          </div>
        </CardHeader>
        <CardContent>
          {passwordStep === "done" ? (
            <div className="space-y-5">
              <div className="flex flex-col items-center gap-3 rounded-xl border border-sage/20 bg-sage/5 px-6 py-8 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-sage/15">
                  <ShieldCheck className="h-7 w-7 text-sage" />
                </div>
                <div className="space-y-1">
                  <p className="font-medium text-foreground">Password updated</p>
                  <p className="text-sm text-muted-foreground">
                    Your account is secured with your new password.
                  </p>
                </div>
              </div>
              <button
                onClick={resetPasswordFlow}
                className="flex items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                <KeyRound className="h-3.5 w-3.5" />
                Change password again
              </button>
            </div>
          ) : passwordStep === "verify" ? (
            <form onSubmit={handleVerifyPassword} className="space-y-4">
              <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <p>For your security, please confirm your current password before making changes.</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="currentPassword">Current Password</Label>
                <div className="relative">
                  <Input
                    id="currentPassword"
                    type={showCurrentPassword ? "text" : "password"}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter your current password"
                    className="pr-10"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                    aria-label={showCurrentPassword ? "Hide password" : "Show password"}
                  >
                    {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {verifyMessage && (
                <AlertBanner type="error">{verifyMessage.text}</AlertBanner>
              )}

              <div className="flex items-center gap-3">
                <Button type="submit" disabled={isVerifyLoading} className="cursor-pointer">
                  {isVerifyLoading ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Verifying…</>
                  ) : (
                    "Continue"
                  )}
                </Button>
                <Link
                  href="/auth/forgot-password"
                  className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
            </form>
          ) : (
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div className="flex items-start gap-3 rounded-lg border border-sage/20 bg-sage/5 px-4 py-3 text-sm text-sage">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                <p>Identity confirmed. Now choose a new password.</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="newPassword">New Password</Label>
                <div className="relative">
                  <Input
                    id="newPassword"
                    type={showNewPassword ? "text" : "password"}
                    value={passwordData.newPassword}
                    onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                    placeholder="Enter new password"
                    className="pr-10"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                    aria-label={showNewPassword ? "Hide" : "Show"}
                  >
                    {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <ul className="space-y-1.5 rounded-lg border border-border bg-muted/20 px-3 py-2.5">
                <Req met={passwordData.newPassword.length >= 8} label="At least 8 characters" />
                <Req met={/[A-Z]/.test(passwordData.newPassword)} label="One uppercase letter" />
                <Req met={/[0-9]/.test(passwordData.newPassword)} label="One number" />
                <Req met={/[^A-Za-z0-9]/.test(passwordData.newPassword)} label="One special character" />
              </ul>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm New Password</Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    value={passwordData.confirmPassword}
                    onChange={(e) =>
                      setPasswordData({ ...passwordData, confirmPassword: e.target.value })
                    }
                    placeholder="Confirm new password"
                    className="pr-10"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                    aria-label={showConfirmPassword ? "Hide" : "Show"}
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {passwordData.confirmPassword && passwordData.newPassword && (
                  <p
                    className={`text-xs ${
                      passwordData.newPassword === passwordData.confirmPassword
                        ? "text-sage"
                        : "text-destructive"
                    }`}
                  >
                    {passwordData.newPassword === passwordData.confirmPassword
                      ? "✓ Passwords match"
                      : "Passwords do not match"}
                  </p>
                )}
              </div>

              {passwordMessage && (
                <AlertBanner type={passwordMessage.type}>{passwordMessage.text}</AlertBanner>
              )}

              <div className="flex items-center gap-3">
                <Button type="submit" disabled={isPasswordLoading}>
                  {isPasswordLoading ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Updating…</>
                  ) : (
                    "Update Password"
                  )}
                </Button>
                <button
                  type="button"
                  onClick={resetPasswordFlow}
                  className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  Back
                </button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      {/* Sign Out */}
      <Card className="border-destructive/20">
        <CardContent className="flex items-center justify-between py-6">
          <div>
            <p className="font-medium text-foreground">Sign Out</p>
            <p className="text-sm text-muted-foreground">Sign out of your account on this device</p>
          </div>
          <Button variant="outline" onClick={handleSignOut} className="cursor-pointer">
            Sign Out
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}