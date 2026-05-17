-- Drop old subscriptions table and recreate with proper structure
drop table if exists public.subscriptions cascade;

-- Update profiles table with proper columns
alter table public.profiles 
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists delivery_instructions text;

-- Update trigger to use first_name and last_name
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, first_name, last_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'first_name', null),
    coalesce(new.raw_user_meta_data ->> 'last_name', null)
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- Create subscriptions table
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'paused', 'cancelled')),
  delivery_day text not null check (delivery_day in ('monday', 'tuesday', 'wednesday', 'thursday', 'friday')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(user_id)
);

alter table public.subscriptions enable row level security;

create policy "subscriptions_select_own" on public.subscriptions for select using (auth.uid() = user_id);
create policy "subscriptions_insert_own" on public.subscriptions for insert with check (auth.uid() = user_id);
create policy "subscriptions_update_own" on public.subscriptions for update using (auth.uid() = user_id);
create policy "subscriptions_delete_own" on public.subscriptions for delete using (auth.uid() = user_id);

-- Create subscription_items table for milk selections
create table if not exists public.subscription_items (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  milk_type text not null check (milk_type in ('oat', 'almond', 'hemp')),
  quantity integer not null default 1 check (quantity > 0 and quantity <= 10),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.subscription_items enable row level security;

-- Subscription items policies need to check through subscription ownership
create policy "subscription_items_select" on public.subscription_items 
  for select using (
    exists (
      select 1 from public.subscriptions 
      where subscriptions.id = subscription_items.subscription_id 
      and subscriptions.user_id = auth.uid()
    )
  );

create policy "subscription_items_insert" on public.subscription_items 
  for insert with check (
    exists (
      select 1 from public.subscriptions 
      where subscriptions.id = subscription_items.subscription_id 
      and subscriptions.user_id = auth.uid()
    )
  );

create policy "subscription_items_update" on public.subscription_items 
  for update using (
    exists (
      select 1 from public.subscriptions 
      where subscriptions.id = subscription_items.subscription_id 
      and subscriptions.user_id = auth.uid()
    )
  );

create policy "subscription_items_delete" on public.subscription_items 
  for delete using (
    exists (
      select 1 from public.subscriptions 
      where subscriptions.id = subscription_items.subscription_id 
      and subscriptions.user_id = auth.uid()
    )
  );
