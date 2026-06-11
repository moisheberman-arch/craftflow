-- Run this in the Supabase SQL editor

-- ── Suppliers ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  name text NOT NULL,
  contact_name text,
  phone text,
  email text,
  address text,
  website text,
  what_they_supply text,
  categories jsonb DEFAULT '[]'::jsonb,
  notes text
);

CREATE TABLE IF NOT EXISTS supplier_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid REFERENCES suppliers(id) ON DELETE CASCADE,
  material_name text,
  unit text,
  unit_price numeric,
  notes text
);

-- ── Customer Approvals ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  approval_type text,
  token text NOT NULL UNIQUE,
  expires_at timestamptz,
  approved boolean DEFAULT false,
  approved_at timestamptz,
  customer_notes text,
  file_url text,
  sent_at timestamptz
);

-- ── Delivery Photos ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS delivery_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  file_path text NOT NULL,
  file_name text NOT NULL,
  caption text,
  taken_at timestamptz DEFAULT now()
);

-- ── Calendar event time fields ─────────────────────────────────────────────
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS event_time time;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS duration_minutes integer;

-- ── RLS (matches existing open policies) ───────────────────────────────────
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open suppliers" ON suppliers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "open supplier_materials" ON supplier_materials FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "open customer_approvals" ON customer_approvals FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "open delivery_photos" ON delivery_photos FOR ALL USING (true) WITH CHECK (true);
