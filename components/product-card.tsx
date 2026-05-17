//components/product-card.tsx

"use client"

import { useState } from "react"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { useCart } from "@/lib/cart-context"
import { Check } from "lucide-react"
import { PRODUCTS } from "@/lib/products"

interface ProductCardProps {
  milkType: "oat" | "almond" | "hemp"
  isSubscription: boolean
}

export function ProductCard({ milkType, isSubscription }: ProductCardProps) {
  const productsForType = PRODUCTS.filter(p => p.milkType === milkType)
  const [selectedSize, setSelectedSize] = useState<"16oz" | "32oz">("16oz")
  const [justAdded, setJustAdded] = useState(false)
  const { addItem } = useCart()
  
  const product16 = productsForType.find(p => p.size === "16oz")
  const product32 = productsForType.find(p => p.size === "32oz")
  
  if (!product16 || !product32) return null

  const selectedProduct = selectedSize === "16oz" ? product16 : product32
  const price = isSubscription ? selectedProduct.subscriptionPriceInCents : selectedProduct.priceInCents
  const weeklyPrice = isSubscription ? selectedProduct.priceInCents : null

  const colorClasses = {
    oat: "border-sage/20 hover:border-sage/40",
    almond: "border-blue/20 hover:border-blue/40",
    hemp: "border-sage/20 hover:border-sage/40",
  }

  const buttonColorClasses = {
    oat: "bg-sage text-sage-foreground hover:bg-sage/90",
    almond: "bg-blue text-blue-foreground hover:bg-blue/90",
    hemp: "bg-sage text-sage-foreground hover:bg-sage/90",
  }

  const sizeButtonClasses = {
    oat: {
      active: "border-sage bg-sage/10 text-sage font-medium",
      inactive: "border-border bg-background text-muted-foreground hover:border-sage/50",
    },
    almond: {
      active: "border-blue bg-blue/10 text-blue font-medium",
      inactive: "border-border bg-background text-muted-foreground hover:border-blue/50",
    },
    hemp: {
      active: "border-sage bg-sage/10 text-sage font-medium",
      inactive: "border-border bg-background text-muted-foreground hover:border-sage/50",
    },
  }

  const handleAddToCart = () => {
    addItem({
      productId: selectedProduct.id,
      name: selectedProduct.name,
      size: selectedProduct.size,
      priceInCents: price,
      image: selectedProduct.image,
      isSubscription,
      quantity: 1,
    })
    
    setJustAdded(true)
    setTimeout(() => setJustAdded(false), 2000)
  }

  return (
    <div className={`group overflow-hidden rounded-lg border bg-card transition-all ${colorClasses[milkType]}`}>
      {/* Image */}
      <div className="relative aspect-4/3 overflow-hidden bg-secondary">
        <Image
          src={selectedProduct.image}
          alt={selectedProduct.name}
          fill
          className="object-cover transition-transform duration-300 group-hover:scale-105"
        />
      </div>

      {/* Content */}
      <div className="p-5">
        <h3 className="font-serif text-xl font-medium text-foreground">
          {selectedProduct.name.split(' - ')[0]}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {selectedProduct.description}
        </p>

        {/* Size Selection */}
        <div className="mt-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Select Size
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setSelectedSize("16oz")}
              className={`flex-1 rounded-md border px-3 py-2 text-sm transition-all ${
                selectedSize === "16oz"
                  ? sizeButtonClasses[milkType].active
                  : sizeButtonClasses[milkType].inactive
              }`}
            >
              <span className="block">16oz</span>
              <span className="block text-xs opacity-75">
                ${(product16.priceInCents / 100).toFixed(2)}
              </span>
            </button>
            <button
              onClick={() => setSelectedSize("32oz")}
              className={`flex-1 rounded-md border px-3 py-2 text-sm transition-all ${
                selectedSize === "32oz"
                  ? sizeButtonClasses[milkType].active
                  : sizeButtonClasses[milkType].inactive
              }`}
            >
              <span className="block">32oz</span>
              <span className="block text-xs opacity-75">
                ${(product32.priceInCents / 100).toFixed(2)}
              </span>
            </button>
          </div>
        </div>

        {/* Price and Add Button */}
        <div className="mt-5">
          {isSubscription ? (
            <div className="mb-4">
              <div className="flex items-baseline gap-2">
                <p className="font-serif text-2xl font-medium text-foreground">
                  ${(weeklyPrice! / 100).toFixed(2)}
                </p>
                <p className="text-sm text-muted-foreground">per week</p>
              </div>
              <p className="text-xs text-muted-foreground">
                ${(price / 100).toFixed(2)}/month
              </p>
            </div>
          ) : (
            <div className="mb-4 flex items-baseline gap-2">
              <p className="font-serif text-2xl font-medium text-foreground">
                ${(price / 100).toFixed(2)}
              </p>
              <p className="text-xs text-muted-foreground">one-time</p>
            </div>
          )}
          
          <Button 
            className={`w-full ${buttonColorClasses[milkType]}`}
            onClick={handleAddToCart}
          >
            {justAdded ? (
              <>
                <Check className="mr-2 h-4 w-4" />
                Added
              </>
            ) : (
              isSubscription ? "Add to Plan" : "Add to Cart"
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}