-- Create orders table
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  stripe_session_id text,
  stripe_payment_intent_id text,
  status text not null default 'pending',
  order_type text not null default 'one_time', -- 'one_time' or 'subscription'
  subtotal integer not null default 0, -- in cents
  total integer not null default 0, -- in cents
  delivery_address text,
  delivery_city text,
  delivery_zip text,
  delivery_day text,
  notes text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.orders enable row level security;

create policy "orders_select_own" on public.orders for select using (auth.uid() = user_id);
create policy "orders_insert_own" on public.orders for insert with check (auth.uid() = user_id);
create policy "orders_update_own" on public.orders for update using (auth.uid() = user_id);

-- Create order_items table
create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id text not null,
  product_name text not null,
  size text not null,
  quantity integer not null default 1,
  price_cents integer not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.order_items enable row level security;

create policy "order_items_select_own" on public.order_items 
  for select using (
    exists (
      select 1 from public.orders 
      where orders.id = order_items.order_id 
      and orders.user_id = auth.uid()
    )
  );

create policy "order_items_insert_own" on public.order_items 
  for insert with check (
    exists (
      select 1 from public.orders 
      where orders.id = order_items.order_id 
      and orders.user_id = auth.uid()
    )
  );

-- Update profiles table to add more fields
alter table public.profiles 
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists stripe_customer_id text;

-- Update subscriptions table structure
alter table public.subscriptions 
  add column if not exists delivery_day text default 'monday',
  add column if not exists stripe_subscription_id text,
  add column if not exists next_delivery_date date;

-- Create subscription_items table if not exists
create table if not exists public.subscription_items (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  product_id text not null,
  product_name text not null,
  size text not null,
  quantity integer not null default 1,
  price_cents integer not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.subscription_items enable row level security;

create policy "subscription_items_select_own" on public.subscription_items 
  for select using (
    exists (
      select 1 from public.subscriptions 
      where subscriptions.id = subscription_items.subscription_id 
      and subscriptions.user_id = auth.uid()
    )
  );

create policy "subscription_items_insert_own" on public.subscription_items 
  for insert with check (
    exists (
      select 1 from public.subscriptions 
      where subscriptions.id = subscription_items.subscription_id 
      and subscriptions.user_id = auth.uid()
    )
  );

create policy "subscription_items_update_own" on public.subscription_items 
  for update using (
    exists (
      select 1 from public.subscriptions 
      where subscriptions.id = subscription_items.subscription_id 
      and subscriptions.user_id = auth.uid()
    )
  );

create policy "subscription_items_delete_own" on public.subscription_items 
  for delete using (
    exists (
      select 1 from public.subscriptions 
      where subscriptions.id = subscription_items.subscription_id 
      and subscriptions.user_id = auth.uid()
    )
  );
