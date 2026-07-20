//app/actions/profile.ts

"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"

interface UpdateProfileParams {
  userId: string
  firstName: string
  lastName: string
  phone: string
  address: string
  city: string
  state: string
  zip: string
  deliveryInstructions: string
}

export async function updateProfile({
  userId,
  firstName,
  lastName,
  phone,
  address,
  city,
  state,
  zip,
  deliveryInstructions,
}: UpdateProfileParams): Promise<{ error: string | null }> {
  try {
    const supabase = await createClient()

    // Verify the caller IS the user they claim to be.
    //
    // `userId` arrives from the client and this is a server action — a public
    // HTTP endpoint — so it's an unauthenticated claim. Cross-user writes are
    // already blocked by the profiles_update_own RLS policy (auth.uid() = id),
    // which is what makes this safe rather than critical. But relying on RLS
    // alone has a nasty failure mode: a blocked UPDATE matches zero rows, and
    // updating zero rows is NOT an error. Supabase returns { error: null }, so
    // this function reported success and the settings page cheerfully said
    // "Profile updated successfully!" while nothing had been written.
    //
    // The realistic victim isn't an attacker, it's an ordinary customer whose
    // session expired in another tab: they edit their address, get a green
    // success message, and silently lose the change. Checking here means a
    // mismatch says so out loud, and RLS becomes defence-in-depth rather than
    // the only thing standing between us and a lie.
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return { error: "Your session has expired. Please sign in again." }
    }

    if (user.id !== userId) {
      console.error(
        `updateProfile: caller ${user.id} attempted to update profile ${userId}`
      )
      return { error: "You can only update your own profile." }
    }

    const { error } = await supabase
      .from("profiles")
      .update({
        first_name: firstName || null,
        last_name: lastName || null,
        phone: phone || null,
        address: address || null,
        city: city || null,
        state: state || null,
        zip: zip || null,
        delivery_instructions: deliveryInstructions || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)

    if (error) {
      console.error("Profile update error:", error)
      return { error: error.message }
    }

    revalidatePath("/account", "page")
    revalidatePath("/account/settings", "page")
    
    return { error: null }
  } catch (error) {
    console.error("Unexpected error:", error)
    return { error: "An unexpected error occurred" }
  }
}
