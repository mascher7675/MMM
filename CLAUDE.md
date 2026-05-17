Modern Milk Maid — Project Context for Claude Code

Read this first. This file captures everything Claude needs to understand the codebase without prior conversation history.


1. What This Project Is
Modern Milk Maid is a small-batch, non-dairy milk delivery service on the North Fork of Long Island, NY. The owner (Emily) makes oat, almond, and hemp seed milk in mason jars and delivers weekly on Thursdays and Fridays.
The site handles:

A public marketing site (home, about, shop, subscribe pages)
Stripe-powered checkout (one-time orders + monthly subscriptions)
A customer account dashboard (view orders, manage subscription, contact)
An admin dashboard for Emily to manage customers, deliveries, orders, and messages

Supabase project: supabase-modern-milk-maid
Supabase URL: https://imeuxfkrkyggusgjeeij.supabase.co

2. Tech Stack
LayerTechnologyFrameworkNext.js 14+ (App Router, Server Components)DatabaseSupabase (Postgres + Auth + RLS)PaymentsStripe (Embedded Checkout, subscriptions via price_data with recurring)EmailResend (lib/email.ts)StylingTailwind CSS + shadcn/ui componentsFontsGeist (sans), Playfair Display (serif headings)DeploymentVercel (assumed)

3. Project Structure
app/
  page.tsx                   # Home page (server component)
  layout.tsx                 # Root layout — wraps with CartProvider + CartDrawer
  about/page.tsx             # About/products page
  shop/page.tsx              # One-time purchase shop
  subscribe/page.tsx         # Subscription shop
  checkout/page.tsx          # Checkout (address → Stripe embedded checkout)
  checkout/success/page.tsx  # Order saved here on success redirect
  account/page.tsx           # Customer account dashboard
  admin/page.tsx             # Admin dashboard (role === 'admin' only)
  auth/                      # Login, sign-up, callback pages
  actions/
    stripe.ts                # createCheckoutSession, saveOrderFromSession
    subscription.ts          # updateDeliveryDay, cancelSubscription, swapMilk, etc.
    admin.ts                 # All admin server actions (CRUD for orders, customers, etc.)

components/
  admin/                     # Admin dashboard tabs and modals
  account/                   # Customer-facing account panels
  cart-drawer.tsx            # Slide-out cart
  checkout-form.tsx          # Multi-step checkout (address → payment)
  checkout-address-form.tsx  # Step 1 of checkout

lib/
  products.ts                # PRODUCTS array — source of truth for all product data
  cart-context.tsx           # Cart state (React context)
  delivery-utils.ts          # computeNextDeliveryDate, computeDeliveryDates, isDeliveryDayLocked
  supabase/
    client.ts                # Browser Supabase client
    server.ts                # Server Supabase client (uses cookies)
  stripe.ts                  # Stripe SDK init
  email.ts                   # sendOrderConfirmationEmail via Resend

supabase/migrations/         # SQL migration files (001–015)

4. Products & Pricing
Defined in lib/products.ts — this is the single source of truth.
ProductOne-Time PriceSubscription Price (monthly)Oat Milk 16oz$12.00$48.00/moOat Milk 32oz$18.00$72.00/moAlmond Milk 16oz$12.00$48.00/moAlmond Milk 32oz$18.00$72.00/moHemp Seed Milk 16oz$12.00$48.00/moHemp Seed Milk 32oz$18.00$72.00/mo
Subscription is billed monthly but delivers 4 times per month (weekly). The subscriptionPriceInCents is the monthly charge — each weekly delivery costs 1/4 of that.
The displayed "per week" price shown to customers is subscriptionPriceInCents / 4 / 100 = $10.80/week for 16oz, $16.20/week for 32oz.

5. Database Schema (Key Tables)
profiles
Extends auth.users. One row per user.

id (uuid, FK → auth.users)
email, first_name, last_name, phone
address, city, state, zip, delivery_instructions
role — 'customer' | 'admin'
stripe_customer_id
is_cash_customer (bool) — cash-only customers have no auth account
route_position (int) — admin-set delivery route order
admin_notes (text) — internal notes, not shown to customer
delivery_day — 'thursday' | 'friday'

Admin check function: public.is_admin() — returns true if profiles.role = 'admin' for the current auth.uid(). Used in all RLS policies.
orders

id (uuid), user_id (FK → profiles)
order_type — 'one_time' | 'subscription'
status — 'pending' | 'confirmed' | 'cancelled'
delivery_state — 'pending' | 'preparing' | 'out_for_delivery' | 'delivered' | 'failed'
total, subtotal (cents)
delivery_address, delivery_city, delivery_zip
delivery_day, delivery_instructions
placed_at (timestamptz) — used as the first delivery date for subscription orders
stripe_payment_intent_id, stripe_session_id
admin_notes

order_items

order_id, product_id, product_name, size, quantity, price_cents

subscriptions

id, user_id
status — 'active' | 'paused' | 'cancelled'
delivery_day — 'thursday' | 'friday'
next_delivery_date (date)
delivery_dates (date[]) — array of 4 upcoming delivery dates for the current billing cycle. Written at checkout and updated when user changes delivery day.
final_delivery_date (date) — last delivery before cancel/period end
cancel_at_period_end (bool)
current_period_end (timestamptz) — from Stripe
stripe_subscription_id, stripe_customer_id

subscription_items

subscription_id, product_id, product_name, size, quantity, price_cents
One row per product in the subscription

subscription_delivery_logs

Tracks per-delivery status for subscription orders
order_id, delivery_date, status, notes

messages

Customer → admin messages (contact, pause requests, cancel requests)
user_id, type, subject, body, status ('unread' | 'read' | 'resolved')


6. Delivery Logic (Critical)
Deliveries happen Thursdays and Fridays only.
Cutoff Rule
Changes (delivery day changes, new subscriptions) are locked after 10 PM the night before delivery. isDeliveryDayLocked(day) in lib/delivery-utils.ts enforces this.
Key Functions (lib/delivery-utils.ts)

computeNextDeliveryDate(deliveryDay) — returns YYYY-MM-DD of the next valid delivery date
computeDeliveryDates(deliveryDay) — returns array of 4 YYYY-MM-DD dates (weekly from next delivery)
recomputeDeliveryDatesOnDayChange(existingDates, newDay) — preserves past dates, shifts future ones to new day
isDeliveryDayLocked(day) — true if within 22-hour cutoff window

Date Timezone Gotcha ⚠️
Always append T12:00:00 when parsing plain YYYY-MM-DD strings to avoid UTC midnight → previous day shift in US timezones. This is done throughout the codebase in fmtDate() and anywhere dates are displayed.
ts// CORRECT
new Date("2024-03-14T12:00:00")

// WRONG — shifts back 1 day in CST/CDT
new Date("2024-03-14")

7. Checkout Flow
Simple Cart (all one-time OR all subscription)

/checkout → Address form (CheckoutAddressForm)
Address submitted → Stripe Embedded Checkout renders
Payment complete → redirect to /checkout/success?session_id=...
saveOrderFromSession(sessionId) runs server-side → writes to orders, order_items, subscriptions, subscription_items
Confirmation email sent via Resend

Mixed Cart (subscription + one-time items)
Stripe doesn't support mixed modes in one session, so it's split into two sequential checkout sessions:

Pay for subscription items first (phase 1)
Success redirects to /checkout?returning_from_phase=subscription
Pay for one-time items (phase 2)
Final success page

Address data is persisted in sessionStorage under key checkout_address_data to survive the mid-flow redirect.
Subscription Billing

Stripe subscription billed monthly (interval: "month")
Uses price_data with recurring — no pre-created Stripe Price objects
After payment, saveOrderFromSession writes to subscriptions and creates the first orders row for the upcoming delivery


8. Admin Dashboard
Route: /admin — server-side redirect if profiles.role !== 'admin'
Tabs:

Overview — KPI cards, recent orders, unread messages
Orders — expandable order list, delivery state management, subscription delivery log
Subscriptions — all active subscriptions, swap milk type, edit delivery day
Customers — all profiles, create/edit/delete cash customers
Messages — inbox for customer contact/pause/cancel requests
Delivery — route builder by day, drag-to-reorder stops, printable delivery list

Cash Customers
Emily has in-person/cash customers who don't use the website. Admin can create them manually:

Profile is created without an auth.users row (generated UUID)
is_cash_customer = true
Can have subscriptions and orders created manually through the admin UI
Appear in delivery route alongside online customers

Delivery Route Tab

Loads all customers with orders for a selected delivery day
Drag-to-reorder stops → saves route_position to profiles
Shows bottle summary (total count by product)
"Print" button generates a self-contained HTML page and opens browser print dialog


9. Customer Account Dashboard
Route: /account — redirects to login if not authenticated.
Sections:

Active subscription details (items, delivery day, next delivery, period end)
Recent orders
Contact form (sends to messages table)

Subscription actions customers can take:

Change delivery day (locked within cutoff window)
Swap milk type (e.g. change Oat → Almond, same size)
Cancel at period end (or reactivate)
Open Stripe Billing Portal (to update payment method)


10. Auth
Supabase Auth with email/password + email confirmation.

app/auth/login/page.tsx — sign in
app/auth/sign-up/page.tsx — registration
app/auth/callback/route.ts — handles Supabase auth redirect (email confirmation)
Profile row is auto-created via handle_new_user() trigger on auth.users INSERT


11. Environment Variables
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
STRIPE_SECRET_KEY
RESEND_API_KEY
NEXT_PUBLIC_APP_URL          # Used for Stripe billing portal return_url

12. RLS (Row Level Security)
All tables have RLS enabled. Key patterns:

Users read/write their own rows — auth.uid() = user_id
Admins can read/write everything — public.is_admin() function
Cash customers — no auth session; admin service role is used for their data
Admin policies added in migrations/010_admin_policies.sql and 011_cash_customers_and_route_edits.sql


13. Migrations Log
FileWhat it does001Initial tables (profiles, orders, order_items, subscriptions, messages)002Schema updates003Orders + cart schema004Add size to subscription_items005Fix profiles + trigger007Add product_id, product_name, price_cents to subscription_items008Add final_delivery_date to subscriptions009Backfill next_delivery_date010Admin RLS policies011Cash customers (is_cash_customer, route_position, admin_notes)012subscription_delivery_logs table013Allow multiple subscriptions per user014Test env reset script (DO NOT run in production)015Add delivery_dates array column to subscriptions

14. Known Quirks & Gotchas

normalizeProductName() in lib/products.ts — resolves legacy/variant product name strings (e.g. "Hemp Milk", "Hemp Milk x1") to canonical form. Always use this when aggregating bottle counts from orders.
Subscription items vs order items — for subscription orders, the admin uses live subscription_items (not the snapshot in order_items) so milk swaps are reflected on the delivery list. Fallback to order_items only if subscription is cancelled.
Mixed cart checkout — address data must survive a page redirect. It's stored in sessionStorage under checkout_address_data. If delivery_day is missing on phase 2, it reads from sessionStorage as a fallback.
placed_at on subscription orders — stores the first delivery date (not order creation time) so the delivery date math works correctly.
delivery_dates array — added in migration 015. Older subscription orders may not have it; the orders tab falls back to computing dates from placed_at + 7-day offsets. After any delivery day change, this array is recomputed and saved.
Stripe subscription price — uses price_data inline (not pre-created Price objects). The monthly subscriptionPriceInCents covers 4 weekly deliveries.
Admin-only actions use requireAdmin() helper in app/actions/admin.ts which throws if the caller isn't an admin.
Color palette — primary brand green is #7C9885 (CSS var --sage) but #85B972 is used in some areas such as a couple items in header. Use text-sage / bg-sage Tailwind classes. Secondary blue accent is #5A81A5.