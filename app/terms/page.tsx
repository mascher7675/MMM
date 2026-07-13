//app/terms/page.tsx

// ---------------------------------------------------------------------------
// NOTE FOR THE DEVELOPER (delete before launch if you like):
// This is a tailored starting template, not legal advice. Before going live,
// have it reviewed by an attorney and fill in / confirm the bracketed items:
//   • [LEGAL_ENTITY]      → your registered business name/structure (e.g. "Modern Milk Maid LLC")
//   • Effective date      → set to your real go-live date (currently July 12, 2026)
//   • Contact email       → currently hello@modernmilkmaid.store (temporary domain — update at rename)
//   • Delivery area        → confirm the exact towns/ZIPs you serve
//   • Confirm the billing / cancellation / refund wording matches your live policy.
// ---------------------------------------------------------------------------

import type { Metadata } from "next"
import { Header } from "@/components/header"
import { Footer } from "@/components/footer"

export const metadata: Metadata = {
  title: "Terms of Service | Modern Milk Maid",
  description:
    "The terms that govern your use of Modern Milk Maid's website and delivery service.",
}

const CONTACT_EMAIL = "hello@modernmilkmaid.store"
const LAST_UPDATED = "July 12, 2026"

export default function TermsOfServicePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1 bg-background py-16 md:py-24">
        <div className="mx-auto max-w-3xl px-4 md:px-6">
          {/* Page header */}
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-sage">
            Legal
          </p>
          <h1 className="mt-3 font-serif text-4xl text-foreground md:text-5xl">
            Terms of Service
          </h1>
          <p className="mt-4 text-sm text-muted-foreground">
            Last updated {LAST_UPDATED}
          </p>
          <div className="mt-8 h-px w-full bg-border" />

          {/* Body */}
          <div className="mt-10 space-y-10">
            <section>
              <p className="text-[15px] leading-7 text-muted-foreground">
                These Terms of Service (&ldquo;Terms&rdquo;) govern your use of the
                Modern Milk Maid website and delivery service (the
                &ldquo;Service&rdquo;), operated by Modern Milk Maid
                (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) on the
                North Fork of Long Island, New York. By creating an account,
                placing an order, or otherwise using the Service, you agree to
                these Terms. If you do not agree, please do not use the Service.
              </p>
            </section>

            <section>
              <h2 className="font-serif text-2xl text-foreground">
                Eligibility and your account
              </h2>
              <p className="mt-4 text-[15px] leading-7 text-muted-foreground">
                You must be at least 18 years old to create an account and place
                orders. You agree to provide accurate, current information and to
                keep your account credentials secure. You are responsible for
                activity that occurs under your account. Please notify us right
                away if you believe your account has been used without your
                permission.
              </p>
            </section>

            <section>
              <h2 className="font-serif text-2xl text-foreground">
                Products, pricing, and availability
              </h2>
              <p className="mt-4 text-[15px] leading-7 text-muted-foreground">
                We offer fresh, plant-based milks for one-time purchase and by
                weekly subscription. Prices are shown in U.S. dollars and may
                change over time; the price shown at checkout is the price that
                applies to that order. Products are subject to availability, and we
                may occasionally substitute or be unable to fulfill an item, in
                which case we will let you know.
              </p>
            </section>

            <section>
              <h2 className="font-serif text-2xl text-foreground">
                Subscriptions, billing, and renewals
              </h2>
              <p className="mt-4 text-[15px] leading-7 text-muted-foreground">
                Our weekly subscription works like this:
              </p>
              <ul className="mt-4 list-disc space-y-3 pl-5 text-[15px] leading-7 text-muted-foreground">
                <li>
                  When you sign up, you are charged the full weekly price that day,
                  which pays for your first delivery.
                </li>
                <li>
                  After that, your subscription renews automatically each week. You
                  are charged the weekly price at your cutoff, and each charge pays
                  for that week&rsquo;s upcoming delivery.
                </li>
                <li>
                  <span className="font-medium text-foreground">
                    Your weekly cutoff is 5:00 PM Eastern the evening before your
                    delivery day
                  </span>{" "}
                  &mdash; Wednesday at 5:00 PM for Thursday deliveries, and Thursday
                  at 5:00 PM for Friday deliveries.
                </li>
                <li>
                  Your subscription continues until you cancel it. By subscribing,
                  you authorize these recurring weekly charges to your payment
                  method until you cancel.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="font-serif text-2xl text-foreground">
                Skipping, changes, cancellation, and refunds
              </h2>

              {/* Highlighted policy callout — mirrors the app's own copy */}
              <div className="mt-4 rounded-md border-l-[3px] border-sage bg-secondary p-5">
                <p className="text-[15px] leading-7 text-muted-foreground">
                  <span className="font-medium text-foreground">
                    Your money is safe until your delivery&rsquo;s cutoff.
                  </span>{" "}
                  You can skip or cancel before that cutoff without being charged
                  for that week.
                </p>
              </div>

              <ul className="mt-6 list-disc space-y-3 pl-5 text-[15px] leading-7 text-muted-foreground">
                <li>
                  <span className="font-medium text-foreground">Skipping.</span> You
                  can skip an upcoming delivery from your account page any time
                  before that week&rsquo;s cutoff, and you will not be charged for
                  the skipped week.
                </li>
                <li>
                  <span className="font-medium text-foreground">
                    Changing your milk or delivery day.
                  </span>{" "}
                  You can make changes from your account page. Some changes are
                  locked shortly before and around the cutoff so that deliveries
                  already being prepared aren&rsquo;t disrupted.
                </li>
                <li>
                  <span className="font-medium text-foreground">Cancelling.</span>{" "}
                  You can cancel any time from your account page. If you cancel{" "}
                  <span className="font-medium text-foreground">before</span> the
                  cutoff for your next paid delivery, that delivery is refunded and
                  your subscription ends immediately. If the cutoff has already{" "}
                  <span className="font-medium text-foreground">passed</span>, that
                  delivery is already prepared and will still be delivered, and no
                  further charges are made.
                </li>
                <li>
                  <span className="font-medium text-foreground">Refunds.</span>{" "}
                  Refunds are issued to your original payment method. Because our
                  products are fresh and perishable, we generally cannot accept
                  returns, but if something is wrong with your delivery, contact us
                  and we will make it right.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="font-serif text-2xl text-foreground">
                Delivery and service area
              </h2>
              <p className="mt-4 text-[15px] leading-7 text-muted-foreground">
                We deliver on the North Fork of Long Island, New York. Deliveries
                are made to the address on your account on your scheduled delivery
                day. Because our products are perishable, please make sure someone
                can receive the delivery or that you have provided a safe, shaded
                spot (such as a cooler) to leave it. We are not responsible for
                product left unrefrigerated after a completed delivery, or for
                deliveries that cannot be completed because of an inaccurate address
                or inaccessible location.
              </p>
            </section>

            <section>
              <h2 className="font-serif text-2xl text-foreground">Payments</h2>
              <p className="mt-4 text-[15px] leading-7 text-muted-foreground">
                Payments are processed securely by Stripe. By providing a payment
                method, you represent that you are authorized to use it and you
                authorize us (through Stripe) to charge it for your orders and, for
                subscriptions, for recurring weekly deliveries as described above.
              </p>
            </section>

            <section>
              <h2 className="font-serif text-2xl text-foreground">
                Food safety and allergens
              </h2>
              <p className="mt-4 text-[15px] leading-7 text-muted-foreground">
                Our milks are plant-based and made in small batches. Some varieties
                are made from tree nuts (such as almond and cashew) and other
                allergens, and all products are prepared in a facility where
                allergens are present, so cross-contact is possible. If you have a
                food allergy or sensitivity, please review product descriptions
                carefully and contact us with any questions before ordering.
                Keep products refrigerated and consume by any date indicated.
              </p>
            </section>

            <section>
              <h2 className="font-serif text-2xl text-foreground">Acceptable use</h2>
              <p className="mt-4 text-[15px] leading-7 text-muted-foreground">
                You agree to use the Service only for lawful purposes and not to
                interfere with its operation, attempt to gain unauthorized access,
                or misuse it in any way. We may suspend or close accounts that
                violate these Terms or that we reasonably believe are being used
                fraudulently.
              </p>
            </section>

            <section>
              <h2 className="font-serif text-2xl text-foreground">
                Intellectual property
              </h2>
              <p className="mt-4 text-[15px] leading-7 text-muted-foreground">
                The Modern Milk Maid name, logo, site content, and branding are
                owned by us and may not be copied or used without our permission.
              </p>
            </section>

            <section>
              <h2 className="font-serif text-2xl text-foreground">
                Disclaimers and limitation of liability
              </h2>
              <p className="mt-4 text-[15px] leading-7 text-muted-foreground">
                The Service is provided &ldquo;as is&rdquo; without warranties of
                any kind, to the fullest extent permitted by law. To the maximum
                extent permitted by law, Modern Milk Maid is not liable for any
                indirect, incidental, or consequential damages arising from your use
                of the Service, and our total liability for any claim relating to an
                order will not exceed the amount you paid for that order. Nothing in
                these Terms limits any liability that cannot be limited under
                applicable law.
              </p>
            </section>

            <section>
              <h2 className="font-serif text-2xl text-foreground">Governing law</h2>
              <p className="mt-4 text-[15px] leading-7 text-muted-foreground">
                These Terms are governed by the laws of the State of New York,
                without regard to its conflict-of-laws rules. Any dispute will be
                handled in the state or federal courts located in New York.
              </p>
            </section>

            <section>
              <h2 className="font-serif text-2xl text-foreground">
                Changes to these Terms
              </h2>
              <p className="mt-4 text-[15px] leading-7 text-muted-foreground">
                We may update these Terms from time to time. When we do, we will
                revise the &ldquo;Last updated&rdquo; date above. Your continued use
                of the Service after changes take effect means you accept the
                updated Terms.
              </p>
            </section>

            <section>
              <h2 className="font-serif text-2xl text-foreground">Contact us</h2>
              <p className="mt-4 text-[15px] leading-7 text-muted-foreground">
                Questions about these Terms? Reach us at{" "}
                <a
                  href={`mailto:${CONTACT_EMAIL}`}
                  className="text-sage underline underline-offset-2 hover:opacity-80"
                >
                  {CONTACT_EMAIL}
                </a>
                . Modern Milk Maid &mdash; North Fork, Long Island, New York.
              </p>
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}