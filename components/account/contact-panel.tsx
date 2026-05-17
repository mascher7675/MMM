//components/account/contact-panel.tsx

"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { CheckCircle, Loader2, MessageSquare } from "lucide-react"
import { sendMessage } from "@/app/actions/messages"

interface ContactPanelProps {
  userId: string
  subscriptionId?: string | null
}

export function ContactPanel({ userId, subscriptionId }: ContactPanelProps) {
  const [isSending, setIsSending] = useState(false)
  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSend() {
    if (!body.trim()) return
    setIsSending(true)
    setError(null)

    const result = await sendMessage({
      type: "contact",
      subject: subject.trim() || "Customer Message",
      body: body.trim(),
      subscriptionId: subscriptionId ?? undefined,
    })

    setIsSending(false)

    if (result.error) {
      setError(result.error)
    } else {
      setSuccess(true)
      setSubject("")
      setBody("")
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {success ? (
        <div className="flex flex-col items-center py-8 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-sage/10">
            <CheckCircle className="h-7 w-7 text-sage" />
          </div>
          <h3 className="mb-1 font-serif text-lg font-medium text-foreground">
            Message sent.
          </h3>
          <p className="mb-6 max-w-xs text-sm text-muted-foreground">
            We'll get back to you soon!
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSuccess(false)}
          >
            Send another message
          </Button>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Questions about your order, delivery, or anything else? We're here to help.
          </p>
          <div className="space-y-3">
            <Input
              placeholder="Subject (optional)"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
            <Textarea
              placeholder="Your message..."
              rows={4}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
            <Button
              onClick={handleSend}
              disabled={isSending || !body.trim()}
              className="w-full gap-2"
            >
              {isSending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <MessageSquare className="h-4 w-4" />
              )}
              {isSending ? "Sending…" : "Send Message"}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}