-- Run this in the Supabase SQL editor: https://app.supabase.com/project/gznxxyegrgcccnfwyexk/sql

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS requested_addons jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS primary_material text;
