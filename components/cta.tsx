//components/cta.tsx

import Link from "next/link"
import { Button } from "@/components/ui/button"

export function CTA() {
  return (
    <section className="bg-sage py-16 md:py-20">
      <div className="mx-auto max-w-6xl px-4 text-center md:px-6">
        <h2 className="font-serif text-3xl font-medium tracking-tight text-sage-foreground md:text-4xl">
          Ready to Try Fresh, Local Milk?
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-sage-foreground/80">
          Join our North Fork community and enjoy fresh plant-based milk delivered to your door every week.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Button size="lg" asChild className="bg-foreground px-8 text-background hover:bg-foreground/90">
            <Link href="/subscribe">Start Your Subscription</Link>
          </Button>
          <Button size="lg" variant="outline" asChild className="border-sage-foreground/30 bg-transparent px-8 text-sage-foreground hover:bg-sage-foreground/10">
            <Link href="/shop">Shop One-Time</Link>
          </Button>
        </div>
      </div>
    </section>
  )
}