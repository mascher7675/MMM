//app/auth/callback/route.ts
 
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
 
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type')
  const next = searchParams.get('next') ?? '/account'
 
  const supabase = await createClient()
 
  // Handle email change / magic link / password recovery via token_hash
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
 
    // A failed email_change verification here is very often NOT a real
    // failure — email security scanners (Gmail, Outlook Safe Links, etc.)
    // "pre-click" links in emails to check them for safety, which silently
    // consumes our one-time token before the user ever clicks it. By the
    // time the user actually clicks, the change has frequently already
    // completed successfully, but this second verification legitimately
    // fails since the token is single-use. Rather than show a scary "went
    // wrong" page for what's usually already a success, send the user back
    // to settings with a reassuring banner instead of the generic error page.
    if (type === 'email_change') {
      return NextResponse.redirect(`${origin}/account/settings?email_link_used=true`)
    }
  }
 
  // Handle PKCE code exchange (sign-in / sign-up flows)
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }
 
  // Return the user to an error page
  return NextResponse.redirect(`${origin}/auth/error?message=Could not verify email`)
}