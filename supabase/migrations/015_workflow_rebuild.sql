-- Run this in the Supabase SQL editor
--
-- Workflow rebuild: Status + Tasks model replacing production_steps.
-- The old production_steps / step_library / step_subtasks tables are left
-- in place — the new system runs alongside them.

-- ── workflow_statuses ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workflow_statuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  name text NOT NULL,
  sequence_order integer NOT NULL UNIQUE,
  description text,
  color text,                  -- hex color for UI display
  is_active boolean DEFAULT true
);

-- ── workflow_tasks (templates per status) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS workflow_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  status_id uuid REFERENCES workflow_statuses(id) ON DELETE CASCADE,
  task_name text NOT NULL,
  is_mandatory boolean DEFAULT true,
  owned_by text NOT NULL,      -- sales · shop
  sequence_order integer DEFAULT 0,
  has_print_action boolean DEFAULT false,
  print_label text,
  is_active boolean DEFAULT true
);

-- ── project_workflow (current status per project) ───────────────────────────
CREATE TABLE IF NOT EXISTS project_workflow (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  project_id uuid UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
  current_status_id uuid REFERENCES workflow_statuses(id),
  entered_current_status_at timestamptz DEFAULT now(),
  previous_status_id uuid REFERENCES workflow_statuses(id),
  override_used boolean DEFAULT false,
  override_reason text
);

-- ── project_status_history (audit log) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  from_status_id uuid REFERENCES workflow_statuses(id),
  to_status_id uuid REFERENCES workflow_statuses(id),
  advanced_at timestamptz DEFAULT now(),
  override_used boolean DEFAULT false,
  override_reason text,
  rejection boolean DEFAULT false,
  rejection_reason text
);

-- ── project_tasks (task instances per project per status) ───────────────────
CREATE TABLE IF NOT EXISTS project_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  workflow_task_id uuid REFERENCES workflow_tasks(id),  -- null for adhoc tasks
  status_id uuid REFERENCES workflow_statuses(id),
  task_name text NOT NULL,
  is_mandatory boolean DEFAULT true,
  owned_by text NOT NULL,      -- sales · shop
  is_adhoc boolean DEFAULT false,
  completed boolean DEFAULT false,
  completed_at timestamptz,
  has_print_action boolean DEFAULT false,
  print_label text
);

-- ── RLS (matches existing open policies) ────────────────────────────────────
ALTER TABLE workflow_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_workflow ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open workflow_statuses" ON workflow_statuses FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "open workflow_tasks" ON workflow_tasks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "open project_workflow" ON project_workflow FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "open project_status_history" ON project_status_history FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "open project_tasks" ON project_tasks FOR ALL USING (true) WITH CHECK (true);

-- ── Seed: 8 workflow statuses ────────────────────────────────────────────────
INSERT INTO workflow_statuses (sequence_order, name, color, description)
SELECT v.seq, v.name, v.color, v.descr
FROM (VALUES
  (1, 'Active Project',               '#2E86AB', 'Deposit received, design and planning underway'),
  (2, 'Waiting for Sketch Approval',  '#8E44AD', 'Sketch sent to customer, awaiting approval'),
  (3, 'Ready for Production',         '#F39C12', 'Approved and ready, materials being finalized'),
  (4, 'In Production',                '#27AE60', 'Being built in the shop'),
  (5, 'Ready for Paint / Stain',      '#E67E22', 'Construction complete, going to paint'),
  (6, 'In Paint Shop',                '#E74C3C', 'At the paint shop'),
  (7, 'Ready for Delivery',           '#16A085', 'Complete, scheduling delivery'),
  (8, 'Delivered',                    '#2ECC71', 'Delivered and installed')
) AS v(seq, name, color, descr)
WHERE NOT EXISTS (SELECT 1 FROM workflow_statuses ws WHERE ws.sequence_order = v.seq);

-- ── Seed: workflow tasks per status ──────────────────────────────────────────
-- Statuses 4 (In Production) and 6 (In Paint Shop) intentionally have no tasks.
INSERT INTO workflow_tasks (status_id, task_name, is_mandatory, owned_by, sequence_order, has_print_action, print_label)
SELECT ws.id, v.task_name, v.is_mandatory, v.owned_by, v.seq, v.has_print, v.print_label
FROM (VALUES
  -- Status 1 — Active Project
  (1, 'Schedule design meeting if needed',                       false, 'shop',  1, false, NULL::text),
  (1, 'Create sketch / design',                                  true,  'shop',  2, false, NULL),
  (1, 'Confirm measurements',                                    false, 'shop',  3, false, NULL),
  -- Status 2 — Waiting for Sketch Approval
  (2, 'Send sketch to customer',                                 true,  'sales', 1, false, NULL),
  (2, 'Follow up with customer if no response after 3 days',     false, 'sales', 2, false, NULL),
  -- Status 3 — Ready for Production
  (3, 'Confirm all materials ordered',                           true,  'shop',  1, false, NULL),
  (3, 'Finalize color / finish with customer',                   true,  'sales', 2, false, NULL),
  (3, 'Confirm hardware selection',                              true,  'shop',  3, false, NULL),
  (3, 'Verify all measurements are locked in',                   true,  'shop',  4, false, NULL),
  (3, 'Confirm rendering approved',                              false, 'sales', 5, false, NULL),
  -- Status 5 — Ready for Paint / Stain
  (5, 'Print stain / paint color label',                         true,  'shop',  1, true,  'Print color label for paint shop'),
  (5, 'Submit color specs to paint shop',                        true,  'shop',  2, false, NULL),
  (5, 'Schedule drop-off at paint shop',                         true,  'shop',  3, false, NULL),
  -- Status 7 — Ready for Delivery
  (7, 'Confirm customer payment is up to date',                  true,  'sales', 1, false, NULL),
  (7, 'Schedule delivery date with customer',                    true,  'sales', 2, false, NULL),
  (7, 'Quality check — inspect all joints and finish',           true,  'shop',  3, false, NULL),
  (7, 'Quality check — test all hardware and drawers',           true,  'shop',  4, false, NULL),
  (7, 'Confirm all hardware installed',                          true,  'shop',  5, false, NULL),
  (7, 'Confirm installer availability',                          false, 'shop',  6, false, NULL),
  -- Status 8 — Delivered
  (8, 'Upload delivery photos',                                  false, 'shop',  1, false, NULL),
  (8, 'Get customer sign-off',                                   false, 'sales', 2, false, NULL)
) AS v(status_seq, task_name, is_mandatory, owned_by, seq, has_print, print_label)
JOIN workflow_statuses ws ON ws.sequence_order = v.status_seq
WHERE NOT EXISTS (
  SELECT 1 FROM workflow_tasks wt WHERE wt.status_id = ws.id AND wt.task_name = v.task_name
);
