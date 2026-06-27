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