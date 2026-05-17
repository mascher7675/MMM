//app/actions/auth.ts

"use server"

import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"

function validatePassword(password: string): string | null {
  if (!password || !password.trim()) return "Password is required."
  if (password.length < 8) return "Password must be at least 8 characters."
  if (!/[A-Z]/.test(password)) return "Password must include at least one uppercase letter."
  if (!/\d/.test(password)) return "Password must include at least one number."
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(password))
    return "Password must include at least one special character."
  return null
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect("/")
}

export async function signIn(formData: FormData) {
  const supabase = await createClient()

  const email = formData.get("email") as string
  const password = formData.get("password") as string

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    redirect("/auth/login?error=Invalid credentials")
  }

  redirect("/account")
}

export async function signUp(formData: FormData) {
  const supabase = await createClient()

  const email = formData.get("email") as string
  const password = formData.get("password") as string
  const firstName = formData.get("firstName") as string
  const lastName = formData.get("lastName") as string
  const phone = formData.get("phone") as string

  if (!phone?.trim()) {
    redirect("/auth/sign-up?error=Phone number is required")
  }

  const passwordError = validatePassword(password)
  if (passwordError) {
    redirect(`/auth/sign-up?error=${encodeURIComponent(passwordError)}`)
  }

  const { data: authData, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo:
        process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL ||
        `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:4000"}/auth/callback`,
      data: {
        first_name: firstName,
        last_name: lastName,
        phone: phone.trim(),
      },
    },
  })

  if (error) {
    redirect("/auth/sign-up?error=Could not create account")
  }

  // Immediately write phone to the profile row (trigger only sets name/email)
  if (authData.user) {
    await supabase
      .from("profiles")
      .update({ phone: phone.trim() })
      .eq("id", authData.user.id)
  }

  redirect("/auth/sign-up-success")
}

/**
 * Verifies the user's current password by attempting a sign-in.
 * Used as a re-authentication step before sensitive account changes.
 */
export async function verifyCurrentPassword(
  currentPassword: string
): Promise<{ error: string | null }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return { error: "Could not verify your session. Please sign in again." }

  const { error } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  })

  if (error) {
    return { error: "Incorrect current password. Please try again." }
  }

  return { error: null }
}

export async function updatePassword(newPassword: string): Promise<{ error: string | null }> {
  const passwordError = validatePassword(newPassword)
  if (passwordError) return { error: passwordError }

  const supabase = await createClient()

  const { error } = await supabase.auth.updateUser({
    password: newPassword,
  })

  if (error) {
    return { error: error.message }
  }

  return { error: null }
}

export async function updateEmail(newEmail: string): Promise<{ error: string | null }> {
  const supabase = await createClient()

  const { error } = await supabase.auth.updateUser(
    { email: newEmail },
    {
      emailRedirectTo:
        process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL ||
        `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:4000"}/auth/callback`,
    }
  )

  if (error) {
    return { error: error.message }
  }

  return { error: null }
}