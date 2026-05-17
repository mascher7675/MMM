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
