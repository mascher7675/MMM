//components/why-non-dairy.tsx

import Image from "next/image"
import { Leaf, Droplets, Heart, Recycle } from "lucide-react"

const benefits = [
  {
    icon: Leaf,
    title: "Gentle on Digestion",
    description: "Naturally lactose-free, perfect for sensitive stomachs.",
  },
  {
    icon: Droplets,
    title: "Lower Environmental Impact",
    description: "Plant-based milks require less water and produce fewer emissions.",
  },
  {
    icon: Heart,
    title: "Heart-Healthy",
    description: "Naturally cholesterol-free and part of a healthy diet.",
  },
  {
    icon: Recycle,
    title: "Zero Waste",
    description: "Reusable glass jars mean no single-use plastic.",
  },
]

export function WhyNonDairy() {
  return (
    <section id="why-non-dairy" className="bg-foreground py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          {/* Content */}
          <div>
            <p className="mb-4 text-sm uppercase tracking-[0.25em] text-sage">
              Better For You & The Planet
            </p>
            <h2 className="font-serif text-3xl font-medium tracking-tight text-background md:text-4xl lg:text-5xl">
              Why Choose Non-Dairy?
            </h2>
            <p className="mt-4 text-background/70">
              More people are making the switch to plant-based. Here is why.
            </p>

            <div className="mt-10 grid gap-6 sm:grid-cols-2">
              {benefits.map((benefit) => (
                <div key={benefit.title} className="flex gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sage/20">
                    <benefit.icon className="h-5 w-5 text-sage" />
                  </div>
                  <div>
                    <h3 className="font-medium text-background">
                      {benefit.title}
                    </h3>
                    <p className="mt-1 text-sm text-background/60 leading-relaxed">
                      {benefit.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Image */}
          <div className="relative">
            <div className="relative aspect-3/4 overflow-hidden rounded-sm">
              <Image
                src="/images/closeup-emilywithjar.jpg"
                alt="Handcrafted hemp seed milk in a mason jar"
                fill
                className="object-cover"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
