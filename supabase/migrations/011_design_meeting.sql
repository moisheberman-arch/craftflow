-- Run this in the Supabase SQL editor

-- FIX 7: design meeting request flow
ALTER TABLE projects ADD COLUMN IF NOT EXISTS design_meeting_requested boolean DEFAULT false;
