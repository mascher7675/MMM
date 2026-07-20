//app/actions/auth.ts

"use server"

import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"

/**
 * Resolves the absolute URL Supabase redirects back to after an auth email
 * (signup confirmation, password reset, email change).
 *
 * This centralises what used to be three copy-pasted expressions of the form:
 *
 *   process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL ||
 *   `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:4000"}/auth/callback`
 *
 * which carried three separate deployment landmines:
 *
 * 1. LOCALHOST FALLBACK. If NEXT_PUBLIC_SITE_URL is ever missing in
 *    production, `http://localhost:4000` silently ships: every confirmation
 *    and reset email links to localhost, no account can be activated, no
 *    password can be reset — and nothing errors. Failure is invisible until
 *    customers complain. We now throw at call time in production instead of
 *    mailing dead links, so a misconfigured deploy fails loudly and instantly.
 *
 * 2. DEV OVERRIDE OUTRANKED PROD. NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL took
 *    priority unconditionally. One stray copy of a dev .env into the hosting
 *    environment and every auth link in production points at the dev host.
 *    It's now ignored entirely unless NODE_ENV !== "production".
 *
 * 3. DROPPED ?next=. Only the non-dev branch appended
 *    "?next=/auth/update-password" for password resets. Whenever the dev
 *    override was set, that param vanished and users landed on /account
 *    instead of the update-password screen — i.e. password reset silently
 *    didn't work in dev.
 *
 * NOTE: NEXT_PUBLIC_* values are inlined at BUILD time, so NEXT_PUBLIC_SITE_URL
 * must be present in the build environment, not just at runtime.
 */
function authRedirectUrl(next?: string): string {
  const path = `/auth/callback${next ? `?next=${encodeURIComponent(next)}` : ""}`

  if (process.env.NODE_ENV !== "production") {
    const devBase = process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL
    if (devBase) {
      // This var historically held a full callback URL rather than a bare
      // origin. Accept either: strip a trailing /auth/callback and any query
      // so the path (with ?next=) can be re-appended intact.
      const origin = devBase.replace(/\/auth\/callback.*$/, "").replace(/\/+$/, "")
      return `${origin}${path}`
    }
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
  if (!siteUrl) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "NEXT_PUBLIC_SITE_URL is not set. Refusing to send auth emails that would " +
          "link to localhost. Set NEXT_PUBLIC_SITE_URL in the deployment environment."
      )
    }
    return `http://localhost:4000${path}`
  }

  return `${siteUrl.replace(/\/+$/, "")}${path}`
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

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: authRedirectUrl(),
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

  // The phone number is persisted by the handle_new_user trigger, which copies
  // first_name / last_name / phone out of raw_user_meta_data (the `data` block
  // above) when the auth.users row is inserted.
  //
  // There used to be an explicit `profiles.update({ phone })` here, commented
  // "trigger only sets name/email". That comment was wrong — the trigger has
  // always copied phone — and the update itself was a silent no-op: with email
  // confirmation enabled, signUp returns no session, so auth.uid() is NULL and
  // the profiles_update_own RLS policy (auth.uid() = id) matched zero rows.
  // It reported no error because updating zero rows isn't an error. Removed
  // rather than left in place looking load-bearing.

  redirect("/auth/sign-up-success")
}

/**
 * Sends a password-reset email via Supabase Auth.
 * Always redirects to a "check your email" page — never reveals whether
 * the address is registered (prevents email enumeration).
 */
export async function requestPasswordReset(
  formData: FormData
): Promise<{ error: string | null }> {
  const email = (formData.get("email") as string)?.trim().toLowerCase()

  if (!email) {
    return { error: "Please enter your email address." }
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) {
    return { error: "Please enter a valid email address." }
  }

  const supabase = await createClient()

  // Always call resetPasswordForEmail — Supabase silently no-ops if the email
  // is not registered, so we never leak whether an account exists.
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: authRedirectUrl("/auth/update-password"),
  })

  if (error) {
    console.error("Password reset error:", error)
    return { error: "Something went wrong. Please try again." }
  }

  return { error: null }
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

/**
 * Changes the signed-in user's password, re-authenticating FIRST.
 *
 * The settings UI walks the user through a "verify current password" step
 * before revealing the new-password form — but that gate is React state
 * (`passwordStep`), and this is a server action, i.e. a public HTTP endpoint.
 * Previously this function took only `newPassword`, so anyone holding a
 * session cookie could POST straight here and skip verification entirely.
 *
 * That mattered: it escalated a TEMPORARY session compromise (an unlocked
 * shared laptop, a borrowed device, a leaked cookie) into PERMANENT account
 * takeover — set a new password, and the real owner is locked out of their own
 * account. Requiring the current password server-side means a stolen session
 * stays merely temporary.
 *
 * `currentPassword` is verified here rather than trusted from the client.
 */
export async function updatePassword(
  currentPassword: string,
  newPassword: string
): Promise<{ error: string | null }> {
  const passwordError = validatePassword(newPassword)
  if (passwordError) return { error: passwordError }

  if (!currentPassword?.trim()) {
    return { error: "Please enter your current password." }
  }

  if (currentPassword === newPassword) {
    return { error: "New password must be different from your current password." }
  }

  // Re-authenticate. Do not trust the client's claim that this already happened.
  const verification = await verifyCurrentPassword(currentPassword)
  if (verification.error) return { error: verification.error }

  const supabase = await createClient()

  const { error } = await supabase.auth.updateUser({
    password: newPassword,
  })

  if (error) {
    return { error: error.message }
  }

  return { error: null }
}

/**
 * Changes the signed-in user's email, re-authenticating FIRST.
 *
 * Same reasoning as updatePassword above: this is a server action, i.e. a
 * public HTTP endpoint, and it previously took only the new email with no
 * verification. Whether Supabase's dashboard "Secure email change" setting
 * requires the OLD address to also confirm isn't something this code can see
 * or rely on staying configured one way — and even with it on, a stolen
 * session could still trigger a confusing, unrequested confirmation email.
 * Without it, a stolen session is a full account takeover: change email to
 * one the attacker controls, confirm it, reset the password, done.
 *
 * Requiring the current password here — the same gate already used for
 * updatePassword — closes that regardless of the dashboard setting.
 */
export async function updateEmail(
  currentPassword: string,
  newEmail: string
): Promise<{ error: string | null }> {
  if (!currentPassword?.trim()) {
    return { error: "Please enter your current password." }
  }

  const verification = await verifyCurrentPassword(currentPassword)
  if (verification.error) return { error: verification.error }

  const supabase = await createClient()

  const { error } = await supabase.auth.updateUser(
    { email: newEmail },
    { emailRedirectTo: authRedirectUrl() }
  )

  if (error) {
    return { error: error.message }
  }

  return { error: null }
}