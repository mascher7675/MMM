// app/actions/contact.ts

"use server"

import { createClient } from "@/lib/supabase/server"
import { sendContactNotificationEmail } from "@/lib/email"

export async function sendContactMessage({
  name,
  email,
  phone,
  message,
}: {
  name: string
  email: string
  phone: string
  message: string
}): Promise<{ error: string | null }> {
  try {
    if (!name.trim() || !email.trim() || !phone.trim() || !message.trim()) {
      return { error: "All fields are required." }
    }

    const supabase = await createClient()

    const { error } = await supabase.from("messages").insert({
      user_id: null,
      type: "contact",
      subject: "Homepage Contact Form",
      body: message.trim(),
      customer_name: name.trim(),
      customer_email: email.trim(),
      phone: phone.trim(),
      status: "unread",
    })

    if (error) return { error: error.message }

    // Send email notification to admin — non-blocking, don't fail the
    // user-facing action if the email fails.
    sendContactNotificationEmail({
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
      message: message.trim(),
    }).catch((err) =>
      console.error("Failed to send contact notification email:", err)
    )

    return { error: null }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Something went wrong." }
  }
}