export interface ContactPreferences {
  call?: boolean
  text?: boolean
  whatsapp?: boolean
}

export interface Customer {
  id: string
  created_at: string
  name: string
  email: string | null
  phone: string | null
  address: string | null
  contact_preferences?: ContactPreferences
}

export type ProjectType = 'dining_table' | 'built_in' | 'bookcase' | 'buffet' | 'bar' | 'desk' | 'other'
export type ProjectStatus =
  | 'lead'
  | 'tentative_quote_sent'
  | 'design_meeting_scheduled'
  | 'post_design_meeting'
  | 'rendering_in_progress'
  | 'final_quote_issued'
  | 'deposit_received'
  | 'in_production'
  | 'ready_for_delivery'
  | 'completed'

export interface RequiredFieldsCompleted {
  customer_info: boolean
  project_type: boolean
  color_finish: boolean
  quote_issued: boolean
}

export interface Project {
  id: string
  created_at: string
  updated_at: string
  customer_id: string | null
  project_type: ProjectType | null
  status: ProjectStatus | null
  address: string | null
  notes: string | null
  required_fields_completed: RequiredFieldsCompleted
  queue_position?: number | null
  requested_addons?: string[]
  primary_material?: string | null
  width_inches?: number | null
  height_inches?: number | null
  depth_inches?: number | null
  ceiling_height_inches?: number | null
  color_finish?: string | null
  deposit_date?: string | null
  expected_delivery_start?: string | null
  expected_delivery_end?: string | null
  approval_notes?: Record<string, unknown> | null
  design_meeting_requested?: boolean
  customer?: Customer
}

export type ProjectTypeFieldType = 'yes_no' | 'number' | 'dropdown' | 'text'

export interface ProjectTypeField {
  id: string
  created_at: string
  project_type: string
  field_label: string
  field_key: string
  field_type: ProjectTypeFieldType
  field_options: string[]
  affects_price: boolean
  sequence_order: number
  is_active: boolean
}

export interface ProjectTypeAnswer {
  id: string
  project_id: string
  field_id: string
  answer: string | null
  created_at: string
}

export type CalendarEventType = 'appointment' | 'reminder' | 'milestone' | 'other'

export interface CalendarEvent {
  id: string
  created_at: string
  event_date: string
  title: string
  notes: string | null
  project_id: string | null
  event_type: CalendarEventType
}

export interface MaterialItem {
  id: string
  project_id: string
  item_name: string
  cost_estimate: number | null
  ordered: boolean
  received: boolean
  notes: string | null
  created_at: string
}

export type StepType = 'action' | 'waiting'
export type WaitingOn = 'customer' | 'supplier' | 'designer' | 'internal'

export interface ProductionStep {
  id: string
  project_id: string
  step_name: string
  description: string | null
  sequence_order: number | null
  completed: boolean
  assigned_to: string | null
  notes: string | null
  created_at: string
  step_type: StepType
  waiting_on: WaitingOn | null
  is_current: boolean
  is_optional: boolean
}

export type StepCategory =
  | 'admin'
  | 'design'
  | 'sourcing'
  | 'fabrication'
  | 'finishing'
  | 'assembly'
  | 'installation'
  | 'delivery'

export interface StepLibraryItem {
  id: string
  step_name: string
  description: string | null
  category: StepCategory | null
  created_at: string
  step_type: StepType
  waiting_on: WaitingOn | null
  is_optional: boolean
  sequence_order: number | null
  suggested_subtasks?: string[]
}

export interface StepSubtask {
  id: string
  step_id: string
  project_id: string
  created_at: string
  description: string
  completed: boolean
}

export type QuestionDirectedAt = 'customer' | 'internal'

export interface OpenQuestion {
  id: string
  project_id: string
  step_id: string | null
  created_at: string
  question: string
  directed_at: QuestionDirectedAt | null
  resolved: boolean
  resolved_at: string | null
  answer: string | null
  // joined
  project?: Project
}

export interface AIMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: string
}

export interface AddOn {
  name: string
  price: number
}

export type QuoteStatus = 'initial' | 'revised' | 'final'

export interface Quote {
  id: string
  project_id: string
  ai_conversation_history: AIMessage[]
  base_price: number | null
  add_ons: AddOn[]
  total_price: number | null
  markup_percentage: number | null
  status: QuoteStatus
  scope_of_work: string | null
  complexity_assessment: string | null
  version: number
  source?: string | null
  created_at: string
  updated_at: string
}

export interface ProjectFile {
  id: string
  project_id: string
  file_name: string
  file_path: string
  file_size: number | null
  mime_type: string | null
  created_at: string
}

export interface CustomProjectType {
  id: string
  name: string
  key: string
  is_active: boolean
  created_at: string
}

export type MaterialCategory = 'wood' | 'hardware' | 'finish' | 'trim' | 'lighting' | 'other'

export interface PricingMaterial {
  id: string
  created_at: string
  name: string
  unit: string | null
  unit_price: number | null
  typical_flat_rate: number | null
  category: MaterialCategory | null
  notes: string | null
}

export interface PricingAddon {
  id: string
  created_at: string
  name: string
  unit: string | null
  unit_price: number | null
  typical_flat_rate: number | null
  notes: string | null
}

export interface DesignMeetingNote {
  id: string
  project_id: string
  created_at: string
  notes: string
  attachments: string[]
}

export interface ShoppingListItem {
  id: string
  project_id: string | null
  created_at: string
  item: string
  purchased: boolean
  notes: string | null
  project?: Project
}

export type TouchupStatus = 'open' | 'in_progress' | 'done'
export type TouchupPriority = 'normal' | 'urgent'

export interface Touchup {
  id: string
  created_at: string
  updated_at: string
  description: string
  assigned_to: string | null
  address: string | null
  project_id: string | null
  customer_id: string | null
  status: TouchupStatus
  priority: TouchupPriority
  notes: string | null
  completed_at: string | null
  // joined
  project?: Project
  customer?: Customer
}
