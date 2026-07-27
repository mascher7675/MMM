// components/cash-customer-banner.tsx

import { Banknote, MessageCircle, Phone, MessageSquare } from "lucide-react"
import Link from "next/link"

export function CashCustomerBanner() {
  return (
    <div className="mx-auto mt-12 max-w-2xl">
      <div className="flex flex-col gap-4 rounded-xl border border-sage/30 bg-sage/10 px-6 py-6 sm:flex-row sm:items-start sm:gap-5 sm:px-8 sm:py-7">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-sage/20">
          <Banknote className="h-6 w-6 text-sage" />
        </div>
        <div className="flex-1">
          <p className="text-base font-semibold text-foreground">Prefer to pay with cash?</p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            We happily work with cash customers — no card needed. For the fastest response, text or call us and we&apos;ll get you set up on our route.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <a
              href="sms:+16316569549"
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
            >
              <MessageCircle className="h-4 w-4" />
              Text Us
            </a>
            <a
              href="tel:+16316569549"
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
            >
              <Phone className="h-4 w-4" />
              Call: (631) 656-9549
            </a>
            <Link
              href="/#contact"
              className="inline-flex items-center gap-2 rounded-lg border border-sage/40 bg-sage/15 px-4 py-2 text-sm font-medium text-sage transition-colors hover:bg-sage/25"
            >
              <MessageSquare className="h-4 w-4" />
              Send a Message
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}