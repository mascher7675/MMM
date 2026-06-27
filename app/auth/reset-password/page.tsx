//app/auth/reset-password/page.tsx

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

function validatePassword(password: string): string | null {
  if (!password || !password.trim()) return "Password is required."
  if (password.length < 8) return "Password must be at least 8 characters."
  if (!/[A-Z]/.test(password)) return "Password must include at least one uppercase letter."
  if (!/\d/.test(password)) return "Password must include at least one number."
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(password))
    return "Password must include at least one special character."
  return null
}

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expired, setExpired] = useState(false)
  const [samePassword, setSamePassword] = useState(false)
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setExpired(false)
    setSamePassword(false)

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
      // Supabase returns "same_password" error code when the new password
      // matches the existing one
      if (
        updateError.message?.toLowerCase().includes("same password") ||
        updateError.message?.toLowerCase().includes("different from the old password") ||
        (updateError as any).code === "same_password"
      ) {
        setSamePassword(true)
      } else {
        setExpired(true)
      }
      return
    }

    setSuccess(true)
    setTimeout(() => router.push("/account"), 2500)
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
        {success ? (
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
        ) : expired ? (
          <div className="text-center">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
              <svg className="h-8 w-8 text-destructive" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h1 className="font-serif text-3xl font-medium tracking-tight text-foreground">
              Link expired
            </h1>
            <p className="mt-4 text-muted-foreground">
              Your password reset session timed out. Reset links are only valid for a short window — please request a new one.
            </p>
            <div className="mt-8">
              <Button asChild className="bg-foreground text-background hover:bg-foreground/90">
                <Link href="/auth/forgot-password">Request a new reset link</Link>
              </Button>
            </div>
          </div>
        ) : (
          <>
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

              {samePassword && (
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
          </>
        )}
      </div>
    </div>
  )
}