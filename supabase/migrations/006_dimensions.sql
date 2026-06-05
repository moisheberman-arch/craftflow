-- Run this in the Supabase SQL editor: https://app.supabase.com/project/gznxxyegrgcccnfwyexk/sql

-- ── Dimension columns on projects ─────────────────────────────────────────
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS width_inches numeric,
  ADD COLUMN IF NOT EXISTS height_inches numeric,
  ADD COLUMN IF NOT EXISTS depth_inches numeric,
  ADD COLUMN IF NOT EXISTS ceiling_height_inches numeric;

-- ── Calendar events ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  event_date date NOT NULL,
  title text NOT NULL,
  notes text,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  event_type text DEFAULT 'other'
);
