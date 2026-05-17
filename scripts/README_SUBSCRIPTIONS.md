# Subscriptions setup (plain English)

## What lives where

- **Stripe** = payments and the recurring subscription (billing cycle, cancel at period end, payment method).
- **Supabase** = your own record of “this user has a subscription and what’s in it” so your app can show the dashboard, delivery day, and line items without calling Stripe every time.

## Tables

### `subscriptions` (one row per user’s subscription)

- Ties a user to Stripe: `user_id`, `stripe_subscription_id`, `stripe_customer_id`.
- Your app uses: `status`, `delivery_day`, `cancel_at_period_end`, `current_period_end` for the account dashboard.

### `subscription_items` (one row per product in that subscription)

- Each row = one product in the subscription (e.g. “Oat Milk 16oz × 2”).
- Columns the app uses: `subscription_id`, `product_id`, `product_name`, `size`, `quantity`, `price_cents` so it can show “Oat Milk - 16oz × 2” and the price on the dashboard.

You had the older shape (`milk_type`, `quantity`, `size` only). The migration **007_subscription_items_product_columns.sql** adds `product_id`, `product_name`, `price_cents` and makes `milk_type` optional so the app can save what comes from Stripe and display it correctly.

## Flow

1. User subscribes on your site → Stripe Checkout (subscription mode).
2. After payment, Stripe redirects to your success page with a `session_id`.
3. Your app (server) loads that session, gets the subscription and line items from Stripe, then writes/updates:
   - one row in `subscriptions`,
   - one row per line in `subscription_items`.
4. The account dashboard reads from `subscriptions` + `subscription_items` (no Stripe call needed for the basic “what’s in my subscription” view).

Run **007_subscription_items_product_columns.sql** in the Supabase SQL Editor once; after that, new subscription checkouts will populate the dashboard correctly.
