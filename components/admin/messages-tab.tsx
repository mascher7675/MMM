// components/admin/messages-tab.tsx
"use client"

import { useState, useTransition } from "react"
import { ChevronDown, ChevronUp, Mail, Phone, ChevronLeft, ChevronRight, ShoppingBag } from "lucide-react"
import { updateMessageStatus } from "@/app/actions/admin"
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
            className={`relative rounded-full px-3 py-1 text-xs font-medium transition-colors ${
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
              className="flex w-full items-center gap-4 p-4 text-left hover:bg-secondary/30 transition-colors"
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

                {/* Refund request: link to the order in Orders tab */}
                {isRefundRequest && msg.order_id && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-800 dark:bg-amber-950/30">
                    <p className="text-xs font-medium text-amber-800 dark:text-amber-300">
                      To process this refund, go to the <strong>Orders</strong> tab, find this order, and use the Cancel &amp; Refund button.
                    </p>
                    <p className="mt-0.5 text-[10px] text-amber-600 dark:text-amber-500 font-mono">
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
                  {msg.status !== "read" && (
                    <button onClick={() => startTransition(() => { void updateMessageStatus(msg.id, "read") })}
                      className="rounded-md border border-border bg-card px-3 py-1 text-xs hover:bg-secondary transition-colors">
                      Mark Read
                    </button>
                  )}
                  {msg.status !== "resolved" && (
                    <button onClick={() => startTransition(() => { void updateMessageStatus(msg.id, "resolved") })}
                      className="rounded-md bg-[#7C9885] px-3 py-1 text-xs font-medium text-white hover:bg-[#6a8673] transition-colors">
                      ✓ Resolve
                    </button>
                  )}
                  {msg.status === "resolved" && (
                    <button onClick={() => startTransition(() => { void updateMessageStatus(msg.id, "unread") })}
                      className="rounded-md border border-border bg-card px-3 py-1 text-xs hover:bg-secondary transition-colors">
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
            className="flex items-center gap-1 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary disabled:opacity-40"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Prev
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              onClick={() => setPage(n)}
              className={`h-8 min-w-8 rounded-md border px-2 text-xs font-medium transition-colors ${
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
            className="flex items-center gap-1 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary disabled:opacity-40"
          >
            Next <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}