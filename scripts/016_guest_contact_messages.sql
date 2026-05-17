-- 016_guest_contact_messages.sql
-- Allow guest (unauthenticated) contact form submissions.
-- We make user_id nullable and add a policy permitting anonymous inserts
-- where user_id IS NULL (guests supply their name/email in the body fields).

ALTER TABLE public.messages
  ALTER COLUMN user_id DROP NOT NULL;

-- Allow anyone (anon role) to insert a message as long as user_id is null
-- (i.e. it came from a guest, not a logged-in user spoofing another's id).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'messages'
      AND policyname = 'messages_insert_guest'
  ) THEN
    CREATE POLICY messages_insert_guest ON public.messages
      FOR INSERT
      WITH CHECK (user_id IS NULL);
  END IF;
END $$;