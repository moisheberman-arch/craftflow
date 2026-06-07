-- Migration 010: Step-linked suggested sub-tasks

ALTER TABLE step_library ADD COLUMN IF NOT EXISTS suggested_subtasks jsonb DEFAULT '[]'::jsonb;

UPDATE step_library SET suggested_subtasks = '["Call customer to schedule site visit"]'::jsonb
  WHERE step_name = 'Schedule Measurements / Site Visit';

UPDATE step_library SET suggested_subtasks = '["Send sketch to customer"]'::jsonb
  WHERE step_name = 'Waiting: Customer Approval on Sketch';

UPDATE step_library SET suggested_subtasks = '["Send rendering to customer"]'::jsonb
  WHERE step_name = 'Waiting: Customer Approval on Rendering';

UPDATE step_library SET suggested_subtasks = '["Place material order with supplier"]'::jsonb
  WHERE step_name = 'Order Materials / Supplies';

UPDATE step_library SET suggested_subtasks = '["Follow up with supplier on ETA"]'::jsonb
  WHERE step_name = 'Waiting: Materials to Arrive';

UPDATE step_library SET suggested_subtasks = '["Submit color specs to paint shop", "Schedule drop-off at paint shop"]'::jsonb
  WHERE step_name = 'Ready for Paint / Stain';

UPDATE step_library SET suggested_subtasks = '["Inspect all joints and finish", "Test all hardware", "Check all drawers and doors"]'::jsonb
  WHERE step_name = 'Quality Check';

UPDATE step_library SET suggested_subtasks = '["Schedule delivery date with customer", "Confirm installer availability"]'::jsonb
  WHERE step_name = 'Ready for Delivery / Pickup';

UPDATE step_library SET suggested_subtasks = '["Confirm delivery address", "Prepare delivery checklist"]'::jsonb
  WHERE step_name = 'Delivery / Installation Scheduled';
