//components/footer.tsx

import Link from "next/link"
import Image from "next/image"
import { Instagram, Mail, MapPin, Phone } from "lucide-react"

export function Footer() {
  return (
    <footer className="border-t border-border/50 bg-foreground">
      <div className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-20">
        <div className="grid gap-x-8 gap-y-12 md:grid-cols-2 lg:grid-cols-12">
          {/* Brand Column */}
          <div className="lg:col-span-5">
            <Link href="/" className="inline-flex items-center gap-3">
              <Image
                src="/images/logo-footer.svg"
                alt="Modern Milk Maid"
                width={240}
                height={240}
                unoptimized
                className="h-48 w-48"
              />
            </Link>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-background/70">
              Fresh, local plant based milk delivered weekly to the North Fork of Long Island.
              Made with love, delivered with care.
            </p>
            <div className="mt-6 flex items-center gap-3">
              <a
                href="https://instagram.com/modernmilkmaid"
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-background/20 text-background transition-colors hover:border-sage hover:bg-sage hover:text-sage-foreground"
                aria-label="Follow us on Instagram"
              >
                <Instagram className="h-4 w-4" />
              </a>
              <a
                href="mailto:hello@modernmilkmaid.store"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-background/20 text-background transition-colors hover:border-sage hover:bg-sage hover:text-sage-foreground"
                aria-label="Email us"
              >
                <Mail className="h-4 w-4" />
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <div className="lg:col-span-2">
            <h3 className="text-xs font-medium uppercase tracking-[0.2em] text-background/50">Shop</h3>
            <ul className="mt-4 space-y-3">
              <li>
                <Link href="/subscribe" className="text-sm text-background/80 transition-colors hover:text-sage">
                  Subscribe
                </Link>
              </li>
              <li>
                <Link href="/shop" className="text-sm text-background/80 transition-colors hover:text-sage">
                  One-Time Purchase
                </Link>
              </li>
              <li>
                <Link href="/about" className="text-sm text-background/80 transition-colors hover:text-sage">
                  Our Milks
                </Link>
              </li>
            </ul>
          </div>

          {/* Company */}
          <div className="lg:col-span-2">
            <h3 className="text-xs font-medium uppercase tracking-[0.2em] text-background/50">Company</h3>
            <ul className="mt-4 space-y-3">
              <li>
                <Link href="/about" className="text-sm text-background/80 transition-colors hover:text-sage">
                  About
                </Link>
              </li>
              <li>
                <Link href="/#how-it-works" className="text-sm text-background/80 transition-colors hover:text-sage">
                  How It Works
                </Link>
              </li>
              <li>
                <Link href="/#faq" className="text-sm text-background/80 transition-colors hover:text-sage">
                  FAQ
                </Link>
              </li>
              <li>
                <Link href="/auth/login" className="text-sm text-background/80 transition-colors hover:text-sage">
                  Account
                </Link>
              </li>
            </ul>
          </div>

          {/* Contact Info */}
          <div className="lg:col-span-3">
            <h3 className="text-xs font-medium uppercase tracking-[0.2em] text-background/50">Contact</h3>
            <ul className="mt-4 space-y-4">
              <li className="flex items-start gap-3 text-sm text-background/80">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-sage" />
                <span>
                  North Fork, Long Island<br />
                  New York
                </span>
              </li>
              <li>
                <a
                  href="mailto:hello@modernmilkmaid.store"
                  className="flex items-center gap-3 text-sm text-background/80 transition-colors hover:text-sage"
                >
                  <Mail className="h-4 w-4 shrink-0 text-sage" />
                  Modernmilkmaidpb@gmail.com
                </a>
              </li>
              <li>
                <a
                  href="tel:+16316559549"
                  className="flex items-center gap-3 text-sm text-background/80 transition-colors hover:text-sage"
                >
                  <Phone className="h-4 w-4 shrink-0 text-sage" />
                  (631) 655-9549
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Decorative mason jar illustration 
        <div className="mt-16 flex justify-center opacity-10">
          <Image
            src="/images/image4.png"
            alt=""
            width={400}
            height={150}
            className="h-24 w-auto"
          />
        </div>*/}

        {/* Bottom Bar */}
        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-8 md:flex-row">
          <p className="text-xs text-background/50">
            {new Date().getFullYear()} Modern Milk Maid. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  )
}