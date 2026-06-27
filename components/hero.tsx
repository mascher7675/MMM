//components/hero.tsx
 
import Link from "next/link"
import Image from "next/image"
import { Button } from "@/components/ui/button"
 
export function Hero() {
  return (
    <section className="relative overflow-hidden bg-background">
      <div className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-24">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          {/* Text Content */}
          <div className="order-2 lg:order-1">
            <p className="mb-4 text-sm uppercase tracking-[0.25em] text-sage">
              North Fork, Long Island
            </p>
            
            <h1 className="font-serif text-4xl font-medium leading-tight tracking-tight text-foreground md:text-5xl lg:text-6xl">
              Fresh Plant-Based Milk,{" "}
              <span className="italic">Delivered</span>
            </h1>
            
            <p className="mt-6 max-w-lg text-lg leading-relaxed text-muted-foreground">
              Handcrafted oat, almond, hemp seed, and cashew milk made fresh weekly and delivered 
              right to your door in reusable glass jars. Simple. Sustainable. Delicious.
            </p>
            
            <div className="mt-10 flex flex-col gap-4 sm:flex-row">
              <Button size="lg" asChild className="bg-foreground px-8 text-background hover:bg-foreground/90">
                <Link href="/subscribe">Start Your Subscription</Link>
              </Button>
              <Button size="lg" variant="outline" asChild className="border-foreground/20 bg-transparent px-8">
                <Link href="/shop">Shop One-Time</Link>
              </Button>
            </div>
            
            <div className="mt-12 flex items-center gap-8 border-t border-border/50 pt-8">
              <div>
                <p className="font-serif text-2xl font-medium text-foreground">4</p>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Milk Varieties</p>
              </div>
              <div className="h-8 w-px bg-border" />
              <div>
                <p className="font-serif text-2xl font-medium text-foreground">2</p>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Jar Sizes</p>
              </div>
              <div className="h-8 w-px bg-border" />
              <div>
                <p className="font-serif text-2xl font-medium text-foreground">Weekly</p>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Delivery</p>
              </div>
            </div>
          </div>
 
          {/* Image */}
          <div className="order-1 lg:order-2">
            <div className="relative">
              <div className="relative aspect-4/5 overflow-hidden rounded-sm">
                <Image
                  src="/images/2jars-home.jpg"
                  alt="Fresh non-dairy milk in mason jars"
                  fill
                  className="object-cover"
                  priority
                  loading="eager"
                />
              </div>
              {/* Decorative element */}
              <div className="absolute -bottom-4 -left-4 -z-10 h-full w-full rounded-sm border border-sage/30" />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}