-- ============================================================
-- Debt Tracker v2 — Multi-user schema migration
-- Run in Supabase SQL Editor (Project → SQL Editor → New Query)
-- ============================================================

-- 1. Drop old single-user RLS policy
DROP POLICY IF EXISTS "anon_all" ON kv_store;

-- 2. Add user_id column (nullable first for safety)
ALTER TABLE kv_store ADD COLUMN IF NOT EXISTS
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- 3. Recreate primary key as composite (user_id, key)
--    First drop old PK
ALTER TABLE kv_store DROP CONSTRAINT IF EXISTS kv_store_pkey;

-- 4. New composite PK
ALTER TABLE kv_store ADD PRIMARY KEY (user_id, key);

-- 5. Enable RLS (already on, but ensure)
ALTER TABLE kv_store ENABLE ROW LEVEL SECURITY;

-- 6. Authenticated users see ONLY their own rows
CREATE POLICY "users_own_data" ON kv_store
  FOR ALL
  TO authenticated
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 7. Service role (edge function) bypasses RLS automatically — no policy needed

-- 8. Verify
SELECT * FROM kv_store LIMIT 5;
