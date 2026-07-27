//app/auth/callback/route.ts

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const { searchParams } = url
  const code = searchParams.get('code')
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type')
  const next = searchParams.get('next') ?? '/account'

  // IMPORTANT: behind a reverse proxy (Railway, Vercel, etc.) the server sees
  // this request as its INTERNAL origin — e.g. http://localhost:8080 — not the
  // public site. Building redirects from `new URL(request.url).origin` would
  // therefore bounce users to localhost:8080. Prefer the proxy's forwarded
  // host, fall back to the configured public site URL, and only use the raw
  // request origin as a last resort (local dev, where they're the same).
  const forwardedHost = request.headers.get('x-forwarded-host')
  const forwardedProto = request.headers.get('x-forwarded-proto') ?? 'https'
  const origin = forwardedHost
    ? `${forwardedProto}://${forwardedHost}`
    : process.env.NEXT_PUBLIC_SITE_URL ?? url.origin

  const supabase = await createClient()

  // Handle email change / magic link / password recovery / signup via token_hash
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as any })
    if (!error) {
      let redirectPath: string

      if (type === 'email_change') {
        // Email change confirmed — return to settings with success banner
        redirectPath = '/account/settings?email_updated=true'
      } else if (type === 'recovery') {
        // Password reset — send to the update-password form
        // The user now has an active session scoped to password reset
        redirectPath = '/auth/reset-password'
      } else {
        redirectPath = next
      }

      return NextResponse.redirect(`${origin}${redirectPath}`)
    }

    // Verification failed. This is very often NOT a real failure — email
    // security scanners (Yahoo, Gmail, Outlook Safe Links, etc.) "pre-click"
    // links in emails to check them for safety, which silently consumes our
    // one-time token before the user ever clicks it. By the time the user
    // actually clicks, the action (confirm signup / change email) has usually
    // already succeeded on the scanner's request, but this second verification
    // legitimately fails since the token is single-use. Rather than show a
    // scary "something went wrong" page for what's usually already a success,
    // route each flow somewhere sensible.
    if (type === 'email_change') {
      return NextResponse.redirect(`${origin}/account/settings?email_link_used=true`)
    }
    if (type === 'signup' || type === 'magiclink' || type === 'email') {
      // The account was almost certainly already confirmed by the scanner's
      // pre-click. Send them to sign in with a reassuring note instead of an
      // error. If the link genuinely expired without confirming, sign-in will
      // simply fail and they can request a new link.
      const message = 'Your email is confirmed — please sign in.'
      return NextResponse.redirect(
        `${origin}/auth/login?message=${encodeURIComponent(message)}`
      )
    }
    // recovery (or an unknown type): the token really is spent/expired and we
    // can't safely assume success. Ask them to request a fresh link.
    const message = 'This link is invalid or has expired. Please request a new one.'
    return NextResponse.redirect(
      `${origin}/auth/error?message=${encodeURIComponent(message)}`
    )
  }

  // Handle PKCE code exchange (sign-in / sign-up flows)
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Return the user to an error page
  return NextResponse.redirect(
    `${origin}/auth/error?message=${encodeURIComponent('Could not verify email')}`
  )
}
