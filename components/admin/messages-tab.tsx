// components/admin/messages-tab.tsx
"use client"

import { useState, useTransition } from "react"
import { ChevronDown, ChevronUp, Mail, Phone, ChevronLeft, ChevronRight, ShoppingBag, XCircle, Check, RefreshCw, Ban } from "lucide-react"
import { updateMessageStatus, cancelAndRefundOrder, declineRefundRequest } from "@/app/actions/admin"
import { fmtDate, STATUS_COLORS, MSG_TYPE_LABEL } from "./admin-types"
import type { AdminMessage } from "@/app/actions/admin"

interface Props {
  messages: AdminMessage[]
}

const PAGE_SIZE = 15

// Homepage messages have no user_id (sent before creating an account)
const isHomepageMessage = (msg: AdminMessage) => !msg.user_id

export function MessagesTab({ messages }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [, startTransition] = useTransition()
  const [filter, setFilter] = useState("all")
  const [page, setPage] = useState(1)

  // Direct Cancel & Refund state, keyed by order_id (so it matches even if
  // the same order somehow shows up on more than one message)
  const [cancelConfirm, setCancelConfirm] = useState<Set<string>>(new Set())
  const [cancelLoading, setCancelLoading] = useState<Set<string>>(new Set())
  const [cancelResult, setCancelResult] = useState<Record<string, { refunded: boolean; error: string | null }>>({})

  // Decline flow state, also keyed by order_id
  const [declineOpen, setDeclineOpen] = useState<Set<string>>(new Set())
  const [declineReason, setDeclineReason] = useState<Record<string, string>>({})
  const [declineLoading, setDeclineLoading] = useState<Set<string>>(new Set())
  const [declineResult, setDeclineResult] = useState<Record<string, { error: string | null }>>({})

  const requestCancelConfirm = (orderId: string) => {
    const next = new Set(cancelConfirm); next.add(orderId); setCancelConfirm(next)
  }
  const dismissCancelConfirm = (orderId: string) => {
    const next = new Set(cancelConfirm); next.delete(orderId); setCancelConfirm(next)
  }

  const handleCancelAndRefund = async (orderId: string, messageId: string) => {
    const loading = new Set(cancelLoading); loading.add(orderId); setCancelLoading(loading)
    const confirm = new Set(cancelConfirm); confirm.delete(orderId); setCancelConfirm(confirm)
    const result = await cancelAndRefundOrder(orderId)
    const done = new Set(cancelLoading); done.delete(orderId); setCancelLoading(done)
    setCancelResult((prev) => ({ ...prev, [orderId]: { refunded: result.refunded, error: result.error } }))
    // On success, auto-resolve the message too — one less click
    if (!result.error) {
      startTransition(() => { void updateMessageStatus(messageId, "resolved") })
    }
  }

  const openDecline = (orderId: string) => {
    const next = new Set(declineOpen); next.add(orderId); setDeclineOpen(next)
  }
  const dismissDecline = (orderId: string) => {
    const next = new Set(declineOpen); next.delete(orderId); setDeclineOpen(next)
  }

  const handleDecline = async (orderId: string, messageId: string) => {
    const loading = new Set(declineLoading); loading.add(orderId); setDeclineLoading(loading)
    const open = new Set(declineOpen); open.delete(orderId); setDeclineOpen(open)
    const result = await declineRefundRequest(orderId, messageId, declineReason[orderId] ?? "")
    const done = new Set(declineLoading); done.delete(orderId); setDeclineLoading(done)
    setDeclineResult((prev) => ({ ...prev, [orderId]: { error: result.error } }))
    // declineRefundRequest already resolves the message server-side on success,
    // no separate updateMessageStatus call needed here.
  }

  const toggle = (id: string) => {
    const next = new Set(expanded)
    next.has(id) ? next.delete(id) : next.add(id)
    setExpanded(next)
  }

  const filtered = filter === "all" ? messages : messages.filter(m => m.status === filter || m.type === filter)

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const changeFilter = (f: string) => { setFilter(f); setPage(1) }

  // Count unresolved refund requests for the badge
  const unresolvedRefunds = messages.filter(m => m.type === "refund_request" && m.status !== "resolved").length

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {["all", "unread", "read", "resolved", "contact", "pause_request", "cancel_request", "refund_request"].map(f => (
          <button
            key={f}
            onClick={() => changeFilter(f)}
            className={`relative cursor-pointer rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              filter === f ? "bg-[#7C9885] text-white" : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
          >
            {f === "pause_request"  ? "Pause" :
             f === "cancel_request" ? "Cancel" :
             f === "refund_request" ? "Refund" :
             f.charAt(0).toUpperCase() + f.slice(1)}
            {/* Badge for unresolved refund requests */}
            {f === "refund_request" && unresolvedRefunds > 0 && filter !== "refund_request" && (
              <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
                {unresolvedRefunds}
              </span>
            )}
          </button>
        ))}
        <span className="ml-auto text-sm text-muted-foreground">{filtered.length} messages</span>
      </div>

      {filtered.length === 0 && (
        <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">All clear!</div>
      )}

      {paginated.map((msg) => {
        const isOpen = expanded.has(msg.id)
        const fromHomepage = isHomepageMessage(msg)
        const isContactType = msg.type === "contact"
        const isRefundRequest = msg.type === "refund_request"
        return (
          <div
            key={msg.id}
            className={`overflow-hidden rounded-lg border bg-card ${
              isRefundRequest && msg.status === "unread"
                ? "border-red-200 dark:border-red-800"
                : "border-border"
            }`}
          >
            <button
              onClick={() => {
                toggle(msg.id)
                if (!expanded.has(msg.id) && msg.status === "unread") {
                  startTransition(() => { void updateMessageStatus(msg.id, "read") })
                }
              }}
              className="flex w-full cursor-pointer items-center gap-4 p-4 text-left hover:bg-secondary/30 transition-colors"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{msg.customer_name || msg.customer_email || "Unknown"}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_COLORS[msg.status] ?? "bg-secondary"}`}>{msg.status}</span>
                  {/* Show type badge only for non-contact types */}
                  {!isContactType && (
                    <span className={`rounded-full px-2 py-0.5 text-[10px] text-muted-foreground ${
                      isRefundRequest ? "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400" : "bg-secondary"
                    }`}>
                      {MSG_TYPE_LABEL[msg.type] ?? msg.type}
                    </span>
                  )}
                  {/* Source badge: only show for contact messages */}
                  {isContactType && (
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {fromHomepage ? "Homepage" : "Account"}
                    </span>
                  )}
                  {/* Order badge for refund requests */}
                  {isRefundRequest && msg.order_id && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground">
                      <ShoppingBag className="h-2.5 w-2.5" />
                      Order linked
                    </span>
                  )}
                </div>
                <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                  {msg.subject && msg.subject !== "Customer Message" && msg.subject !== "Homepage Contact Form"
                    ? <><span className="font-medium text-foreground/60">{msg.subject}:</span> {msg.body}</>
                    : msg.body}
                </p>
              </div>
              <div className="flex items-center gap-2 text-right">
                <p className="text-xs text-muted-foreground">{fmtDate(msg.created_at)}</p>
                {isOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </div>
            </button>

            {isOpen && (
              <div className="border-t border-border bg-secondary/20 p-4 space-y-3">
                {/* Subject line if meaningful */}
                {msg.subject && msg.subject !== "Customer Message" && msg.subject !== "Homepage Contact Form" && (
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{msg.subject}</p>
                )}
                <p className="text-sm leading-relaxed whitespace-pre-line">{msg.body}</p>

                {/* Refund request: cancel & refund, or decline, directly from here */}
                {isRefundRequest && msg.order_id && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 dark:border-amber-800 dark:bg-amber-950/30 space-y-2">
                    {!cancelResult[msg.order_id] && !declineResult[msg.order_id] && (
                      <>
                        {/* Default: two action buttons, side by side */}
                        {!cancelConfirm.has(msg.order_id) &&
                          !cancelLoading.has(msg.order_id) &&
                          !declineOpen.has(msg.order_id) &&
                          !declineLoading.has(msg.order_id) && (
                            <div className="flex flex-wrap gap-2">
                              <button
                                onClick={() => requestCancelConfirm(msg.order_id!)}
                                className="flex cursor-pointer items-center gap-1.5 rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 transition-colors hover:bg-amber-100 dark:border-amber-700 dark:bg-transparent dark:text-amber-200"
                              >
                                <XCircle className="h-3.5 w-3.5" />
                                Cancel & Refund This Order
                              </button>
                              <button
                                onClick={() => openDecline(msg.order_id!)}
                                className="flex cursor-pointer items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary"
                              >
                                <Ban className="h-3.5 w-3.5" />
                                Decline Request
                              </button>
                            </div>
                          )}

                        {/* Cancel & Refund: loading */}
                        {cancelLoading.has(msg.order_id) && (
                          <div className="flex items-center gap-2 text-xs text-amber-800 dark:text-amber-300">
                            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                            Cancelling & issuing refund…
                          </div>
                        )}

                        {/* Cancel & Refund: confirm step */}
                        {cancelConfirm.has(msg.order_id) && !cancelLoading.has(msg.order_id) && (
                          <div className="space-y-2">
                            <p className="text-xs font-medium text-amber-900 dark:text-amber-200">
                              Cancel this order and issue a full refund via Stripe? This also marks the message resolved.
                            </p>
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleCancelAndRefund(msg.order_id!, msg.id)}
                                style={{ backgroundColor: "#e05c6b", color: "#ffffff" }}
                                className="cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium transition-colors hover:opacity-90"
                              >
                                Yes, Cancel & Refund
                              </button>
                              <button
                                onClick={() => dismissCancelConfirm(msg.order_id!)}
                                className="cursor-pointer rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-secondary transition-colors"
                              >
                                Never mind
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Decline: loading */}
                        {declineLoading.has(msg.order_id) && (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                            Declining & notifying customer…
                          </div>
                        )}

                        {/* Decline: reason step */}
                        {declineOpen.has(msg.order_id) && !declineLoading.has(msg.order_id) && (
                          <div className="space-y-2">
                            <p className="text-xs font-medium text-foreground">
                              Decline this request? The order stays as-is — no refund is issued. The customer gets an email either way.
                            </p>
                            <textarea
                              value={declineReason[msg.order_id] ?? ""}
                              onChange={(e) =>
                                setDeclineReason((prev) => ({ ...prev, [msg.order_id!]: e.target.value }))
                              }
                              placeholder="Optional: reason for declining (included in the customer's email and saved to the order notes)…"
                              rows={2}
                              className="w-full resize-none rounded-md border border-border bg-background px-2.5 py-2 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#7C9885]/40"
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleDecline(msg.order_id!, msg.id)}
                                className="cursor-pointer rounded-md border border-border bg-foreground px-3 py-1.5 text-xs font-medium text-background transition-colors hover:opacity-90"
                              >
                                Yes, Decline Request
                              </button>
                              <button
                                onClick={() => dismissDecline(msg.order_id!)}
                                className="cursor-pointer rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-secondary transition-colors"
                              >
                                Never mind
                              </button>
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    {/* Cancel & Refund: success */}
                    {cancelResult[msg.order_id] && !cancelResult[msg.order_id].error && (
                      <div className="flex items-center gap-2 text-xs text-green-800 dark:text-green-300">
                        <Check className="h-3.5 w-3.5 shrink-0" />
                        {cancelResult[msg.order_id].refunded
                          ? "Order cancelled and refund issued via Stripe."
                          : "Order cancelled (no Stripe payment to refund)."}
                      </div>
                    )}
                    {cancelResult[msg.order_id]?.error && (
                      <div className="rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
                        Error: {cancelResult[msg.order_id].error}
                      </div>
                    )}

                    {/* Decline: success */}
                    {declineResult[msg.order_id] && !declineResult[msg.order_id].error && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Ban className="h-3.5 w-3.5 shrink-0" />
                        Request declined — customer notified by email, order unchanged.
                      </div>
                    )}
                    {declineResult[msg.order_id]?.error && (
                      <div className="rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
                        Error: {declineResult[msg.order_id].error}
                      </div>
                    )}

                    <p className="text-[10px] text-amber-600 dark:text-amber-500 font-mono">
                      Order ID: {msg.order_id}
                    </p>
                  </div>
                )}

                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {msg.customer_email && (
                    <p className="text-xs text-muted-foreground">
                      <Mail className="mr-1 inline h-3 w-3" />
                      <a href={`mailto:${msg.customer_email}`} className="hover:underline">{msg.customer_email}</a>
                    </p>
                  )}
                  {msg.phone && (
                    <p className="text-xs text-muted-foreground">
                      <Phone className="mr-1 inline h-3 w-3" />
                      <a href={`tel:${msg.phone}`} className="hover:underline">{msg.phone}</a>
                    </p>
                  )}
                </div>

                <div className="flex gap-2">
                  {msg.status !== "resolved" && (
                    <button
                      onClick={() => startTransition(() => { void updateMessageStatus(msg.id, "resolved") })}
                      className="cursor-pointer rounded-md bg-[#7C9885] px-3 py-1 text-xs font-medium text-white hover:bg-[#6a8673] transition-colors"
                    >
                      ✓ Resolve
                    </button>
                  )}
                  {msg.status === "resolved" && (
                    <button
                      onClick={() => startTransition(() => { void updateMessageStatus(msg.id, "read") })}
                      className="cursor-pointer rounded-md border border-border bg-card px-3 py-1 text-xs hover:bg-secondary transition-colors"
                    >
                      Reopen
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )
      })}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={safePage === 1}
            className="flex cursor-pointer items-center gap-1 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary disabled:opacity-40 disabled:cursor-default"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Prev
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              onClick={() => setPage(n)}
              className={`h-8 min-w-8 cursor-pointer rounded-md border px-2 text-xs font-medium transition-colors ${
                n === safePage
                  ? "border-[#7C9885] bg-[#7C9885] text-white"
                  : "border-border bg-card text-muted-foreground hover:bg-secondary"
              }`}
            >
              {n}
            </button>
          ))}
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={safePage === totalPages}
            className="flex cursor-pointer items-center gap-1 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary disabled:opacity-40 disabled:cursor-default"
          >
            Next <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}