//app/auth/login/page.tsx
 
"use client"
 
import React from "react"
import { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Eye, EyeOff } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
 
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}
 
export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
 
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
    if (!password) {
      setError("Please enter your password.")
      return
    }
 
    setLoading(true)
    const supabase = createClient()
 
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
 
    if (signInError) {
      console.log("Supabase error:", signInError.message, signInError)
      const msg = signInError.message.toLowerCase()
 
      if (msg.includes("email not confirmed")) {
        setError("Please confirm your email address before signing in. Check your inbox for a confirmation link.")
      } else if (msg.includes("invalid login credentials") || msg.includes("invalid credentials")) {
        setError("Incorrect email or password. Please try again, or use \"Forgot password\" below.")
      } else if (msg.includes("too many requests") || msg.includes("rate limit")) {
        setError("Too many sign-in attempts. Please wait a few minutes and try again.")
      } else {
        setError("Something went wrong. Please try again.")
      }
 
      setLoading(false)
      return
    }
 
    router.push("/account")
    router.refresh()
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
            Welcome back
          </h1>
          <p className="mt-2 text-muted-foreground">
            Sign in to manage your orders/subscription
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
 
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link
                  href="/auth/forgot-password"
                  className="text-xs text-muted-foreground hover:text-sage hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Your password"
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
            </div>
 
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
 
            <Button
              type="submit"
              className="w-full bg-foreground text-background hover:bg-foreground/90 cursor-pointer"
              disabled={loading}
            >
              {loading ? "Signing in..." : "Sign In"}
            </Button>
          </form>
 
          <p className="mt-6 text-center text-sm text-muted-foreground">
            {"Don't have an account? "}
            <Link href="/auth/sign-up" className="font-medium text-sage hover:underline">
              Create one
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