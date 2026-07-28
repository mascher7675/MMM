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

    // Best-effort admin notification for homepage/guest contact submissions.
    // A failure here must NOT fail the submission — the message row is already
    // saved and visible in the admin Messages tab regardless. This mirrors the
    // logged-in contact path in app/actions/messages.ts, which was previously
    // the only path that emailed ADMIN_EMAIL. The notification is sent to
    // ADMIN_EMAIL (falling back to CONTACT_EMAIL, then info@modernmilkmaid.store)
    // with reply-to set to the sender, so replies go straight to the customer.
    try {
      await sendContactNotificationEmail({
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim() || "Not provided",
        message: message.trim(),
      })
    } catch (emailErr) {
      console.error("[sendContactMessage] Failed to send contact notification email:", emailErr)
    }

    return { error: null }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Something went wrong." }
  }
}