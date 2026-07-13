//lib/supabase/service.ts

import { createClient as createSupabaseClient } from '@supabase/supabase-js'

/**
 * Service-role Supabase client for trusted, server-only call sites that have
 * no user session to authenticate with — e.g. the Stripe webhook, or cron
 * jobs. This key bypasses Row Level Security entirely, so:
 *
 *  - NEVER import this file into anything that runs in the browser.
 *  - NEVER pass user-controlled input straight into a query/RPC without
 *    checking it belongs to the right user first — this client won't stop
 *    you, RLS is off.
 *  - Only use it where the caller's identity is otherwise verified through
 *    another mechanism (e.g. a verified Stripe webhook signature).
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY to be set in the server environment
 * (Railway env vars) — this must NOT be prefixed with NEXT_PUBLIC_, or it
 * will be bundled into client-side JS and exposed to every visitor.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL environment variable')
  }
  if (!serviceRoleKey) {
    throw new Error(
      'Missing SUPABASE_SERVICE_ROLE_KEY environment variable — required for server-only clients. ' +
        'Get it from Supabase Dashboard > Project Settings > API > service_role key, and add it to ' +
        'Railway as SUPABASE_SERVICE_ROLE_KEY (no NEXT_PUBLIC_ prefix).'
    )
  }

  return createSupabaseClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}