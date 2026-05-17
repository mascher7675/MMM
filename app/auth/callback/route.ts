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

  // Handle email change / magic link confirmation via token_hash
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as any })
    if (!error) {
      // For email_change, redirect back to settings with a success indicator
      const redirectPath = type === 'email_change'
        ? '/account/settings?email_updated=true'
        : next
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

  // Return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/auth/error?message=Could not verify email`)
}