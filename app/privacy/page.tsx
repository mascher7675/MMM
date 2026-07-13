//app/privacy/page.tsx

// ---------------------------------------------------------------------------
// NOTE FOR THE DEVELOPER (delete before launch if you like):
// This is a tailored starting template, not legal advice. Before going live,
// have it reviewed by an attorney and fill in / confirm the bracketed items:
//   • [LEGAL_ENTITY]      → your registered business name/structure (e.g. "Modern Milk Maid LLC")
//   • Effective date      → set to your real go-live date (currently July 12, 2026)
//   • Contact email       → currently hello@modernmilkmaid.store (temporary domain — update at rename)
//   • Delivery area        → confirm the exact towns/ZIPs you serve
// ---------------------------------------------------------------------------

import type { Metadata } from "next"
import { Header } from "@/components/header"
import { Footer } from "@/components/footer"

export const metadata: Metadata = {
  title: "Privacy Policy | Modern Milk Maid",
  description:
    "How Modern Milk Maid collects, uses, and protects your personal information.",
}

const CONTACT_EMAIL = "hello@modernmilkmaid.store"
const LAST_UPDATED = "July 12, 2026"

export default function PrivacyPolicyPage() {
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
            Privacy Policy
          </h1>
          <p className="mt-4 text-sm text-muted-foreground">
            Last updated {LAST_UPDATED}
          </p>
          <div className="mt-8 h-px w-full bg-border" />

          {/* Body */}
          <div className="mt-10 space-y-10">
            <section>
              <p className="text-[15px] leading-7 text-muted-foreground">
                Modern Milk Maid (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or
                &ldquo;our&rdquo;) is a small, local non-dairy milk delivery
                service on the North Fork of Long Island, New York. This Privacy
                Policy explains what information we collect when you use our
                website and delivery service, how we use it, who we share it
                with, and the choices you have. By using our site or placing an
                order, you agree to the practices described here.
              </p>
            </section>

            <section>
              <h2 className="font-serif text-2xl text-foreground">
                Information we collect
              </h2>
              <p className="mt-4 text-[15px] leading-7 text-muted-foreground">
                We collect only what we need to run the service:
              </p>
              <ul className="mt-4 list-disc space-y-3 pl-5 text-[15px] leading-7 text-muted-foreground">
                <li>
                  <span className="font-medium text-foreground">
                    Account information.
                  </span>{" "}
                  Your name, email address, delivery address, and phone number,
                  which you provide when you create an account or place an order.
                </li>
                <li>
                  <span className="font-medium text-foreground">
                    Order and subscription information.
                  </span>{" "}
                  The products you order, your delivery day and preferences, your
                  subscription status, skipped or cancelled deliveries, and your
                  order history.
                </li>
                <li>
                  <span className="font-medium text-foreground">
                    Payment information.
                  </span>{" "}
                  Payments are processed by Stripe. We do{" "}
                  <span className="font-medium text-foreground">not</span> store
                  your full card number on our systems &mdash; Stripe handles and
                  stores that securely. We retain limited references (such as a
                  customer identifier and records of charges and refunds) needed
                  to manage your orders.
                </li>
                <li>
                  <span className="font-medium text-foreground">
                    Communications.
                  </span>{" "}
                  Messages you send us through our contact form or by email,
                  including your name, email, phone, and the content of your
                  message.
                </li>
                <li>
                  <span className="font-medium text-foreground">
                    Information collected automatically.
                  </span>{" "}
                  We use essential cookies to keep you signed in and to operate
                  the site. Our authentication provider may log basic technical
                  data (such as your IP address and browser) for security and to
                  keep the service running.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="font-serif text-2xl text-foreground">
                How we use your information
              </h2>
              <ul className="mt-4 list-disc space-y-3 pl-5 text-[15px] leading-7 text-muted-foreground">
                <li>To process and deliver your orders and manage your subscription.</li>
                <li>To process payments, issue refunds, and keep financial records.</li>
                <li>
                  To send you service emails &mdash; order confirmations, delivery
                  and subscription updates, and account security notices (such as
                  password or email-change confirmations).
                </li>
                <li>To respond to your questions and provide customer support.</li>
                <li>To secure our service, prevent fraud, and comply with the law.</li>
              </ul>
              <p className="mt-4 text-[15px] leading-7 text-muted-foreground">
                We do not use your information to serve you advertising, and we do
                not sell your personal information.
              </p>
            </section>

            <section>
              <h2 className="font-serif text-2xl text-foreground">
                How we share information
              </h2>
              <p className="mt-4 text-[15px] leading-7 text-muted-foreground">
                We share information only with the service providers that help us
                operate, and only as needed to run the service:
              </p>
              <ul className="mt-4 list-disc space-y-3 pl-5 text-[15px] leading-7 text-muted-foreground">
                <li>
                  <span className="font-medium text-foreground">Stripe</span> &mdash;
                  payment processing. See{" "}
                  <a
                    href="https://stripe.com/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sage underline underline-offset-2 hover:opacity-80"
                  >
                    Stripe&rsquo;s Privacy Policy
                  </a>
                  .
                </li>
                <li>
                  <span className="font-medium text-foreground">Supabase</span> &mdash;
                  secure database and account authentication.
                </li>
                <li>
                  <span className="font-medium text-foreground">Resend</span> &mdash;
                  delivery of our transactional and account emails.
                </li>
                <li>
                  <span className="font-medium text-foreground">
                    Our hosting provider
                  </span>{" "}
                  &mdash; to serve the website.
                </li>
              </ul>
              <p className="mt-4 text-[15px] leading-7 text-muted-foreground">
                We may also disclose information if required by law, to protect our
                rights or the safety of others, or in connection with a business
                transfer. We never sell your personal information.
              </p>
            </section>

            <section>
              <h2 className="font-serif text-2xl text-foreground">
                Cookies
              </h2>
              <p className="mt-4 text-[15px] leading-7 text-muted-foreground">
                We use only essential cookies &mdash; primarily to keep you signed
                in and to remember the contents of your cart. We do not use
                advertising or third-party tracking cookies. Blocking essential
                cookies may prevent parts of the site (such as logging in or
                checking out) from working.
              </p>
            </section>

            <section>
              <h2 className="font-serif text-2xl text-foreground">
                Data retention
              </h2>
              <p className="mt-4 text-[15px] leading-7 text-muted-foreground">
                We keep your account and order information for as long as your
                account is active or as needed to provide the service. We retain
                records of orders, payments, and refunds for longer where needed to
                meet tax, accounting, and other legal obligations, even after an
                account is closed.
              </p>
            </section>

            <section>
              <h2 className="font-serif text-2xl text-foreground">
                How we protect your information
              </h2>
              <p className="mt-4 text-[15px] leading-7 text-muted-foreground">
                We use industry-standard safeguards, including encryption of data
                in transit (HTTPS) and access controls that limit who can see your
                data. Card payments are handled entirely by Stripe. No method of
                transmission or storage is perfectly secure, but we work to protect
                your information and to respond promptly to any issue.
              </p>
            </section>

            <section>
              <h2 className="font-serif text-2xl text-foreground">
                Your choices and rights
              </h2>
              <ul className="mt-4 list-disc space-y-3 pl-5 text-[15px] leading-7 text-muted-foreground">
                <li>
                  You can view and update your account details and delivery
                  information at any time from your account page.
                </li>
                <li>
                  You can manage, skip, or cancel your subscription from your
                  account page.
                </li>
                <li>
                  You can request a copy of your personal information, or ask us to
                  correct or delete it, by contacting us at the address below. Note
                  that we may need to keep certain records to meet legal
                  obligations.
                </li>
                <li>
                  Service and account emails are part of using the service; if you
                  no longer wish to receive them, you can close your account.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="font-serif text-2xl text-foreground">
                Children&rsquo;s privacy
              </h2>
              <p className="mt-4 text-[15px] leading-7 text-muted-foreground">
                Our service is intended for adults. We do not knowingly collect
                personal information from children under 13. If you believe a child
                has provided us information, please contact us and we will delete
                it.
              </p>
            </section>

            <section>
              <h2 className="font-serif text-2xl text-foreground">
                Changes to this policy
              </h2>
              <p className="mt-4 text-[15px] leading-7 text-muted-foreground">
                We may update this Privacy Policy from time to time. When we do, we
                will revise the &ldquo;Last updated&rdquo; date above. Significant
                changes will be communicated through the site or by email where
                appropriate.
              </p>
            </section>

            <section>
              <h2 className="font-serif text-2xl text-foreground">Contact us</h2>
              <p className="mt-4 text-[15px] leading-7 text-muted-foreground">
                Questions about this policy or your information? Reach us at{" "}
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