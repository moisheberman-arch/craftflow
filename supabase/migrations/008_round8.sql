-- Migration 008 — Run in Supabase SQL editor
-- https://app.supabase.com/project/gznxxyegrgcccnfwyexk/sql

-- ── Projects: new columns ──────────────────────────────────────────────────
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS deposit_date timestamptz,
  ADD COLUMN IF NOT EXISTS expected_delivery_start date,
  ADD COLUMN IF NOT EXISTS expected_delivery_end date,
  ADD COLUMN IF NOT EXISTS color_finish text,
  ADD COLUMN IF NOT EXISTS approval_notes jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS queue_position integer,
  ADD COLUMN IF NOT EXISTS width_inches numeric,
  ADD COLUMN IF NOT EXISTS height_inches numeric,
  ADD COLUMN IF NOT EXISTS depth_inches numeric,
  ADD COLUMN IF NOT EXISTS ceiling_height_inches numeric;

-- ── Touchups (idempotent) ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS touchups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  description text NOT NULL,
  assigned_to text,
  address text,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  status text DEFAULT 'open',
  priority text DEFAULT 'normal',
  notes text,
  completed_at timestamptz
);

-- ── Calendar events (idempotent) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  event_date date NOT NULL,
  title text NOT NULL,
  notes text,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  event_type text DEFAULT 'other'
);

-- ── Project type fields ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_type_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  project_type text NOT NULL,
  field_label text NOT NULL,
  field_key text NOT NULL,
  field_type text NOT NULL,
  field_options jsonb DEFAULT '[]',
  affects_price boolean DEFAULT false,
  sequence_order integer DEFAULT 0,
  is_active boolean DEFAULT true
);

-- ── Project type answers ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_type_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  field_id uuid NOT NULL REFERENCES project_type_fields(id) ON DELETE CASCADE,
  answer text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(project_id, field_id)
);

-- ── Seed project_type_fields (skip if already seeded) ────────────────────
INSERT INTO project_type_fields (project_type, field_label, field_key, field_type, field_options, affects_price, sequence_order)
SELECT * FROM (VALUES
  -- Dining Table
  ('dining_table', 'Does the customer want leaves/extensions?', 'wants_leaves', 'yes_no', '[]'::jsonb, true, 1),
  ('dining_table', 'How many leaves?', 'leaf_count', 'number', '[]'::jsonb, true, 2),
  ('dining_table', 'Standard width (42") or extra wide (48"+)?', 'table_width_type', 'dropdown', '["Standard 42\"", "Extra Wide 48\"", "Custom"]'::jsonb, true, 3),
  ('dining_table', 'Number of seats', 'seat_count', 'number', '[]'::jsonb, false, 4),
  -- Built-In
  ('built_in', 'Floor to ceiling or partial height?', 'height_type', 'dropdown', '["Floor to Ceiling", "Partial Height"]'::jsonb, true, 1),
  ('built_in', 'TV recess included?', 'tv_recess', 'yes_no', '[]'::jsonb, true, 2),
  ('built_in', 'Arched openings?', 'arched_openings', 'yes_no', '[]'::jsonb, true, 3),
  ('built_in', 'Number of arched openings', 'arch_count', 'number', '[]'::jsonb, true, 4),
  ('built_in', 'Integrated desk?', 'integrated_desk', 'yes_no', '[]'::jsonb, true, 5),
  -- Bookcase
  ('bookcase', 'Number of bookcase units', 'bookcase_count', 'number', '[]'::jsonb, true, 1),
  ('bookcase', 'Floor to ceiling?', 'floor_to_ceiling', 'yes_no', '[]'::jsonb, true, 2),
  ('bookcase', 'With doors or open shelving?', 'door_type', 'dropdown', '["Open Shelving", "With Doors", "Mixed"]'::jsonb, true, 3),
  -- Bar
  ('bar', 'Base depth — standard or extended?', 'base_depth', 'dropdown', '["Standard 16\"", "Extended 18\"", "Extended 20\"", "Custom"]'::jsonb, true, 1),
  ('bar', 'Upper hutch style', 'hutch_style', 'dropdown', '["Open Shelving", "Arched Center", "Full Hutch", "None"]'::jsonb, true, 2),
  ('bar', 'Glass or mirror backing?', 'backing_type', 'dropdown', '["None", "Glass", "Mirror"]'::jsonb, true, 3),
  -- Buffet
  ('buffet', 'Number of doors', 'door_count', 'number', '[]'::jsonb, true, 1),
  ('buffet', 'Number of drawers', 'drawer_count', 'number', '[]'::jsonb, true, 2),
  ('buffet', 'Hutch on top?', 'has_hutch', 'yes_no', '[]'::jsonb, true, 3),
  -- Desk
  ('desk', 'Pencil drawer?', 'pencil_drawer', 'yes_no', '[]'::jsonb, true, 1),
  ('desk', 'Filing drawers?', 'filing_drawers', 'yes_no', '[]'::jsonb, true, 2),
  ('desk', 'Integrated bookcase?', 'integrated_bookcase', 'yes_no', '[]'::jsonb, true, 3),
  ('desk', 'Desk width (inches)', 'desk_width', 'number', '[]'::jsonb, true, 4)
) AS v(project_type, field_label, field_key, field_type, field_options, affects_price, sequence_order)
WHERE NOT EXISTS (SELECT 1 FROM project_type_fields LIMIT 1);
