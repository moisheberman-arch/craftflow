-- Run this in the Supabase SQL editor: https://app.supabase.com/project/gznxxyegrgcccnfwyexk/sql

-- customers
CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  name text NOT NULL,
  email text,
  phone text,
  address text
);

-- projects
CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  customer_id uuid REFERENCES customers(id),
  project_type text CHECK (project_type IN ('dining_table','built_in','bookcase','buffet','other')),
  status text CHECK (status IN ('lead','design_meeting_scheduled','rendering','quote_issued','deposit_received','in_production','completed')),
  address text,
  notes text,
  required_fields_completed jsonb DEFAULT '{"customer_info": false, "project_type": false, "color_finish": false, "quote_issued": false}'
);

-- materials_checklist
CREATE TABLE IF NOT EXISTS materials_checklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id),
  item_name text NOT NULL,
  cost_estimate numeric,
  ordered boolean DEFAULT false,
  received boolean DEFAULT false,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- production_steps
CREATE TABLE IF NOT EXISTS production_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id),
  step_name text NOT NULL,
  description text,
  sequence_order integer,
  completed boolean DEFAULT false,
  assigned_to text,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- step_library
CREATE TABLE IF NOT EXISTS step_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  step_name text NOT NULL UNIQUE,
  description text,
  category text CHECK (category IN ('design','sourcing','fabrication','finishing','assembly','installation','delivery')),
  created_at timestamptz DEFAULT now()
);

-- quotes
CREATE TABLE IF NOT EXISTS quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid UNIQUE REFERENCES projects(id),
  ai_conversation_history jsonb DEFAULT '[]',
  base_price numeric,
  add_ons jsonb DEFAULT '[]',
  total_price numeric,
  markup_percentage numeric,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
