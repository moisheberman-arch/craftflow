-- Run this in the Supabase SQL editor: https://app.supabase.com/project/gznxxyegrgcccnfwyexk/sql

-- pricing_materials
CREATE TABLE IF NOT EXISTS pricing_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  name text NOT NULL,
  unit text,
  unit_price numeric,
  typical_flat_rate numeric,
  category text CHECK (category IN ('wood','hardware','finish','trim','lighting','other')),
  notes text
);

-- pricing_addons
CREATE TABLE IF NOT EXISTS pricing_addons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  name text NOT NULL,
  unit text,
  unit_price numeric,
  typical_flat_rate numeric,
  notes text
);

-- design_meeting_notes
CREATE TABLE IF NOT EXISTS design_meeting_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id),
  created_at timestamptz DEFAULT now(),
  notes text NOT NULL,
  attachments jsonb DEFAULT '[]'
);

-- Add new columns to quotes table
ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'initial',
  ADD COLUMN IF NOT EXISTS scope_of_work text,
  ADD COLUMN IF NOT EXISTS complexity_assessment text,
  ADD COLUMN IF NOT EXISTS version integer DEFAULT 1;

-- Seed pricing_materials
INSERT INTO pricing_materials (name, category, unit, unit_price, typical_flat_rate) VALUES
  ('Maple Plywood 3/4 inch',    'wood',     'per sheet',           120,  NULL),
  ('Walnut Plywood 3/4 inch',   'wood',     'per sheet',           180,  NULL),
  ('Hardwood Trim',              'wood',     'per linear foot',       8,  NULL),
  ('Crown Molding',              'trim',     'per linear foot',      12,  NULL),
  ('Base Molding',               'trim',     'per linear foot',       8,  NULL),
  ('Soft-Close Drawer Slides',  'hardware', 'per pair',             25,  NULL),
  ('Soft-Close Hinges',         'hardware', 'per unit',              8,  NULL),
  ('Cabinet Pulls',             'hardware', 'per unit',             15,  NULL),
  ('Paint/Primer',              'finish',   'per gallon',           60,  NULL),
  ('Stain',                     'finish',   'per gallon',           50,  NULL),
  ('Strip Lighting',            'lighting', 'per linear foot',      18,  NULL),
  ('Shop Supplies (misc)',      'other',    'flat rate',           NULL, 200)
ON CONFLICT DO NOTHING;

-- Seed pricing_addons
INSERT INTO pricing_addons (name, unit, unit_price, typical_flat_rate) VALUES
  ('Gold Inlay',               'per linear foot', 10,   500),
  ('Fluting',                  'per linear foot', 10,   NULL),
  ('Arched Opening',           'per opening',     NULL, 400),
  ('Glass Door Panels',        'per door',        NULL, 150),
  ('Integrated Desk',          'flat rate',       NULL, 800),
  ('Pencil Drawer',            'flat rate',       NULL, 200),
  ('TV Recess/Surround',       'flat rate',       NULL, 600),
  ('Delivery and Installation','flat rate',       NULL, 1500)
ON CONFLICT DO NOTHING;

-- Seed step_library (12 default production steps)
INSERT INTO step_library (step_name, category) VALUES
  ('Shop drawings / rendering approved',    'design'),
  ('Materials sourced and received',         'sourcing'),
  ('Wood milling and prep',                  'fabrication'),
  ('Carcass / frame construction',           'fabrication'),
  ('Door and drawer fitting',                'fabrication'),
  ('Finish color confirmed with customer',   'finishing'),
  ('Paint / stain applied — coat 1',         'finishing'),
  ('Paint / stain applied — coat 2',         'finishing'),
  ('Hardware installed',                     'assembly'),
  ('Quality check',                          'assembly'),
  ('Delivery scheduled',                     'delivery'),
  ('Delivery and installation complete',     'delivery')
ON CONFLICT (step_name) DO NOTHING;
