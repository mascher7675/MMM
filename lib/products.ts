//lib/products.ts

export interface Product {
  id: string
  name: string
  milkType: "oat" | "almond" | "hemp" | "cashew"
  size: "16oz" | "32oz"
  description: string
  ingredients: string[]
  priceInCents: number
  subscriptionPriceInCents: number
  image: string
}

// ---------------------------------------------------------------------------
// Source of truth for all products.
//
// WEEKLY BILLING MODEL:
//   priceInCents             = one-time order price per bottle
//   subscriptionPriceInCents = weekly subscription price per bottle (charged every week)
//
// Previous model billed $48/month (4 deliveries × $12).
// Weekly model bills $12/week — same per-delivery cost, just charged weekly.
//
// If you want to offer a subscriber discount, lower subscriptionPriceInCents
// below priceInCents (e.g. $11/week instead of $12/week for 16oz).
// ---------------------------------------------------------------------------
export const PRODUCTS: Product[] = [
  {
    id: "oat-16oz",
    name: "Oat Milk - 16oz",
    milkType: "oat",
    size: "16oz",
    description: "Creamy and naturally sweet, perfect for coffee, cereal, and baking.",
    ingredients: ["Organic Oats", "Filtered Water", "Organic Dates", "Homemade Vanilla Extract", "Salt"],
    priceInCents: 1200,              // $12.00 one-time
    subscriptionPriceInCents: 1200,  // $12.00/week
    image: "/images/2jars-home.jpg",
  },
  {
    id: "oat-32oz",
    name: "Oat Milk - 32oz",
    milkType: "oat",
    size: "32oz",
    description: "Creamy and naturally sweet, perfect for coffee, cereal, and baking.",
    ingredients: ["Organic Oats", "Filtered Water", "Organic Dates", "Homemade Vanilla Extract", "Salt"],
    priceInCents: 1800,              // $18.00 one-time
    subscriptionPriceInCents: 1800,  // $18.00/week
    image: "/images/2jars-home.jpg",
  },
  {
    id: "almond-16oz",
    name: "Almond Milk - 16oz",
    milkType: "almond",
    size: "16oz",
    description: "Light and refreshing with subtle nutty undertones. Great for smoothies.",
    ingredients: ["Organic Almonds", "Filtered Water", "Organic Dates", "Homemade Vanilla Extract", "Salt"],
    priceInCents: 1200,
    subscriptionPriceInCents: 1200,
    image: "/images/almond-milk.jpg",
  },
  {
    id: "almond-32oz",
    name: "Almond Milk - 32oz",
    milkType: "almond",
    size: "32oz",
    description: "Light and refreshing with subtle nutty undertones. Great for smoothies.",
    ingredients: ["Organic Almonds", "Filtered Water", "Organic Dates", "Homemade Vanilla Extract", "Salt"],
    priceInCents: 1800,
    subscriptionPriceInCents: 1800,
    image: "/images/almond-milk.jpg",
  },
  {
    id: "hemp-16oz",
    name: "Hemp Seed Milk - 16oz",
    milkType: "hemp",
    size: "16oz",
    description: "Nutritious and earthy, packed with omega fatty acids and protein.",
    ingredients: ["Organic Hemp Seeds", "Filtered Water", "Organic Dates", "Homemade Vanilla Extract", "Salt"],
    priceInCents: 1200,
    subscriptionPriceInCents: 1200,
    image: "/images/closeup-emilywithjar.jpg",
  },
  {
    id: "hemp-32oz",
    name: "Hemp Seed Milk - 32oz",
    milkType: "hemp",
    size: "32oz",
    description: "Nutritious and earthy, packed with omega fatty acids and protein.",
    ingredients: ["Organic Hemp Seeds", "Filtered Water", "Organic Dates", "Homemade Vanilla Extract", "Salt"],
    priceInCents: 1800,
    subscriptionPriceInCents: 1800,
    image: "/images/closeup-emilywithjar.jpg",
  },
  {
    id: "cashew-16oz",
    name: "Cashew Milk - 16oz",
    milkType: "cashew",
    size: "16oz",
    description: "Rich and velvety smooth with a naturally buttery flavor. Perfect for lattes and soups.",
    ingredients: ["Organic Cashews", "Filtered Water", "Organic Dates", "Homemade Vanilla Extract", "Salt"],
    priceInCents: 1200,
    subscriptionPriceInCents: 1200,
    image: "/images/2jars-home.jpg",
  },
  {
    id: "cashew-32oz",
    name: "Cashew Milk - 32oz",
    milkType: "cashew",
    size: "32oz",
    description: "Rich and velvety smooth with a naturally buttery flavor. Perfect for lattes and soups.",
    ingredients: ["Organic Cashews", "Filtered Water", "Organic Dates", "Homemade Vanilla Extract", "Salt"],
    priceInCents: 1800,
    subscriptionPriceInCents: 1800,
    image: "/images/2jars-home.jpg",
  },
]

export function getProduct(id: string): Product | undefined {
  return PRODUCTS.find((p) => p.id === id)
}

export function getProductsByMilkType(milkType: string): Product[] {
  return PRODUCTS.filter((p) => p.milkType === milkType)
}

// ---------------------------------------------------------------------------
// normalizeProductName
// ---------------------------------------------------------------------------
export function normalizeProductName(rawName: string | null | undefined, size: string): string {
  if (!rawName) return `Unknown - ${size}`
  const n = rawName.toLowerCase()

  let milkType: Product["milkType"] | null = null
  if (n.includes("oat"))           milkType = "oat"
  else if (n.includes("almond"))   milkType = "almond"
  else if (n.includes("hemp"))     milkType = "hemp"
  else if (n.includes("cashew"))   milkType = "cashew"

  if (!milkType) return rawName

  const product = PRODUCTS.find((p) => p.milkType === milkType && p.size === size)
  return product?.name ?? rawName
}

// ---------------------------------------------------------------------------
// PRODUCT_OPTIONS — for admin UI selects
// ---------------------------------------------------------------------------
export const PRODUCT_OPTIONS = PRODUCTS.map((p) => ({
  value: p.id,
  label: p.name,
  name: p.name,
  size: p.size,
}))