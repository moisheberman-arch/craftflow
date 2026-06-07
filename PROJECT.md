# CraftFlow — Project Documentation

## Project Overview

CraftFlow is a production and sales management platform for a custom woodworking and millwork shop. It manages the full project lifecycle from initial lead capture through final delivery, with two distinct dashboard views:

- **Sales View** — for the sales team: lead tracking, quote generation, customer preferences, pipeline management
- **Shop View** — for the shop floor: production step tracking, materials, open questions, scheduling, and field jobs

Primary users are the shop owner and any sales or production staff. The app is optimized for daily use on a desktop browser during the workday.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router, TypeScript) |
| Styling | Tailwind CSS (dark theme, gray-950 base) |
| Database | Supabase (PostgreSQL, via `@supabase/supabase-js`) |
| Auth | Supabase Auth (email/password, server-side session check) |
| AI | OpenAI GPT-4o via REST (`/api/quote-agent`) |
| Deployment | Vercel (auto-deploy on push to `master`) |
| State | React local state + async Supabase calls (no global store) |

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `OPENAI_API_KEY` | OpenAI API key (server-side only, set in Vercel) |

---

## Database Schema

### `customers`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| name | text | |
| email | text | nullable |
| phone | text | nullable |
| address | text | nullable |
| created_at | timestamptz | |

### `projects`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| customer_id | uuid FK → customers | nullable |
| project_type | text | dining_table, built_in, bookcase, buffet, bar, desk, other |
| status | text | see ProjectStatus enum |
| address | text | job site address |
| notes | text | |
| required_fields_completed | jsonb | {customer_info, project_type, color_finish, quote_issued} |
| queue_position | integer | for drag-to-reorder |
| requested_addons | jsonb | array of addon IDs |
| primary_material | text | e.g. "Maple", "Walnut" |
| width_inches | numeric | |
| height_inches | numeric | |
| depth_inches | numeric | |
| ceiling_height_inches | numeric | for built-ins/bookcases |
| color_finish | text | e.g. "BM White Dove" |
| deposit_date | timestamptz | auto-set when status → deposit_received |
| expected_delivery_start | date | auto-set to +8 weeks from deposit |
| expected_delivery_end | date | auto-set to +10 weeks from deposit |
| approval_notes | jsonb | step-specific approval data |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**ProjectStatus values:** lead · tentative_quote_sent · design_meeting_scheduled · post_design_meeting · rendering_in_progress · final_quote_issued · deposit_received · in_production · completed

### `production_steps`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| project_id | uuid FK → projects CASCADE | |
| step_name | text | |
| description | text | nullable |
| sequence_order | integer | |
| completed | boolean | |
| assigned_to | text | nullable |
| notes | text | nullable |
| step_type | text | action · waiting |
| waiting_on | text | customer · supplier · designer · internal |
| is_current | boolean | only one step is current at a time |
| is_optional | boolean | |
| created_at | timestamptz | |

### `step_library`
Template steps that can be seeded into new projects. Same shape as production_steps minus project_id.

### `step_subtasks`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| step_id | uuid FK → production_steps CASCADE | |
| project_id | uuid FK → projects CASCADE | |
| description | text | |
| completed | boolean | |
| created_at | timestamptz | |

### `open_questions`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| project_id | uuid FK → projects CASCADE | |
| step_id | uuid FK → production_steps | nullable |
| question | text | |
| directed_at | text | customer · internal |
| resolved | boolean | |
| resolved_at | timestamptz | nullable |
| answer | text | nullable |
| created_at | timestamptz | |

### `materials_checklist`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| project_id | uuid FK → projects CASCADE | |
| item_name | text | |
| cost_estimate | numeric | nullable |
| ordered | boolean | |
| received | boolean | |
| notes | text | nullable |
| created_at | timestamptz | |

### `quotes`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| project_id | uuid FK (unique) | |
| ai_conversation_history | jsonb | array of AIMessage |
| base_price | numeric | nullable |
| add_ons | jsonb | array of {name, price} |
| total_price | numeric | nullable |
| markup_percentage | numeric | nullable |
| status | text | initial · revised · final |
| scope_of_work | text | nullable |
| complexity_assessment | text | nullable |
| version | integer | increments on revision |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### `pricing_materials`
Pre-loaded pricing database (12 standard entries). Columns: id, name, unit, unit_price, typical_flat_rate, category, notes.

### `pricing_addons`
Pre-loaded add-ons (8 standard entries). Columns: id, name, unit, unit_price, typical_flat_rate, notes.

### `design_meeting_notes`
id, project_id FK CASCADE, notes text, attachments jsonb, created_at.

### `shopping_list`
id, project_id FK CASCADE, item text, purchased boolean, notes text, created_at.

### `touchups`
Field jobs and touch-up tasks not tied to a specific project step.
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| description | text | required |
| assigned_to | text | nullable |
| address | text | nullable |
| project_id | uuid FK SET NULL | nullable |
| customer_id | uuid FK SET NULL | nullable |
| status | text | open · in_progress · done |
| priority | text | normal · urgent |
| notes | text | nullable |
| completed_at | timestamptz | nullable |
| created_at · updated_at | timestamptz | |

### `calendar_events`
id, event_date date, title text, notes text, project_id FK SET NULL, event_type text (appointment·reminder·milestone·other), created_at.

### `project_type_fields`
Configurable per-project-type data capture fields.
| Column | Type | Notes |
|--------|------|-------|
| project_type | text | dining_table, built_in, etc. |
| field_label | text | display label |
| field_key | text | snake_case key |
| field_type | text | yes_no · number · dropdown · text |
| field_options | jsonb | array of strings, for dropdown type |
| affects_price | boolean | shows $ indicator in UI |
| sequence_order | integer | |
| is_active | boolean | toggle to hide without deleting |

### `project_type_answers`
id, project_id FK CASCADE, field_id FK CASCADE, answer text, created_at. UNIQUE(project_id, field_id).

---

## API Functions (`lib/api/supabase-client.ts`)

### Customers
- `getCustomers()` — all customers ordered by name
- `getCustomerById(id)` — single customer
- `createCustomer(input)` — insert
- `updateCustomer(id, input)` — update
- `getProjectCountByCustomerId(id)` — count for delete guard
- `deleteCustomer(id)` — delete

### Projects
- `getProjects()` — all projects with joined customer, ordered by updated_at
- `getProjectById(id)` — single project with customer join
- `getProjectsByCustomerId(id)` — projects for a customer
- `createProject(input)` — insert
- `updateProject(id, input)` — update; auto-sets deposit_date/delivery window when status → deposit_received
- `seedDefaultStepsIfEmpty(projectId)` — seeds 19 steps from step_library on first deposit_received
- `deleteProject(id)` — cascades related records
- `deleteCustomer(id)` — deletes customer record

### Materials
- `getMaterialsByProjectId(id)` — ordered by created_at
- `addMaterial(input)` · `updateMaterial(id, input)` · `deleteMaterial(id)`

### Production Steps
- `getStepsByProjectId(id)` — ordered by sequence_order
- `addStep(input)` · `updateStep(id, input)` · `deleteStep(id)`
- `reorderSteps(projectId, orderedIds)` — bulk reorder
- `setCurrentStep(projectId, stepId)` — clears all is_current, sets one
- `autoAdvanceCurrentStep(projectId, completedStepId)` — marks complete, advances to next

### Step Library
- `getStepLibrary()` · `addStepToLibrary(input)`

### Subtasks
- `getSubtasksByStepId(stepId)` · `getSubtasksByProjectId(projectId)`
- `addSubtask(stepId, projectId, description)` · `updateSubtask(id, input)` · `deleteSubtask(id)`

### Open Questions
- `getOpenQuestionsByProjectId(id)` · `getUnresolvedQuestionsAllProjects()`
- `addOpenQuestion(projectId, question, directedAt, stepId?)` · `resolveQuestion(id, answer)` · `deleteQuestion(id)`

### Quotes
- `getQuoteByProjectId(id)` · `getFinalizedQuotes(limit?)` · `createQuote(input)` · `updateQuote(id, input)` · `appendAIMessage(quoteId, message)`

### Pricing
- `getPricingMaterials()` · `addPricingMaterial()` · `updatePricingMaterial()` · `deletePricingMaterial()`
- `getPricingAddons()` · `addPricingAddon()` · `updatePricingAddon()` · `deletePricingAddon()`

### Design Notes
- `getNotesByProjectId(id)` · `addDesignMeetingNote(projectId, notes)` · `deleteNote(id)`

### Shopping List
- `getShoppingListByProjectId(id)` · `getAllUnpurchasedShoppingItems()`
- `addShoppingListItem(projectId, item, notes?)` · `updateShoppingListItem(id, input)` · `deleteShoppingListItem(id)`

### Calendar Events
- `getCalendarEvents(month, year)` · `addCalendarEvent(input)` · `updateCalendarEvent(id, input)` · `deleteCalendarEvent(id)`

### Touchups
- `getTouchups()` · `getTouchupsByStatus(status)` · `getOpenTouchups()` (open + in_progress)
- `createTouchup(input)` · `updateTouchup(id, input)` · `deleteTouchup(id)`

### Project Type Fields
- `getFieldsByProjectType(projectType)` — active fields only, ordered
- `getAllProjectTypeFields()` — all fields for admin
- `addProjectTypeField(input)` · `updateProjectTypeField(id, input)` · `deleteProjectTypeField(id)`
- `reorderProjectTypeFields(projectType, orderedIds)` — drag-to-reorder

### Project Type Answers
- `getAnswersByProjectId(projectId)` — all answers for a project
- `saveAnswer(projectId, fieldId, answer)` — upsert single answer
- `saveAllAnswers(projectId, answers[])` — upsert batch

### Shop Dashboard
- `getShopTaskProjects()` — enriched projects with current step, subtask count, question count, step age

---

## Page Routes

| Route | View | Description |
|-------|------|-------------|
| `/dashboard/sales` | Sales | Pipeline dashboard, 3-column project card grid grouped by status |
| `/dashboard/shop` | Shop | Compact drag-to-reorder production list + queue |
| `/dashboard/shop/tasks` | Shop | Task dashboard: Action Required / Waiting On / Open Touch-Ups + calendar |
| `/dashboard/shop/shopping-list` | Shop | Cross-project shopping list |
| `/dashboard/projects/[id]?view=sales` | Sales | Project detail: overview, materials, quote tabs |
| `/dashboard/projects/[id]?view=shop` | Shop | Full-screen shop view: step tracking, questions, materials, key details |
| `/dashboard/projects/[id]/print` | Both | Printable job sheet (7 sections, no navbar) |
| `/dashboard/projects/[id]/quote-agent` | Sales | AI quote negotiation interface |
| `/dashboard/touchups` | Both | Touch-ups & field jobs with urgent/normal/completed sections |
| `/dashboard/touchups/[id]/print` | Both | Printable touch-up card |
| `/dashboard/master` | Both | Master Doc — full business snapshot, all active data |
| `/dashboard/customers` | Sales | Customer list (via modal on sales dashboard) |
| `/dashboard/settings/pricing` | Both | Pricing materials and add-ons config |
| `/dashboard/settings/project-types` | Both | Project type field config (per-type dynamic fields) |

---

## Key Architectural Decisions

### Dual-View Architecture
A single project record is viewed through two lenses — Sales and Shop — controlled by `?view=sales` or `?view=shop` query param. The Sales view shows pipeline/quote/materials tabs. The Shop view (`ShopView.tsx`) is a full-screen production-focused layout. Same URL, same data, different UI emphasis.

### Step Library + Auto-Seeding
When a project status changes to `deposit_received`, the 19-step production workflow is automatically seeded from `step_library` into `production_steps`. This ensures every project starts with a complete, standardized checklist. Custom steps can be added; library steps are templates only.

### AI Quote Agent
The quote agent sends the full conversation history plus project details (including project-type-specific field answers) to GPT-4o. The system prompt embeds the shop's pricing config (from `pricing_materials` and `pricing_addons`) and recent finalized quotes as calibration examples. The AI parses `FINAL PRICE: $X,XXX` and `STATUS: FINAL` from responses to auto-update the quote record.

### Deposit Date Auto-Logging
When `updateProject` receives `status: 'deposit_received'`, it automatically adds `deposit_date = now()`, `expected_delivery_start = +56 days`, `expected_delivery_end = +70 days`. This happens in the API layer so it works regardless of which UI triggers the status change.

### Project Type Fields (Dynamic Form System)
`project_type_fields` stores configurable per-type questions (e.g. "wants leaves?" for dining tables). Answers are saved to `project_type_answers` with upsert. These answers are shown in the Sales overview, included in the print job sheet, and passed to the AI quote agent as context.

### No Real-Time Subscriptions
Data is fetched once on page load. Mutations update local React state optimistically. There are no Supabase realtime subscriptions — page refresh or explicit re-fetch shows latest data from other users.

---

## Workflow

### Sales Flow (Lead → Deposit)
1. New lead created in Sales dashboard
2. Design meeting scheduled → notes recorded on project detail
3. Quote generated via AI quote agent (pricing config + past quotes as context)
4. Final quote issued → deposit received
5. On deposit: status auto-advances, deposit date + delivery window set, 19 production steps seeded

### Shop Flow (Deposit → Delivery)
1. Project appears in Shop dashboard queue
2. Shop drags to set priority order, clicks "Start Production"
3. Each step tracked: mark complete → auto-advances to next step
4. Step-specific data capture: measurements, finish color, approvals inline
5. Open questions tracked per step/project; resolved with answers
6. Materials ordered/received tracked per checklist item
7. All steps complete → project marked `completed`

### Handoff Trigger
Status change to `deposit_received` is the handoff from Sales to Shop. It triggers step seeding and delivery window calculation automatically.

---

## Backlog

- [ ] Parallel step support (steps that can run concurrently, not just sequential)
- [ ] Customer-facing portal (approve renderings, answer questions online)
- [ ] Photo attachments on design meeting notes and steps
- [ ] Email notifications for customer questions and approvals
- [ ] Invoice generation from finalized quotes
- [ ] Time tracking per step (clock in/out for labor cost analysis)
- [ ] Multi-user roles (sales rep vs shop staff permissions)
- [ ] Mobile-optimized shop view for use on shop floor tablets
- [ ] Recurring maintenance reminders for delivered projects
- [ ] QuickBooks / accounting integration for deposit tracking
