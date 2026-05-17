//lib/products.ts

export interface Product {
  id: string
  name: string
  milkType: "oat" | "almond" | "hemp"
  size: "16oz" | "32oz"
  description: string
  priceInCents: number
  subscriptionPriceInCents: number
  image: string
}

// Source of truth for all products
// Shop uses priceInCents, Subscribe uses subscriptionPriceInCents (10% off)
export const PRODUCTS: Product[] = [
  {
    id: "oat-16oz",
    name: "Oat Milk - 16oz",
    milkType: "oat",
    size: "16oz",
    description: "Creamy and naturally sweet, perfect for coffee, cereal, and baking.",
    priceInCents: 1200, // $12.00
    subscriptionPriceInCents: 4800, // $48.00
    image: "/images/2jars-home.jpg",
  },
  {
    id: "oat-32oz",
    name: "Oat Milk - 32oz",
    milkType: "oat",
    size: "32oz",
    description: "Creamy and naturally sweet, perfect for coffee, cereal, and baking.",
    priceInCents: 1800, // $18.00
    subscriptionPriceInCents: 7200, // $72.00
    image: "/images/2jars-home.jpg",
  },
  {
    id: "almond-16oz",
    name: "Almond Milk - 16oz",
    milkType: "almond",
    size: "16oz",
    description: "Light and refreshing with subtle nutty undertones. Great for smoothies.",
    priceInCents: 1200,
    subscriptionPriceInCents: 4800, // $48.00
    image: "/images/almond-milk.jpg",
  },
  {
    id: "almond-32oz",
    name: "Almond Milk - 32oz",
    milkType: "almond",
    size: "32oz",
    description: "Light and refreshing with subtle nutty undertones. Great for smoothies.",
    priceInCents: 1800,
    subscriptionPriceInCents: 7200, // $72.00
    image: "/images/almond-milk.jpg",
  },
  {
    id: "hemp-16oz",
    name: "Hemp Seed Milk - 16oz",
    milkType: "hemp",
    size: "16oz",
    description: "Nutritious and earthy, packed with omega fatty acids and protein.",
    priceInCents: 1200,
    subscriptionPriceInCents: 4800, // $48.00
    image: "/images/closeup-emilywithjar.jpg",
  },
  {
    id: "hemp-32oz",
    name: "Hemp Seed Milk - 32oz",
    milkType: "hemp",
    size: "32oz",
    description: "Nutritious and earthy, packed with omega fatty acids and protein.",
    priceInCents: 1800,
    subscriptionPriceInCents: 7200, // $72.00
    image: "/images/closeup-emilywithjar.jpg",
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
//
// Resolves any product_name variant stored in the DB (e.g. "Hemp Milk",
// "Hemp Milk x1", "Almond Milk - 16oz", "Almond Milk (16oz)") to the
// canonical PRODUCTS name (e.g. "Hemp Seed Milk - 32oz") using the milk-type
// keyword and the explicit size string.  Both cash and online records come
// out identical, so bottle-summary aggregation always groups correctly.
// ---------------------------------------------------------------------------
export function normalizeProductName(rawName: string | null | undefined, size: string): string {
  if (!rawName) return `Unknown - ${size}`
  const n = rawName.toLowerCase()

  let milkType: Product["milkType"] | null = null
  if (n.includes("oat"))    milkType = "oat"
  else if (n.includes("almond")) milkType = "almond"
  else if (n.includes("hemp"))   milkType = "hemp"

  if (!milkType) return rawName // pass through anything unrecognised unchanged

  const product = PRODUCTS.find((p) => p.milkType === milkType && p.size === size)
  return product?.name ?? rawName
}

// ---------------------------------------------------------------------------
// PRODUCT_OPTIONS
//
// Derived directly from PRODUCTS so the admin UI always stays in sync.
// Each option carries the canonical name AND size so callers can split them
// without parsing strings.
// ---------------------------------------------------------------------------
export const PRODUCT_OPTIONS = PRODUCTS.map((p) => ({
  /** Unique key (matches Product.id) */
  value: p.id,
  /** Display label shown in <select> */
  label: p.name,
  /** Canonical product_name to store in DB */
  name: p.name,
  /** Size to store separately in DB */
  size: p.size,
}))