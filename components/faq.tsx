//components/faq.tsx

"use client"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"

const faqs = [
  {
    question: "What areas do you deliver to?",
    answer: "We deliver throughout the North Fork of Long Island, including Greenport, Southold, Cutchogue, Mattituck, and surrounding areas. Contact us if you are unsure about your location!",
  },
  {
    question: "How does the bottle return program work?",
    answer: "Simply leave your empty, rinsed jars outside on your next delivery day. We pick them up, sanitize them thoroughly, and reuse them. Zero waste, lower costs.",
  },
  {
    question: "How long does the milk stay fresh?",
    answer: "Our milks stay fresh for 7-10 days when refrigerated. With weekly delivery, you will always have the freshest milk possible.",
  },
  {
    question: "Can I pause or cancel my subscription?",
    answer: "Absolutely! Pause anytime from your account dashboard. No commitments, no cancellation fees.",
  },
  {
    question: "What sizes are available?",
    answer: "All three milk varieties come in 16oz and 32oz glass mason jars. Perfect for individuals or families.",
  },
  {
    question: "Do you offer one-time purchases?",
    answer: "Yes! Visit our shop for one-time purchases. Subscriptions offer the best value with weekly delivery convenience.",
  },
]

export function FAQ() {
  return (
    <section id="faq" className="bg-background py-20 md:py-28">
      <div className="mx-auto max-w-3xl px-4 md:px-6">
        <div className="text-center">
          <p className="mb-4 text-sm uppercase tracking-[0.25em] text-sage">
            Questions & Answers
          </p>
          <h2 className="font-serif text-3xl font-medium tracking-tight text-foreground md:text-4xl">
            Frequently Asked Questions
          </h2>
        </div>

        <Accordion type="single" collapsible className="mt-12">
          {faqs.map((faq, index) => (
            <AccordionItem key={index} value={`item-${index}`} className="border-border/50">
              <AccordionTrigger className="text-left font-medium text-foreground hover:text-sage hover:no-underline data-[state=open]:text-sage">
                {faq.question}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground leading-relaxed">
                {faq.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  )
}
