-- Run this in the Supabase SQL editor: https://app.supabase.com/project/gznxxyegrgcccnfwyexk/sql

-- ── production_steps: new columns ─────────────────────────────────────────
ALTER TABLE production_steps
  ADD COLUMN IF NOT EXISTS step_type text DEFAULT 'action',
  ADD COLUMN IF NOT EXISTS waiting_on text,
  ADD COLUMN IF NOT EXISTS is_current boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_optional boolean DEFAULT false;

-- ── step_subtasks ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS step_subtasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  step_id uuid REFERENCES production_steps(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  description text NOT NULL,
  completed boolean DEFAULT false
);

-- ── open_questions ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS open_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  step_id uuid REFERENCES production_steps(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  question text NOT NULL,
  directed_at text,
  resolved boolean DEFAULT false,
  resolved_at timestamptz,
  answer text
);

-- ── step_library: new columns ─────────────────────────────────────────────
ALTER TABLE step_library
  ADD COLUMN IF NOT EXISTS step_type text DEFAULT 'action',
  ADD COLUMN IF NOT EXISTS waiting_on text,
  ADD COLUMN IF NOT EXISTS is_optional boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS sequence_order integer;

-- ── projects: queue_position for drag-to-reorder ─────────────────────────
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS queue_position integer;

-- ── Drop and recreate category check to include 'admin' ──────────────────
ALTER TABLE step_library DROP CONSTRAINT IF EXISTS step_library_category_check;
ALTER TABLE step_library ADD CONSTRAINT step_library_category_check
  CHECK (category IN ('admin','design','sourcing','fabrication','finishing','assembly','installation','delivery'));

-- ── Re-seed step_library ──────────────────────────────────────────────────
DELETE FROM step_library;

INSERT INTO step_library (sequence_order, step_name, category, step_type, waiting_on, is_optional) VALUES
  (1,  'Deposit Received',                       'admin',       'action',  NULL,       false),
  (2,  'Schedule Measurements / Site Visit',     'design',      'action',  NULL,       true),
  (3,  'Measurements Taken',                     'design',      'action',  NULL,       true),
  (4,  'Create Sketch / Design',                 'design',      'action',  NULL,       false),
  (5,  'Waiting: Customer Approval on Sketch',   'design',      'waiting', 'customer', false),
  (6,  'Create Rendering',                       'design',      'action',  NULL,       false),
  (7,  'Waiting: Customer Approval on Rendering','design',      'waiting', 'customer', false),
  (8,  'Order Materials / Supplies',             'sourcing',    'action',  NULL,       false),
  (9,  'Waiting: Materials to Arrive',           'sourcing',    'waiting', 'supplier', false),
  (10, 'Materials Received',                     'sourcing',    'action',  NULL,       false),
  (11, 'Ready for Production — In Queue',        'fabrication', 'waiting', 'internal', false),
  (12, 'Production Started',                     'fabrication', 'action',  NULL,       false),
  (13, 'In Production',                          'fabrication', 'action',  NULL,       false),
  (14, 'Ready for Paint / Stain',               'finishing',   'action',  NULL,       false),
  (15, 'In Paint Shop',                          'finishing',   'action',  NULL,       false),
  (16, 'Quality Check',                          'finishing',   'action',  NULL,       false),
  (17, 'Ready for Delivery / Pickup',            'delivery',    'action',  NULL,       false),
  (18, 'Delivery / Installation Scheduled',      'delivery',    'waiting', 'customer', false),
  (19, 'Delivered and Installed',                'delivery',    'action',  NULL,       false);
