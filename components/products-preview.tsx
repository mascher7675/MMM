//components/products-preview.tsx
 
import Link from "next/link"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { ArrowRight } from "lucide-react"
 
const milks = [
  {
    name: "Oat Milk",
    description: "Creamy & naturally sweet",
    image: "/images/2jars-home.jpg",
    price: "From $12",
  },
  {
    name: "Almond Milk",
    description: "Light & nutty",
    image: "/images/almond-milk.jpg",
    price: "From $12",
  },
  {
    name: "Hemp Seed Milk",
    description: "Nutritious & earthy",
    image: "/images/closeup-emilywithjar.jpg",
    price: "From $12",
  },
  {
    name: "Cashew Milk",
    description: "Rich & velvety smooth",
    image: "/images/closeup-emilywithjar.jpg",
    price: "From $12",
  },
]
 
export function ProductsPreview() {
  return (
    <section className="bg-background py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="mb-2 text-sm uppercase tracking-[0.25em] text-sage">
              Our Products
            </p>
            <h2 className="font-serif text-3xl font-medium tracking-tight text-foreground md:text-4xl">
              Fresh Plant-Based Milks
            </h2>
            <p className="mt-2 max-w-lg text-muted-foreground">
              Handcrafted weekly in small batches using simple, quality ingredients.
            </p>
          </div>
          <Button variant="link" asChild className="gap-2 px-0 text-foreground">
            <Link href="/subscribe">
              View all products <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
 
        <div className="mt-12 grid gap-6 sm:grid-cols-2 md:grid-cols-4">
          {milks.map((milk) => (
            <Link
              key={milk.name}
              href="/subscribe"
              className="group block overflow-hidden rounded-lg border border-border/50 bg-card transition-all hover:border-sage/30 hover:shadow-lg"
            >
              <div className="relative aspect-4/3 overflow-hidden">
                <Image
                  src={milk.image || "/placeholder.svg"}
                  alt={milk.name}
                  fill
                  className="object-cover transition-transform duration-500 group-hover:scale-105"
                />
              </div>
              <div className="p-5">
                <h3 className="font-serif text-xl font-medium text-foreground">
                  {milk.name}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {milk.description}
                </p>
                <p className="mt-3 text-sm font-medium">
                  <span className="text-sage">{milk.price}</span>
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}