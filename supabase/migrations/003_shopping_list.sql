-- Run this in the Supabase SQL editor: https://app.supabase.com/project/gznxxyegrgcccnfwyexk/sql

CREATE TABLE IF NOT EXISTS shopping_list (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  item text NOT NULL,
  purchased boolean DEFAULT false,
  notes text
);
