//components/how-it-works.tsx

import Image from "next/image"

const steps = [
  {
    number: "01",
    title: "Choose Your Milks",
    description: "Select from oat, almond, or hemp seed milk in 16oz or 32oz jars.",
  },
  {
    number: "02",
    title: "Pick Your Day",
    description: "Choose your preferred weekly delivery day that works for your schedule.",
  },
  {
    number: "03",
    title: "Enjoy Weekly",
    description: "Fresh milk arrives at your door. Return empty jars for reuse.",
  },
]

export function HowItWorks() {
  return (
    <section id="how-it-works" className="bg-secondary py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          {/* Image */}
          <div className="relative">
            <div className="relative aspect-square overflow-hidden rounded-sm">
              <Image
                src="/images/almond-milk.jpg"
                alt="Mason jars of fresh almond milk"
                fill
                className="object-cover"
              />
            </div>
          </div>

          {/* Content */}
          <div>
            <p className="mb-4 text-sm uppercase tracking-[0.25em] text-sage">
              Simple Process
            </p>
            <h2 className="font-serif text-3xl font-medium tracking-tight text-foreground md:text-4xl lg:text-5xl">
              How It Works
            </h2>
            <p className="mt-4 text-muted-foreground">
              Getting fresh, local non-dairy milk has never been easier.
            </p>

            <div className="mt-10 space-y-8">
              {steps.map((step) => (
                <div key={step.number} className="flex gap-6">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-foreground/10 bg-background">
                    <span className="font-serif text-lg font-medium text-foreground">{step.number}</span>
                  </div>
                  <div>
                    <h3 className="font-serif text-xl font-medium text-foreground">
                      {step.title}
                    </h3>
                    <p className="mt-1 text-muted-foreground leading-relaxed">
                      {step.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
