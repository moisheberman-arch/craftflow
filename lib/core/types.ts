export interface Customer {
  id: string
  created_at: string
  name: string
  email: string | null
  phone: string | null
  address: string | null
}

export type ProjectType = 'dining_table' | 'built_in' | 'bookcase' | 'buffet' | 'other'
export type ProjectStatus =
  | 'lead'
  | 'design_meeting_scheduled'
  | 'rendering'
  | 'quote_issued'
  | 'deposit_received'
  | 'in_production'
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
  // joined
  customer?: Customer
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
}

export type StepCategory =
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

export interface Quote {
  id: string
  project_id: string
  ai_conversation_history: AIMessage[]
  base_price: number | null
  add_ons: AddOn[]
  total_price: number | null
  markup_percentage: number | null
  created_at: string
  updated_at: string
}
