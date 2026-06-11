-- Run this in the Supabase SQL editor

-- ── Samples given to customers ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS samples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES customers(id) ON DELETE CASCADE,
  sample_type text,            -- wood_species · stain_color · paint_color · hardware · other
  description text NOT NULL,   -- e.g. "Walnut stain — medium brown", "BM White Dove paint chip"
  date_given date NOT NULL,
  checked_in boolean DEFAULT false,
  checked_in_date date,
  notes text
);

-- ── RLS (matches existing open policies) ───────────────────────────────────
ALTER TABLE samples ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open samples" ON samples FOR ALL USING (true) WITH CHECK (true);
