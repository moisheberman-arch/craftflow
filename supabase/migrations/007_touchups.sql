-- Run in Supabase SQL editor: https://app.supabase.com/project/gznxxyegrgcccnfwyexk/sql

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
