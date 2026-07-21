//app/about/page.tsx

import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import { CTA } from "@/components/cta"
import Image from "next/image"
import { Droplet, Leaf, Heart, Sparkles } from "lucide-react"

const milks = [
  {
    name: "Oat Milk",
    tagline: "Creamy & Naturally Sweet",
    description: "Our oat milk is crafted to be perfectly creamy with a natural sweetness. It's the ideal choice for your morning coffee, smoothies, or baking. Rich in fiber and beta-glucans, it's as nutritious as it is delicious. Isn't made with locally grown oats (yet) — but it is Organic.",
    highlights: ["Perfect for coffee", "Naturally creamy", "Rich in fiber"],
    sizes: [
      { size: "16oz", price: "$12" },
      { size: "32oz", price: "$18" },
    ],
  },
  {
    name: "Almond Milk",
    tagline: "Light & Nutty",
    description: "Our classic almond milk offers a light, refreshing taste with subtle nutty undertones. Made from carefully selected almonds, it's lower in calories and perfect for those seeking a lighter option. Great on its own, in cereal, or as a dairy-free cooking base.",
    note: "Contains nuts.",
    highlights: ["Lower in calories", "Subtle flavor", "Versatile use"],
    sizes: [
      { size: "16oz", price: "$12" },
      { size: "32oz", price: "$18" },
    ],
  },
  {
    name: "Hemp Seed Milk",
    tagline: "Nutritious & Earthy",
    description: "Our hemp seed milk is a nutritional powerhouse, packed with omega-3 and omega-6 fatty acids, plus all essential amino acids. With its earthy, wholesome flavor, it's perfect for health enthusiasts looking to add more plant-based nutrition to their diet.",
    highlights: ["Omega fatty acids", "Complete protein", "Heart-healthy"],
    sizes: [
      { size: "16oz", price: "$12" },
      { size: "32oz", price: "$18" },
    ],
  },
  {
    name: "Cashew Milk",
    tagline: "Rich & Velvety Smooth",
    description: "Our cashew milk is rich and velvety smooth, with a naturally buttery flavor. It's a wonderful choice for lattes, soups, and creamy sauces where you want a little extra body.",
    note: "Contains nuts.",
    highlights: ["Naturally buttery", "Velvety texture", "Great in lattes"],
    sizes: [
      { size: "16oz", price: "$12" },
      { size: "32oz", price: "$18" },
    ],
  },
]

export default function AboutPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        {/* Hero Section */}
        <section className="bg-secondary py-16 md:py-24">
          <div className="mx-auto max-w-6xl px-4 md:px-6">
            <div className="mx-auto max-w-3xl text-center">
              <p className="mb-4 text-sm uppercase tracking-[0.25em] text-sage">
                Our Story
              </p>
              <h1 className="font-serif text-4xl font-medium tracking-tight text-foreground md:text-5xl">
                Meet the Milk Maid
              </h1>
            </div>
          </div>
        </section>

        {/* About Me - Full Story */}
        <section className="bg-background py-16 md:py-24">
          <div className="mx-auto max-w-6xl px-4 md:px-6">
            <div className="grid items-start gap-12 lg:grid-cols-5 lg:gap-16">
              {/* Image column */}
              <div className="lg:col-span-2">
                <div className="sticky top-8">
                  <div className="relative">
                    <div className="relative aspect-3/4 overflow-hidden rounded-sm">
                      <Image
                        src="/images/emily.jpg"
                        alt="Emily Russell, founder of Modern Milk Maid"
                        fill
                        className="object-cover object-[center_22%]"
                      />
                    </div>
                    <div className="absolute -bottom-4 -left-4 -z-10 h-full w-full rounded-sm border border-sage/30" />
                  </div>
                  <div className="mt-8 flex flex-wrap gap-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sage/10">
                        <Leaf className="h-4 w-4 text-sage" />
                      </div>
                      <span>100% Plant-Based</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue/10">
                        <Droplet className="h-4 w-4 text-blue" />
                      </div>
                      <span>Made Fresh Daily</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sage/10">
                        <Heart className="h-4 w-4 text-sage" />
                      </div>
                      <span>Organic Ingredients</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Text column */}
              <div className="lg:col-span-3">
                <p className="text-lg font-medium leading-relaxed text-foreground">
                  I started Modern Milk Maid from a simple belief: fresh, organic plant-based milk should be easy to access, thoughtfully made, and better for both our bodies and the planet.
                </p>
                
                <div className="mt-8 space-y-6 text-muted-foreground leading-relaxed">
                  <p>
                    {"My name is Emily Russell, and I'm a graduate of Farmingdale State College with a degree in Health Promotion & Wellness. I've always had a deep interest in health, nutrition, and athletics, and I prioritize making daily choices that support overall well-being."}
                  </p>
                  <p>
                    {"For years, I've been making plant-based milk for myself and my family as a way to avoid harmful additives commonly found in many store-bought options, including emulsifiers, added sugars, gums, and oils. What began as a personal practice naturally grew into something I wanted to share with my community."}
                  </p>
                  <p>
                    {"Modern Milk Maid is a small, local delivery service serving the North Fork of Long Island. I'm inspired by the nostalgia and charm of the traditional milkman\u2014the idea of reliable, personal delivery, and a familiar face you can trust. I aim to bring that feeling back in a modern, plant-based way. Every batch of milk is made fresh the day of delivery using organic ingredients and simple, time-honored methods."}
                  </p>
                  <p>
                    {"I handle every order with care, from small-batch production to direct communication and local delivery. I also use reusable glass mason jars to reduce waste and support a more sustainable way of enjoying everyday staples. For customers who don't have a use for their empty jars, I offer a bottle collection service. Collected jars are carefully sanitized and reused to keep the process as low-waste and circular as possible."}
                  </p>
                  <p>
                    Modern Milk Maid currently delivers to the North Fork, with hopes to expand across Long Island over time. Above all, my goal is to build genuine relationships with my customers and provide a service that fits seamlessly into everyday life.
                  </p>
                </div>

                <p className="mt-8 font-serif text-xl italic text-sage">
                  Freshly made. Thoughtfully delivered. Sustainably served.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* The Milks */}
        <section className="bg-secondary py-16 md:py-24">
          <div className="mx-auto max-w-6xl px-4 md:px-6">
            <div className="mx-auto max-w-2xl text-center">
              <p className="mb-4 text-sm uppercase tracking-[0.25em] text-sage">
                Our Products
              </p>
              <h2 className="font-serif text-3xl font-medium tracking-tight text-foreground md:text-4xl">
                Meet the Milks
              </h2>
              <p className="mt-4 text-muted-foreground">
                Each variety is crafted with care using simple, quality ingredients
              </p>
            </div>

            {/* Decorative illustration — cap width to the container so it never
                exceeds the viewport (h-64 w-auto forced a ~640px width that
                overflowed on phones and caused sideways page scroll). */}
            <div className="mt-10 flex justify-center">
              <Image
                src="/images/big-jars.jpg"
                alt="Mason jar illustration"
                width={1000}
                height={400}
                className="h-auto w-full max-w-2xl object-contain opacity-80"
              />
            </div>

            <div className="mt-10 grid gap-8 sm:grid-cols-2">
              {milks.map((milk) => (
                <div
                  key={milk.name}
                  className="rounded-lg border border-border/50 bg-background p-8 transition-all hover:-translate-y-1 hover:shadow-lg"
                >
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-sage/10">
                    <Droplet className="h-6 w-6 text-sage" />
                  </div>
                  <h3 className="font-serif text-2xl font-medium text-foreground">
                    {milk.name}
                  </h3>
                  <p className="mt-1 text-sm font-medium text-sage">
                    {milk.tagline}
                  </p>
                  <p className="mt-4 text-sm text-muted-foreground leading-relaxed">
                    {milk.description}
                  </p>
                  {milk.note && (
                    <p className="mt-1 text-xs italic text-muted-foreground/70">
                      {milk.note}
                    </p>
                  )}
                  <ul className="mt-6 space-y-2">
                    {milk.highlights.map((highlight) => (
                      <li key={highlight} className="flex items-center gap-2 text-sm text-muted-foreground">
                        <div className="h-1.5 w-1.5 rounded-full bg-sage" />
                        {highlight}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-6 border-t border-border/50 pt-4">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Sizes & Pricing
                    </p>
                    <div className="mt-2 space-y-1">
                      {milk.sizes.map((size) => (
                        <p key={size.size} className="text-sm text-sage">
                          {size.size} - <span className="text-muted-foreground">{size.price}</span>
                        </p>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Values */}
        <section className="bg-background py-16 md:py-24">
          <div className="mx-auto max-w-6xl px-4 md:px-6">
            <div className="mx-auto max-w-2xl text-center">
              <p className="mb-4 text-sm uppercase tracking-[0.25em] text-blue">
                What We Stand For
              </p>
              <h2 className="font-serif text-3xl font-medium tracking-tight text-foreground md:text-4xl">
                Our Values
              </h2>
            </div>

            <div className="mt-12 grid gap-8 md:grid-cols-3">
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-sage/10">
                  <Leaf className="h-8 w-8 text-sage" />
                </div>
                <h3 className="font-serif text-xl font-medium text-foreground">Sustainability</h3>
                <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                  I use reusable glass mason jars to reduce waste. For customers who return their empty jars, I carefully sanitize and reuse them to keep the process as low-waste and circular as possible.
                </p>
              </div>
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue/10">
                  <Heart className="h-8 w-8 text-blue" />
                </div>
                <h3 className="font-serif text-xl font-medium text-foreground">Community</h3>
                <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                  I handle every order with care, from small-batch production to direct communication and local delivery. My goal is to build genuine relationships with my customers.
                </p>
              </div>
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-sage/10">
                  <Sparkles className="h-8 w-8 text-sage" />
                </div>
                <h3 className="font-serif text-xl font-medium text-foreground">Quality</h3>
                <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                  Every batch is made fresh the day of delivery using organic ingredients and simple, time-honored methods. Freshly made. Thoughtfully delivered. Sustainably served.
                </p>
              </div>
            </div>
          </div>
        </section>

        <CTA />
      </main>
      <Footer />
    </div>
  )
}