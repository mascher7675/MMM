//components/header.tsx
 
"use client"
 
import Link from "next/link"
import Image from "next/image"
import { useState, useEffect } from "react"
import { Menu, X, ShoppingBag, User, LayoutDashboard } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useCart } from "@/lib/cart-context"
import { createClient } from "@/lib/supabase/client"
import type { User as SupabaseUser } from "@supabase/supabase-js"
 
export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const { setIsOpen, totalItems } = useCart()
  const [user, setUser] = useState<SupabaseUser | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
 
  useEffect(() => {
    const supabase = createClient()
    let mounted = true
 
    const loadUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!mounted) return
      setUser(user)
 
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single()
        if (mounted) setIsAdmin(profile?.role === "admin")
      }
    }
 
    loadUser()
 
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return
      if (event === "SIGNED_OUT") {
        setUser(null)
        setIsAdmin(false)
        return
      }
      if (session?.user) {
        setUser(session.user)
        supabase
          .from("profiles")
          .select("role")
          .eq("id", session.user.id)
          .single()
          .then(({ data }) => {
            if (mounted) setIsAdmin(data?.role === "admin")
          })
      }
    })
 
    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])
 
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80">
      <div className="mx-auto flex h-20 max-w-6xl items-center justify-between px-4 md:px-6">
        <Link href="/" className="flex items-center gap-3">
          <Image
            src="/images/transparent-logo-notext-svg.svg"
            alt="Modern Milk Maid"
            width={50}
            height={50}
            className="h-14 w-14"
          />
          <div className="hidden flex-col sm:flex">
            <span className="font-serif text-lg font-semibold tracking-wide text-foreground">Modern Milk Maid</span>
            <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Plant Based Milks</span>
          </div>
        </Link>
 
        <nav className="hidden items-center gap-8 lg:flex">
          <Link href="/subscribe" className="text-sm font-medium tracking-wide text-foreground transition-colors hover:text-[#7C9885]">
            Subscribe
          </Link>
          <Link href="/shop" className="text-sm font-medium tracking-wide text-foreground transition-colors hover:text-[#7C9885]">
            Shop
          </Link>
          <Link href="/about" className="text-sm font-medium tracking-wide text-foreground transition-colors hover:text-[#7C9885]">
            About
          </Link>
          <Link href="/#how-it-works" className="text-sm font-medium tracking-wide text-foreground transition-colors hover:text-[#7C9885]">
            How It Works
          </Link>
          <Link href="/#contact" className="text-sm font-medium tracking-wide text-foreground transition-colors hover:text-[#7C9885]">
            Contact
          </Link>
        </nav>
 
        <div className="hidden items-center lg:flex">
          {/* Icon cluster: cart + admin + account — separated from the CTA button */}
          <div className="flex items-center gap-1 mr-3">
            {/* Cart */}
            <button
              onClick={() => setIsOpen(true)}
              className="relative flex h-9 w-9 cursor-pointer items-center justify-center rounded-md text-foreground transition-colors hover:text-[#85B972] outline-none"
              aria-label="Open cart"
            >
              <ShoppingBag className="h-5 w-5" />

              {totalItems > 0 && (
                <span className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#85B972] text-[10px] font-medium text-white">
                  {totalItems > 9 ? "9+" : totalItems}
                </span>
              )}
            </button>
 
            {/* Divider — only shown when admin or user is present */}
            {(isAdmin || user) && (
              <div className="mx-1 h-5 w-px bg-border" />
            )}
 
            {/* Admin */}
            {isAdmin && (
              <Link
                href="/admin"
                className="flex h-9 items-center gap-1.5 rounded-md bg-[#7C9885]/10 px-3 text-sm font-medium text-[#85B972] transition-colors hover:bg-[#85B972]/20"
              >
                <LayoutDashboard className="h-4 w-4" />
                Admin
              </Link>
            )}
 
            {/* Account / Sign In */}
            {user ? (
              <Link
                href="/account"
                className="flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <User className="h-4 w-4" />
                Account
              </Link>
            ) : (
              <Link
                href="/auth/login"
                className="flex h-9 items-center rounded-md px-3 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                Sign In
              </Link>
            )}
          </div>
 
          {/* CTA */}
          <Button asChild className="bg-foreground text-background hover:bg-foreground/90">
            <Link href="/subscribe">Start Subscription</Link>
          </Button>
        </div>
 
        <div className="flex items-center gap-4 lg:hidden">
          <button
            onClick={() => setIsOpen(true)}
            className="relative flex cursor-pointer items-center justify-center text-foreground outline-none"
            aria-label="Open cart"
          >
            <ShoppingBag className="h-5 w-5" />
            {totalItems > 0 && (
              <span className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-sage text-xs font-medium text-sage-foreground">
                {totalItems > 9 ? "9+" : totalItems}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>
 
      {mobileMenuOpen && (
        <div className="border-t border-border/50 bg-background px-4 py-6 lg:hidden">
          <nav className="flex flex-col gap-4">
            <Link href="/subscribe" className="text-sm font-medium tracking-wide text-foreground" onClick={() => setMobileMenuOpen(false)}>
              Subscribe
            </Link>
            <Link href="/shop" className="text-sm font-medium tracking-wide text-foreground" onClick={() => setMobileMenuOpen(false)}>
              Shop
            </Link>
            <Link href="/about" className="text-sm font-medium tracking-wide text-foreground" onClick={() => setMobileMenuOpen(false)}>
              About
            </Link>
            <Link href="/#how-it-works" className="text-sm font-medium tracking-wide text-foreground" onClick={() => setMobileMenuOpen(false)}>
              How It Works
            </Link>
            <Link href="/#contact" className="text-sm font-medium tracking-wide text-foreground" onClick={() => setMobileMenuOpen(false)}>
              Contact
            </Link>
            <div className="flex flex-col gap-3 border-t border-border/50 pt-4">
              {isAdmin && (
                <Button variant="outline" asChild className="w-full border-[#7C9885]/30 bg-[#7C9885]/5 text-[#7c9885]">
                  <Link href="/admin" onClick={() => setMobileMenuOpen(false)}>
                    <LayoutDashboard className="h-4 w-4 mr-2" />
                    Admin Panel
                  </Link>
                </Button>
              )}
              {user ? (
                <Button variant="outline" asChild className="w-full bg-transparent">
                  <Link href="/account" onClick={() => setMobileMenuOpen(false)}>
                    <User className="h-4 w-4 mr-2" />
                    Account
                  </Link>
                </Button>
              ) : (
                <Button variant="outline" asChild className="w-full bg-transparent">
                  <Link href="/auth/login" onClick={() => setMobileMenuOpen(false)}>
                    Sign In
                  </Link>
                </Button>
              )}
              <Button asChild className="w-full bg-foreground text-background hover:bg-foreground/90">
                <Link href="/subscribe">Start Subscription</Link>
              </Button>
            </div>
          </nav>
        </div>
      )}
    </header>
  )
}