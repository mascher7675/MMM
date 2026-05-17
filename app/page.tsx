//app/page.tsx

import { Header } from "@/components/header"
import { Hero } from "@/components/hero"
import { ProductsPreview } from "@/components/products-preview"
import { HowItWorks } from "@/components/how-it-works"
import { WhyNonDairy } from "@/components/why-non-dairy"
import { FAQ } from "@/components/faq"
import { CTA } from "@/components/cta"
import { HomepageContactForm } from "@/components/homepage-contact-form"
import { Footer } from "@/components/footer"

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <Hero />
        <ProductsPreview />
        <HowItWorks />
        <WhyNonDairy />
        <FAQ />
        <CTA />
        <HomepageContactForm />
      </main>
      <Footer />
    </div>
  )
}