//app/auth/forgot-password/page.tsx

"use client"

import React, { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createClient } from "@/lib/supabase/client"

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!email.trim()) {
      setError("Please enter your email address.")
      return
    }
    if (!isValidEmail(email)) {
      setError("Please enter a valid email address.")
      return
    }

    setLoading(true)
    const supabase = createClient()

    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:4000"

    // redirectTo must go through /auth/callback so the token_hash is exchanged
    // for a session before the user reaches the reset-password form.
    // The callback route detects type=recovery and forwards to /auth/reset-password.
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email.trim().toLowerCase(),
      {
        redirectTo: `${siteUrl}/auth/callback?next=/auth/reset-password`,
      }
    )

    setLoading(false)

    if (resetError) {
      console.error("Reset error:", resetError.message)
      setError("Something went wrong. Please try again.")
      return
    }

    // Always show success — avoids leaking whether the email exists
    setSubmitted(true)
  }

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

      <div className="mx-auto w-full max-w-md">
        {submitted ? (
          <div className="text-center">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-sage/10">
              <svg
                className="h-8 w-8 text-sage"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
            </div>
            <h1 className="font-serif text-3xl font-medium tracking-tight text-foreground">
              Check your email
            </h1>
            <p className="mt-4 text-muted-foreground">
              If an account exists for <span className="font-medium text-foreground">{email}</span>,
              we&apos;ve sent a password reset link. Check your inbox (and spam folder).
            </p>
            <div className="mt-8">
              <Button asChild variant="outline" className="bg-transparent">
                <Link href="/auth/login">Back to Sign In</Link>
              </Button>
            </div>
          </div>
        ) : (
          <>
            <h1 className="font-serif text-3xl font-medium tracking-tight text-foreground">
              Forgot your password?
            </h1>
            <p className="mt-2 text-muted-foreground">
              Enter the email address associated with your account and we&apos;ll send you a reset link.
            </p>

            <form onSubmit={handleSubmit} className="mt-8 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="border-border/50"
                />
              </div>

              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}

              <Button
                type="submit"
                className="w-full bg-foreground text-background hover:bg-foreground/90 cursor-pointer"
                disabled={loading}
              >
                {loading ? "Sending..." : "Send Reset Link"}
              </Button>
            </form>

            <p className="mt-6 text-center text-sm text-muted-foreground">
              Remember your password?{" "}
              <Link href="/auth/login" className="font-medium text-sage hover:underline">
                Sign in
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  )
}