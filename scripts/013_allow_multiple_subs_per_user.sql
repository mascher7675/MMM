-- Migration: 012_allow_multiple_subscriptions_per_user
-- Allow multiple subscriptions per user by dropping the unique constraint
ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_user_id_key;
 
-- Add a regular index for performance (querying by user_id is still very common)
CREATE INDEX IF NOT EXISTS subscriptions_user_id_idx ON public.subscriptions (user_id);