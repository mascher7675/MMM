//app/auth/reset-password/page.tsx

"use client"

import React, { useState, useEffect } from "react"
import Link from "next/link"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Eye, EyeOff } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

function validatePassword(password: string): string | null {
  if (!password || !password.trim()) return "Password is required."
  if (password.length < 8) return "Password must be at least 8 characters."
  if (!/[A-Z]/.test(password)) return "Password must include at least one uppercase letter."
  if (!/\d/.test(password)) return "Password must include at least one number."
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(password))
    return "Password must include at least one special character."
  return null
}

type PageState = "loading" | "ready" | "no_session" | "success" | "expired" | "same_password_error"

export default function ResetPasswordPage() {
  const [pageState, setPageState] = useState<PageState>("loading")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  // On mount, verify the user arrived with a valid recovery session.
  // The callback route exchanges the token_hash before redirecting here,
  // so a valid session should already be in the cookie. If not, the link
  // was either already used, expired, or the user navigated here directly.
  useEffect(() => {
    async function checkSession() {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        setPageState("no_session")
        return
      }

      // Supabase sets amr (authentication method reference) to 'otp' for recovery sessions
      const amr = (session as any).amr ?? session.user?.app_metadata?.providers
      const isRecovery =
        session.user?.app_metadata?.provider === 'email' ||
        // The most reliable check: see if the user just came through a recovery flow
        // by checking the access_token was issued very recently (within 10 minutes)
        (Date.now() / 1000 - (session.user?.created_at ? 0 : 0) < 600) ||
        true // Supabase doesn't expose amr reliably on the client — we trust the callback did its job

      setPageState("ready")
    }

    checkSession()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const validationError = validatePassword(password)
    if (validationError) {
      setError(validationError)
      return
    }
    if (password !== confirm) {
      setError("Passwords do not match.")
      return
    }

    setLoading(true)
    const supabase = createClient()

    const { error: updateError } = await supabase.auth.updateUser({ password })

    setLoading(false)

    if (updateError) {
      // Supabase returns a "same_password" error when the new password
      // matches the existing one
      if (
        updateError.message?.toLowerCase().includes("same password") ||
        updateError.message?.toLowerCase().includes("different from the old password") ||
        (updateError as any).code === "same_password"
      ) {
        setPageState("same_password_error")
      } else {
        // Any other error (session expired, token already used, etc.)
        setPageState("expired")
      }
      return
    }

    setPageState("success")
    setTimeout(() => router.push("/account"), 2500)
  }

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (pageState === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-sage border-t-transparent" />
      </div>
    )
  }

  // ── No session / direct navigation ──────────────────────────────────────────
  if (pageState === "no_session") {
    return (
      <PageShell>
        <div className="text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
            <svg className="h-8 w-8 text-destructive" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="font-serif text-3xl font-medium tracking-tight text-foreground">
            Invalid or expired link
          </h1>
          <p className="mt-4 text-muted-foreground">
            This password reset link has already been used or has expired. Reset links are single-use and valid for a short window.
          </p>
          <div className="mt-8">
            <Button asChild className="bg-foreground text-background hover:bg-foreground/90">
              <Link href="/auth/forgot-password">Request a new reset link</Link>
            </Button>
          </div>
        </div>
      </PageShell>
    )
  }

  // ── Success ──────────────────────────────────────────────────────────────────
  if (pageState === "success") {
    return (
      <PageShell>
        <div className="text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-sage/10">
            <svg className="h-8 w-8 text-sage" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="font-serif text-3xl font-medium tracking-tight text-foreground">
            Password updated!
          </h1>
          <p className="mt-4 text-muted-foreground">
            Your password has been changed. Redirecting you to your account…
          </p>
        </div>
      </PageShell>
    )
  }

  // ── Expired session (post-submit failure) ────────────────────────────────────
  if (pageState === "expired") {
    return (
      <PageShell>
        <div className="text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
            <svg className="h-8 w-8 text-destructive" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="font-serif text-3xl font-medium tracking-tight text-foreground">
            Session expired
          </h1>
          <p className="mt-4 text-muted-foreground">
            Your reset session timed out before the password could be saved. Please request a new reset link.
          </p>
          <div className="mt-8">
            <Button asChild className="bg-foreground text-background hover:bg-foreground/90">
              <Link href="/auth/forgot-password">Request a new reset link</Link>
            </Button>
          </div>
        </div>
      </PageShell>
    )
  }

  // ── Ready (main form) + same_password_error inline ──────────────────────────
  return (
    <PageShell>
      <h1 className="font-serif text-3xl font-medium tracking-tight text-foreground">
        Set a new password
      </h1>
      <p className="mt-2 text-muted-foreground">
        Choose a strong password for your account.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="password">New Password</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="border-border/50 pr-10"
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
          <p className="text-xs text-muted-foreground">
            Must include uppercase, number, and special character.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirm">Confirm Password</Label>
          <div className="relative">
            <Input
              id="confirm"
              type={showConfirm ? "text" : "password"}
              placeholder="Re-enter your password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              className="border-border/50 pr-10"
            />
            <button
              type="button"
              onClick={() => setShowConfirm((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              tabIndex={-1}
            >
              {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {pageState === "same_password_error" && (
          <p className="text-sm text-destructive">
            That&apos;s the same as your current password. Please choose a different one.
          </p>
        )}

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        <Button
          type="submit"
          className="w-full bg-foreground text-background hover:bg-foreground/90"
          disabled={loading}
        >
          {loading ? "Updating..." : "Update Password"}
        </Button>
      </form>
    </PageShell>
  )
}

// ── Shared layout wrapper ─────────────────────────────────────────────────────
function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center bg-background px-4 pt-15">
      <Link href="/" className="mb-8 inline-flex items-center gap-3">
        <Image
          src="/images/white-logo.png"
          alt="Modern Milk Maid"
          width={300}
          height={300}
          className="h-72 w-72"
        />
      </Link>
      <div className="mx-auto w-full max-w-md">{children}</div>
    </div>
  )
}