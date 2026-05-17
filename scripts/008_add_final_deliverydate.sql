alter table subscriptions
  add column if not exists final_delivery_date date;
  ADD COLUMN IF NOT EXISTS next_delivery_date date;