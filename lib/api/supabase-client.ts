import { supabase } from '@/lib/supabase'
import type {
  Customer,
  Project,
  MaterialItem,
  ProductionStep,
  StepLibraryItem,
  Quote,
  AIMessage,
} from '@/lib/core/types'

// ── Customers ──────────────────────────────────────────────────────────────

export async function getCustomers(): Promise<Customer[]> {
  const { data, error } = await supabase.from('customers').select('*').order('name')
  if (error) throw error
  return data
}

export async function getCustomerById(id: string): Promise<Customer | null> {
  const { data, error } = await supabase.from('customers').select('*').eq('id', id).single()
  if (error) throw error
  return data
}

export async function createCustomer(
  input: Omit<Customer, 'id' | 'created_at'>
): Promise<Customer> {
  const { data, error } = await supabase.from('customers').insert(input).select().single()
  if (error) throw error
  return data
}

export async function updateCustomer(
  id: string,
  input: Partial<Omit<Customer, 'id' | 'created_at'>>
): Promise<Customer> {
  const { data, error } = await supabase
    .from('customers')
    .update(input)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

// ── Projects ───────────────────────────────────────────────────────────────

export async function getProjects(): Promise<Project[]> {
  const { data, error } = await supabase
    .from('projects')
    .select('*, customer:customers(*)')
    .order('updated_at', { ascending: false })
  if (error) throw error
  return data as Project[]
}

export async function getProjectById(id: string): Promise<Project | null> {
  const { data, error } = await supabase
    .from('projects')
    .select('*, customer:customers(*)')
    .eq('id', id)
    .single()
  if (error) throw error
  return data as Project
}

export async function getProjectsByCustomerId(customerId: string): Promise<Project[]> {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('customer_id', customerId)
    .order('updated_at', { ascending: false })
  if (error) throw error
  return data
}

export async function createProject(
  input: Omit<Project, 'id' | 'created_at' | 'updated_at' | 'customer'>
): Promise<Project> {
  const { data, error } = await supabase.from('projects').insert(input).select().single()
  if (error) throw error
  return data
}

export async function updateProject(
  id: string,
  input: Partial<Omit<Project, 'id' | 'created_at' | 'customer'>>
): Promise<Project> {
  const { data, error } = await supabase
    .from('projects')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

// ── Materials ──────────────────────────────────────────────────────────────

export async function getMaterialsByProjectId(projectId: string): Promise<MaterialItem[]> {
  const { data, error } = await supabase
    .from('materials_checklist')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at')
  if (error) throw error
  return data
}

export async function addMaterial(
  input: Omit<MaterialItem, 'id' | 'created_at'>
): Promise<MaterialItem> {
  const { data, error } = await supabase
    .from('materials_checklist')
    .insert(input)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateMaterial(
  id: string,
  input: Partial<Omit<MaterialItem, 'id' | 'created_at' | 'project_id'>>
): Promise<MaterialItem> {
  const { data, error } = await supabase
    .from('materials_checklist')
    .update(input)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteMaterial(id: string): Promise<void> {
  const { error } = await supabase.from('materials_checklist').delete().eq('id', id)
  if (error) throw error
}

// ── Production Steps ───────────────────────────────────────────────────────

export async function getStepsByProjectId(projectId: string): Promise<ProductionStep[]> {
  const { data, error } = await supabase
    .from('production_steps')
    .select('*')
    .eq('project_id', projectId)
    .order('sequence_order')
  if (error) throw error
  return data
}

export async function addStep(
  input: Omit<ProductionStep, 'id' | 'created_at'>
): Promise<ProductionStep> {
  const { data, error } = await supabase
    .from('production_steps')
    .insert(input)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateStep(
  id: string,
  input: Partial<Omit<ProductionStep, 'id' | 'created_at' | 'project_id'>>
): Promise<ProductionStep> {
  const { data, error } = await supabase
    .from('production_steps')
    .update(input)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteStep(id: string): Promise<void> {
  const { error } = await supabase.from('production_steps').delete().eq('id', id)
  if (error) throw error
}

export async function reorderSteps(
  projectId: string,
  orderedIds: string[]
): Promise<void> {
  await Promise.all(
    orderedIds.map((id, index) =>
      supabase
        .from('production_steps')
        .update({ sequence_order: index + 1 })
        .eq('id', id)
        .eq('project_id', projectId)
    )
  )
}

// ── Step Library ───────────────────────────────────────────────────────────

export async function getStepLibrary(): Promise<StepLibraryItem[]> {
  const { data, error } = await supabase
    .from('step_library')
    .select('*')
    .order('step_name')
  if (error) throw error
  return data
}

export async function addStepToLibrary(
  input: Omit<StepLibraryItem, 'id' | 'created_at'>
): Promise<StepLibraryItem> {
  const { data, error } = await supabase.from('step_library').insert(input).select().single()
  if (error) throw error
  return data
}

// ── Quotes ─────────────────────────────────────────────────────────────────

export async function getQuoteByProjectId(projectId: string): Promise<Quote | null> {
  const { data, error } = await supabase
    .from('quotes')
    .select('*')
    .eq('project_id', projectId)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function createQuote(
  input: Omit<Quote, 'id' | 'created_at' | 'updated_at'>
): Promise<Quote> {
  const { data, error } = await supabase.from('quotes').insert(input).select().single()
  if (error) throw error
  return data
}

export async function updateQuote(
  id: string,
  input: Partial<Omit<Quote, 'id' | 'created_at' | 'project_id'>>
): Promise<Quote> {
  const { data, error } = await supabase
    .from('quotes')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function appendAIMessage(
  quoteId: string,
  message: AIMessage
): Promise<Quote> {
  const { data: existing } = await supabase
    .from('quotes')
    .select('ai_conversation_history')
    .eq('id', quoteId)
    .single()
  const history = (existing?.ai_conversation_history as AIMessage[]) ?? []
  return updateQuote(quoteId, { ai_conversation_history: [...history, message] })
}
