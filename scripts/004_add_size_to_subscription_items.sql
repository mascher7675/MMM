-- Add size column to subscription_items
ALTER TABLE subscription_items 
ADD COLUMN IF NOT EXISTS size text NOT NULL DEFAULT '16oz';

-- Update existing items to have a default size
UPDATE subscription_items SET size = '16oz' WHERE size IS NULL;
