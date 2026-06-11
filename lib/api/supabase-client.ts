import { supabase } from '@/lib/supabase'
import type {
  Customer,
  Project,
  MaterialItem,
  ProductionStep,
  StepLibraryItem,
  Quote,
  AIMessage,
  PricingMaterial,
  PricingAddon,
  DesignMeetingNote,
  ShoppingListItem,
  StepSubtask,
  OpenQuestion,
  QuestionDirectedAt,
  CalendarEvent,
  CalendarEventType,
  Touchup,
  TouchupStatus,
  ProjectTypeField,
  ProjectTypeAnswer,
  ProjectFile,
  CustomProjectType,
  Supplier,
  SupplierMaterial,
  CustomerApproval,
  ApprovalType,
  DeliveryPhoto,
  Sample,
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
    .from('customers').update(input).eq('id', id).select().single()
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
    .from('projects').select('*, customer:customers(*)').eq('id', id).single()
  if (error) throw error
  return data as Project
}

export async function getProjectsByCustomerId(customerId: string): Promise<Project[]> {
  const { data, error } = await supabase
    .from('projects').select('*').eq('customer_id', customerId)
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
  const patch: Record<string, unknown> = { ...input, updated_at: new Date().toISOString() }
  // Auto-set deposit date and delivery window when status moves to deposit_received
  if (input.status === 'deposit_received' && !input.deposit_date) {
    const now = new Date()
    patch.deposit_date = now.toISOString()
    const start = new Date(now); start.setDate(start.getDate() + 56)
    const end = new Date(now); end.setDate(end.getDate() + 70)
    patch.expected_delivery_start = start.toISOString().slice(0, 10)
    patch.expected_delivery_end = end.toISOString().slice(0, 10)
  }
  const { data, error } = await supabase
    .from('projects')
    .update(patch)
    .eq('id', id).select().single()
  if (error) throw error
  return data as Project
}

// Auto-insert 19 default steps when project reaches deposit_received
export async function seedDefaultStepsIfEmpty(projectId: string): Promise<void> {
  const { data: existing } = await supabase
    .from('production_steps').select('id').eq('project_id', projectId).limit(1)
  if (existing && existing.length > 0) return  // already has steps

  const { data: library } = await supabase
    .from('step_library').select('*').order('sequence_order')
  if (!library || library.length === 0) return

  const steps = library.map((s: StepLibraryItem, i: number) => ({
    project_id: projectId,
    step_name: s.step_name,
    description: s.description,
    sequence_order: s.sequence_order ?? i + 1,
    completed: false,
    assigned_to: null,
    notes: null,
    step_type: s.step_type ?? 'action',
    waiting_on: s.waiting_on ?? null,
    is_current: i === 0,  // step 1 is current
    is_optional: s.is_optional ?? false,
  }))

  const { error } = await supabase.from('production_steps').insert(steps)
  if (error) throw error
}

// ── Materials ──────────────────────────────────────────────────────────────

export async function getMaterialsByProjectId(projectId: string): Promise<MaterialItem[]> {
  const { data, error } = await supabase
    .from('materials_checklist').select('*').eq('project_id', projectId).order('created_at')
  if (error) throw error
  return data
}

export async function addMaterial(
  input: Omit<MaterialItem, 'id' | 'created_at'>
): Promise<MaterialItem> {
  const { data, error } = await supabase
    .from('materials_checklist').insert(input).select().single()
  if (error) throw error
  return data
}

export async function updateMaterial(
  id: string,
  input: Partial<Omit<MaterialItem, 'id' | 'created_at' | 'project_id'>>
): Promise<MaterialItem> {
  const { data, error } = await supabase
    .from('materials_checklist').update(input).eq('id', id).select().single()
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
    .from('production_steps').select('*').eq('project_id', projectId).order('sequence_order')
  if (error) throw error
  return data as ProductionStep[]
}

export async function addStep(
  input: Omit<ProductionStep, 'id' | 'created_at'>
): Promise<ProductionStep> {
  const { data, error } = await supabase
    .from('production_steps').insert(input).select().single()
  if (error) throw error
  return data as ProductionStep
}

export async function updateStep(
  id: string,
  input: Partial<Omit<ProductionStep, 'id' | 'created_at' | 'project_id'>>
): Promise<ProductionStep> {
  const { data, error } = await supabase
    .from('production_steps').update(input).eq('id', id).select().single()
  if (error) throw error
  return data as ProductionStep
}

export async function deleteStep(id: string): Promise<void> {
  const { error } = await supabase.from('production_steps').delete().eq('id', id)
  if (error) throw error
}

export async function reorderSteps(projectId: string, orderedIds: string[]): Promise<void> {
  await Promise.all(
    orderedIds.map((id, index) =>
      supabase.from('production_steps')
        .update({ sequence_order: index + 1 })
        .eq('id', id).eq('project_id', projectId)
    )
  )
}

async function seedSuggestedSubtasksIfEmpty(stepId: string, projectId: string, stepName: string): Promise<void> {
  const { count } = await supabase
    .from('step_subtasks').select('id', { count: 'exact', head: true }).eq('step_id', stepId)
  if (count && count > 0) return
  const { data: lib } = await supabase
    .from('step_library').select('suggested_subtasks').eq('step_name', stepName).maybeSingle()
  const suggestions: string[] = Array.isArray(lib?.suggested_subtasks) ? lib.suggested_subtasks : []
  if (suggestions.length === 0) return
  await supabase.from('step_subtasks').insert(
    suggestions.map(desc => ({ step_id: stepId, project_id: projectId, description: desc, completed: false }))
  )
}

export async function setCurrentStep(projectId: string, stepId: string): Promise<void> {
  await supabase.from('production_steps')
    .update({ is_current: false }).eq('project_id', projectId)
  await supabase.from('production_steps')
    .update({ is_current: true }).eq('id', stepId)
  const { data: step } = await supabase.from('production_steps').select('step_name').eq('id', stepId).single()
  if (step) await seedSuggestedSubtasksIfEmpty(stepId, projectId, step.step_name).catch(console.error)
}

// Keep project status in sync with where the current step sits in the pipeline
async function syncProjectStatusForStep(projectId: string, stepName: string): Promise<void> {
  let newStatus: string | null = null
  if (stepName.includes('Production Started') || stepName.includes('In Production')) {
    newStatus = 'in_production'
  } else if (stepName.includes('Ready for Delivery') || stepName.includes('Delivery / Installation Scheduled')) {
    newStatus = 'ready_for_delivery'
  } else if (stepName === 'Delivered and Installed') {
    newStatus = 'completed'
  }
  if (!newStatus) return
  await supabase.from('projects')
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', projectId)
}

export async function autoAdvanceCurrentStep(
  projectId: string,
  completedStepId: string
): Promise<{ nextStep: ProductionStep | null; projectCompleted: boolean }> {
  // Mark current step complete and not current
  await supabase.from('production_steps')
    .update({ completed: true, is_current: false })
    .eq('id', completedStepId)

  // Get all steps in order
  const { data: steps } = await supabase
    .from('production_steps').select('*')
    .eq('project_id', projectId).order('sequence_order')

  if (!steps) return { nextStep: null, projectCompleted: false }

  // Find next incomplete step
  const completedStep = steps.find(s => s.id === completedStepId)
  const currentOrder = completedStep?.sequence_order ?? 0
  const nextStep = steps.find(
    s => !s.completed && s.id !== completedStepId && (s.sequence_order ?? 0) > currentOrder
  ) ?? null

  if (nextStep) {
    await supabase.from('production_steps')
      .update({ is_current: true }).eq('id', nextStep.id)
    await seedSuggestedSubtasksIfEmpty(nextStep.id, projectId, nextStep.step_name).catch(console.error)
    await syncProjectStatusForStep(projectId, nextStep.step_name).catch(console.error)
    return { nextStep: nextStep as ProductionStep, projectCompleted: false }
  }

  // All steps done — mark project completed
  await supabase.from('projects')
    .update({ status: 'completed', updated_at: new Date().toISOString() })
    .eq('id', projectId)
  return { nextStep: null, projectCompleted: true }
}

// ── Step Library ───────────────────────────────────────────────────────────

export async function getStepLibrary(): Promise<StepLibraryItem[]> {
  const { data, error } = await supabase
    .from('step_library').select('*').order('sequence_order')
  if (error) throw error
  return data as StepLibraryItem[]
}

export async function addStepToLibrary(
  input: Omit<StepLibraryItem, 'id' | 'created_at'>
): Promise<StepLibraryItem> {
  const { data, error } = await supabase.from('step_library').insert(input).select().single()
  if (error) throw error
  return data as StepLibraryItem
}

export async function updateStepLibraryItem(
  id: string,
  input: Partial<Omit<StepLibraryItem, 'id' | 'created_at'>>
): Promise<StepLibraryItem> {
  const { data, error } = await supabase
    .from('step_library').update(input).eq('id', id).select().single()
  if (error) throw error
  return data as StepLibraryItem
}

export async function deleteStepLibraryItem(id: string): Promise<void> {
  const { error } = await supabase.from('step_library').delete().eq('id', id)
  if (error) throw error
}

export async function reorderStepLibrary(orderedIds: string[]): Promise<void> {
  await Promise.all(
    orderedIds.map((id, index) =>
      supabase.from('step_library').update({ sequence_order: index + 1 }).eq('id', id)
    )
  )
}

// ── Step Subtasks ──────────────────────────────────────────────────────────

export async function getSubtasksByStepId(stepId: string): Promise<StepSubtask[]> {
  const { data, error } = await supabase
    .from('step_subtasks').select('*').eq('step_id', stepId).order('created_at')
  if (error) throw error
  return data
}

export async function addSubtask(
  stepId: string,
  projectId: string,
  description: string
): Promise<StepSubtask> {
  const { data, error } = await supabase
    .from('step_subtasks')
    .insert({ step_id: stepId, project_id: projectId, description, completed: false })
    .select().single()
  if (error) throw error
  return data
}

export async function updateSubtask(
  id: string,
  input: Partial<Pick<StepSubtask, 'completed' | 'description'>>
): Promise<StepSubtask> {
  const { data, error } = await supabase
    .from('step_subtasks').update(input).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function deleteSubtask(id: string): Promise<void> {
  const { error } = await supabase.from('step_subtasks').delete().eq('id', id)
  if (error) throw error
}

export async function getSubtasksByProjectId(projectId: string): Promise<StepSubtask[]> {
  const { data, error } = await supabase
    .from('step_subtasks').select('*').eq('project_id', projectId)
  if (error) throw error
  return data
}

// ── Open Questions ─────────────────────────────────────────────────────────

export async function getOpenQuestionsByProjectId(projectId: string): Promise<OpenQuestion[]> {
  const { data, error } = await supabase
    .from('open_questions').select('*').eq('project_id', projectId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function addOpenQuestion(
  projectId: string,
  question: string,
  directedAt: QuestionDirectedAt,
  stepId?: string | null
): Promise<OpenQuestion> {
  const { data, error } = await supabase
    .from('open_questions')
    .insert({
      project_id: projectId,
      step_id: stepId ?? null,
      question,
      directed_at: directedAt,
      resolved: false,
    })
    .select().single()
  if (error) throw error
  return data
}

export async function resolveQuestion(id: string, answer: string): Promise<OpenQuestion> {
  const { data, error } = await supabase
    .from('open_questions')
    .update({ resolved: true, resolved_at: new Date().toISOString(), answer })
    .eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function deleteQuestion(id: string): Promise<void> {
  const { error } = await supabase.from('open_questions').delete().eq('id', id)
  if (error) throw error
}

export async function getUnresolvedQuestionsAllProjects(): Promise<OpenQuestion[]> {
  const { data, error } = await supabase
    .from('open_questions')
    .select('*, project:projects(*, customer:customers(*))')
    .eq('resolved', false)
    .order('created_at')
  if (error) throw error
  return data as OpenQuestion[]
}

// ── Quotes ─────────────────────────────────────────────────────────────────

export async function getQuoteByProjectId(projectId: string): Promise<Quote | null> {
  const { data, error } = await supabase
    .from('quotes').select('*').eq('project_id', projectId).maybeSingle()
  if (error) throw error
  return data
}

export async function getFinalizedQuotes(limit = 10): Promise<Quote[]> {
  const { data, error } = await supabase
    .from('quotes').select('*').eq('status', 'final')
    .order('updated_at', { ascending: false }).limit(limit)
  if (error) throw error
  return data ?? []
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
    .eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function appendAIMessage(quoteId: string, message: AIMessage): Promise<Quote> {
  const { data: existing } = await supabase
    .from('quotes').select('ai_conversation_history').eq('id', quoteId).single()
  const history = (existing?.ai_conversation_history as AIMessage[]) ?? []
  return updateQuote(quoteId, { ai_conversation_history: [...history, message] })
}

// ── Pricing Materials ──────────────────────────────────────────────────────

export async function getPricingMaterials(): Promise<PricingMaterial[]> {
  const { data, error } = await supabase.from('pricing_materials').select('*').order('category')
  if (error) throw error
  return data
}

export async function addPricingMaterial(
  input: Omit<PricingMaterial, 'id' | 'created_at'>
): Promise<PricingMaterial> {
  const { data, error } = await supabase.from('pricing_materials').insert(input).select().single()
  if (error) throw error
  return data
}

export async function updatePricingMaterial(
  id: string,
  input: Partial<Omit<PricingMaterial, 'id' | 'created_at'>>
): Promise<PricingMaterial> {
  const { data, error } = await supabase
    .from('pricing_materials').update(input).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function deletePricingMaterial(id: string): Promise<void> {
  const { error } = await supabase.from('pricing_materials').delete().eq('id', id)
  if (error) throw error
}

// ── Pricing Addons ─────────────────────────────────────────────────────────

export async function getPricingAddons(): Promise<PricingAddon[]> {
  const { data, error } = await supabase.from('pricing_addons').select('*').order('name')
  if (error) throw error
  return data
}

export async function addPricingAddon(
  input: Omit<PricingAddon, 'id' | 'created_at'>
): Promise<PricingAddon> {
  const { data, error } = await supabase.from('pricing_addons').insert(input).select().single()
  if (error) throw error
  return data
}

export async function updatePricingAddon(
  id: string,
  input: Partial<Omit<PricingAddon, 'id' | 'created_at'>>
): Promise<PricingAddon> {
  const { data, error } = await supabase
    .from('pricing_addons').update(input).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function deletePricingAddon(id: string): Promise<void> {
  const { error } = await supabase.from('pricing_addons').delete().eq('id', id)
  if (error) throw error
}

// ── Design Meeting Notes ───────────────────────────────────────────────────

export async function getNotesByProjectId(projectId: string): Promise<DesignMeetingNote[]> {
  const { data, error } = await supabase
    .from('design_meeting_notes').select('*').eq('project_id', projectId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function addDesignMeetingNote(
  projectId: string,
  notes: string
): Promise<DesignMeetingNote> {
  const { data, error } = await supabase
    .from('design_meeting_notes')
    .insert({ project_id: projectId, notes, attachments: [] })
    .select().single()
  if (error) throw error
  return data
}

export async function deleteNote(id: string): Promise<void> {
  const { error } = await supabase.from('design_meeting_notes').delete().eq('id', id)
  if (error) throw error
}

// ── Shopping List ──────────────────────────────────────────────────────────

export async function getShoppingListByProjectId(projectId: string): Promise<ShoppingListItem[]> {
  const { data, error } = await supabase
    .from('shopping_list').select('*').eq('project_id', projectId).order('created_at')
  if (error) throw error
  return data
}

export async function getAllUnpurchasedShoppingItems(): Promise<ShoppingListItem[]> {
  const { data, error } = await supabase
    .from('shopping_list')
    .select('*, project:projects(*, customer:customers(*))')
    .eq('purchased', false)
    .order('project_id').order('created_at')
  if (error) throw error
  return data as ShoppingListItem[]
}

export async function addShoppingListItem(
  projectId: string | null,
  item: string,
  notes?: string
): Promise<ShoppingListItem> {
  const { data, error } = await supabase
    .from('shopping_list')
    .insert({ project_id: projectId, item, purchased: false, notes: notes ?? null })
    .select().single()
  if (error) throw error
  return data
}

export async function updateShoppingListItem(
  id: string,
  input: Partial<Pick<ShoppingListItem, 'purchased' | 'notes' | 'item'>>
): Promise<ShoppingListItem> {
  const { data, error } = await supabase
    .from('shopping_list').update(input).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function deleteShoppingListItem(id: string): Promise<void> {
  const { error } = await supabase.from('shopping_list').delete().eq('id', id)
  if (error) throw error
}

// ── Calendar Events ────────────────────────────────────────────────────────

export async function getCalendarEvents(month: number, year: number): Promise<CalendarEvent[]> {
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`
  const endDate = month === 12
    ? `${year + 1}-01-01`
    : `${year}-${String(month + 1).padStart(2, '0')}-01`
  const { data, error } = await supabase
    .from('calendar_events')
    .select('*')
    .gte('event_date', startDate)
    .lt('event_date', endDate)
    .order('event_date')
  if (error) throw error
  return data
}

export async function addCalendarEvent(
  input: Omit<CalendarEvent, 'id' | 'created_at'>
): Promise<CalendarEvent> {
  const { data, error } = await supabase.from('calendar_events').insert(input).select().single()
  if (error) throw error
  return data
}

export async function updateCalendarEvent(
  id: string,
  input: Partial<Omit<CalendarEvent, 'id' | 'created_at'>>
): Promise<CalendarEvent> {
  const { data, error } = await supabase
    .from('calendar_events').update(input).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function deleteCalendarEvent(id: string): Promise<void> {
  const { error } = await supabase.from('calendar_events').delete().eq('id', id)
  if (error) throw error
}

// ── Delete Project (with cascade) ─────────────────────────────────────────

export async function deleteProject(projectId: string): Promise<void> {
  // Delete related records (tables without ON DELETE CASCADE)
  await Promise.all([
    supabase.from('quotes').delete().eq('project_id', projectId),
  ])
  // Main delete — most relations have ON DELETE CASCADE in migration 004+
  const { error } = await supabase.from('projects').delete().eq('id', projectId)
  if (error) throw error
}

export async function getProjectCountByCustomerId(customerId: string): Promise<number> {
  const { count, error } = await supabase
    .from('projects')
    .select('id', { count: 'exact', head: true })
    .eq('customer_id', customerId)
  if (error) throw error
  return count ?? 0
}

export async function deleteCustomer(customerId: string): Promise<void> {
  const { error } = await supabase.from('customers').delete().eq('id', customerId)
  if (error) throw error
}

// ── Touchups ───────────────────────────────────────────────────────────────

export async function getTouchups(): Promise<Touchup[]> {
  const { data, error } = await supabase
    .from('touchups')
    .select('*, project:projects(*, customer:customers(*)), customer:customers(*)')
    .order('priority', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  return data as Touchup[]
}

export async function getTouchupsByStatus(status: TouchupStatus): Promise<Touchup[]> {
  const { data, error } = await supabase
    .from('touchups')
    .select('*, project:projects(*, customer:customers(*)), customer:customers(*)')
    .eq('status', status)
    .order('priority', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  return data as Touchup[]
}

export async function getOpenTouchups(): Promise<Touchup[]> {
  const { data, error } = await supabase
    .from('touchups')
    .select('*, project:projects(*, customer:customers(*)), customer:customers(*)')
    .in('status', ['open', 'in_progress'])
    .order('priority', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  return data as Touchup[]
}

export async function createTouchup(
  input: Omit<Touchup, 'id' | 'created_at' | 'updated_at' | 'project' | 'customer'>
): Promise<Touchup> {
  const { data, error } = await supabase.from('touchups').insert(input).select().single()
  if (error) throw error
  return data as Touchup
}

export async function updateTouchup(
  id: string,
  input: Partial<Omit<Touchup, 'id' | 'created_at' | 'project' | 'customer'>>
): Promise<Touchup> {
  const { data, error } = await supabase
    .from('touchups')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', id).select().single()
  if (error) throw error
  return data as Touchup
}

export async function deleteTouchup(id: string): Promise<void> {
  const { error } = await supabase.from('touchups').delete().eq('id', id)
  if (error) throw error
}

// ── Project Type Fields ────────────────────────────────────────────────────

export async function getFieldsByProjectType(projectType: string): Promise<ProjectTypeField[]> {
  const { data, error } = await supabase
    .from('project_type_fields')
    .select('*')
    .eq('project_type', projectType)
    .eq('is_active', true)
    .order('sequence_order')
  if (error) throw error
  return data as ProjectTypeField[]
}

export async function getAllProjectTypeFields(): Promise<ProjectTypeField[]> {
  const { data, error } = await supabase
    .from('project_type_fields')
    .select('*')
    .order('project_type')
    .order('sequence_order')
  if (error) throw error
  return data as ProjectTypeField[]
}

export async function addProjectTypeField(
  input: Omit<ProjectTypeField, 'id' | 'created_at'>
): Promise<ProjectTypeField> {
  const { data, error } = await supabase.from('project_type_fields').insert(input).select().single()
  if (error) throw error
  return data as ProjectTypeField
}

export async function updateProjectTypeField(
  id: string,
  input: Partial<Omit<ProjectTypeField, 'id' | 'created_at'>>
): Promise<ProjectTypeField> {
  const { data, error } = await supabase
    .from('project_type_fields').update(input).eq('id', id).select().single()
  if (error) throw error
  return data as ProjectTypeField
}

export async function deleteProjectTypeField(id: string): Promise<void> {
  const { error } = await supabase.from('project_type_fields').delete().eq('id', id)
  if (error) throw error
}

export async function reorderProjectTypeFields(projectType: string, orderedIds: string[]): Promise<void> {
  await Promise.all(
    orderedIds.map((id, index) =>
      supabase.from('project_type_fields')
        .update({ sequence_order: index + 1 })
        .eq('id', id).eq('project_type', projectType)
    )
  )
}

// ── Project Type Answers ───────────────────────────────────────────────────

export async function getAnswersByProjectId(projectId: string): Promise<ProjectTypeAnswer[]> {
  const { data, error } = await supabase
    .from('project_type_answers')
    .select('*')
    .eq('project_id', projectId)
  if (error) throw error
  return data as ProjectTypeAnswer[]
}

export async function saveAnswer(
  projectId: string,
  fieldId: string,
  answer: string
): Promise<ProjectTypeAnswer> {
  const { data, error } = await supabase
    .from('project_type_answers')
    .upsert({ project_id: projectId, field_id: fieldId, answer }, { onConflict: 'project_id,field_id' })
    .select().single()
  if (error) throw error
  return data as ProjectTypeAnswer
}

export async function saveAllAnswers(
  projectId: string,
  answers: { fieldId: string; answer: string }[]
): Promise<void> {
  if (answers.length === 0) return
  const rows = answers.map(a => ({ project_id: projectId, field_id: a.fieldId, answer: a.answer }))
  const { error } = await supabase
    .from('project_type_answers')
    .upsert(rows, { onConflict: 'project_id,field_id' })
  if (error) throw error
}

// ── Shop Task Dashboard ────────────────────────────────────────────────────

export interface ShopTaskProject {
  project: Project
  currentStep: ProductionStep
  subtasks: StepSubtask[]
  openSubtasks: number
  unresolvedQuestions: number
  stepAgeHours: number
}

// ── Project Files ──────────────────────────────────────────────────────────

export async function getFilesByProjectId(projectId: string): Promise<ProjectFile[]> {
  const { data, error } = await supabase
    .from('project_files').select('*').eq('project_id', projectId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data as ProjectFile[]
}

export async function uploadProjectFile(projectId: string, file: File): Promise<ProjectFile> {
  const safeName = file.name.replace(/[^a-z0-9._-]/gi, '_')
  const path = `${projectId}/${Date.now()}-${safeName}`
  const { error: storageErr } = await supabase.storage
    .from('project-files')
    .upload(path, file, { upsert: false })
  if (storageErr) throw storageErr
  const { data, error } = await supabase.from('project_files').insert({
    project_id: projectId,
    file_name: file.name,
    file_path: path,
    file_size: file.size,
    mime_type: file.type || null,
  }).select().single()
  if (error) throw error
  return data as ProjectFile
}

export function getProjectFileUrl(filePath: string): string {
  const { data } = supabase.storage.from('project-files').getPublicUrl(filePath)
  return data.publicUrl
}

export async function deleteProjectFile(id: string, filePath: string): Promise<void> {
  await supabase.storage.from('project-files').remove([filePath])
  const { error } = await supabase.from('project_files').delete().eq('id', id)
  if (error) throw error
}

// ── Suppliers ──────────────────────────────────────────────────────────────

export async function getSuppliers(): Promise<Supplier[]> {
  const { data, error } = await supabase.from('suppliers').select('*').order('name')
  if (error) throw error
  return data as Supplier[]
}

export async function getSupplierById(id: string): Promise<Supplier | null> {
  const { data, error } = await supabase.from('suppliers').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data as Supplier | null
}

export async function createSupplier(
  input: Partial<Omit<Supplier, 'id' | 'created_at' | 'updated_at'>> & { name: string }
): Promise<Supplier> {
  const { data, error } = await supabase.from('suppliers').insert(input).select().single()
  if (error) throw error
  return data as Supplier
}

export async function updateSupplier(
  id: string,
  input: Partial<Omit<Supplier, 'id' | 'created_at'>>
): Promise<Supplier> {
  const { data, error } = await supabase
    .from('suppliers')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', id).select().single()
  if (error) throw error
  return data as Supplier
}

export async function deleteSupplier(id: string): Promise<void> {
  const { error } = await supabase.from('suppliers').delete().eq('id', id)
  if (error) throw error
}

export async function getSupplierMaterials(supplierId: string): Promise<SupplierMaterial[]> {
  const { data, error } = await supabase
    .from('supplier_materials').select('*').eq('supplier_id', supplierId).order('material_name')
  if (error) throw error
  return data as SupplierMaterial[]
}

export async function addSupplierMaterial(
  supplierId: string,
  input: Partial<Omit<SupplierMaterial, 'id' | 'supplier_id'>>
): Promise<SupplierMaterial> {
  const { data, error } = await supabase
    .from('supplier_materials').insert({ ...input, supplier_id: supplierId }).select().single()
  if (error) throw error
  return data as SupplierMaterial
}

export async function updateSupplierMaterial(
  id: string,
  input: Partial<Omit<SupplierMaterial, 'id' | 'supplier_id'>>
): Promise<SupplierMaterial> {
  const { data, error } = await supabase
    .from('supplier_materials').update(input).eq('id', id).select().single()
  if (error) throw error
  return data as SupplierMaterial
}

export async function deleteSupplierMaterial(id: string): Promise<void> {
  const { error } = await supabase.from('supplier_materials').delete().eq('id', id)
  if (error) throw error
}

// ── Customer Approvals ─────────────────────────────────────────────────────

export async function createApprovalRequest(
  projectId: string,
  approvalType: ApprovalType,
  fileUrl: string | null
): Promise<CustomerApproval> {
  const token = crypto.randomUUID()
  const expires = new Date()
  expires.setDate(expires.getDate() + 7)
  const { data, error } = await supabase
    .from('customer_approvals')
    .insert({
      project_id: projectId,
      approval_type: approvalType,
      token,
      expires_at: expires.toISOString(),
      approved: false,
      file_url: fileUrl,
      sent_at: new Date().toISOString(),
    })
    .select().single()
  if (error) throw error
  return data as CustomerApproval
}

export async function getApprovalsByProjectId(projectId: string): Promise<CustomerApproval[]> {
  const { data, error } = await supabase
    .from('customer_approvals').select('*').eq('project_id', projectId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data as CustomerApproval[]
}

export async function getApprovalByToken(token: string): Promise<CustomerApproval | null> {
  const { data, error } = await supabase
    .from('customer_approvals').select('*').eq('token', token).maybeSingle()
  if (error) throw error
  return data as CustomerApproval | null
}

export async function markApproved(token: string, customerNotes: string | null): Promise<CustomerApproval> {
  const { data, error } = await supabase
    .from('customer_approvals')
    .update({ approved: true, approved_at: new Date().toISOString(), customer_notes: customerNotes })
    .eq('token', token).select().single()
  if (error) throw error
  return data as CustomerApproval
}

export async function deleteApproval(id: string): Promise<void> {
  const { error } = await supabase.from('customer_approvals').delete().eq('id', id)
  if (error) throw error
}

// ── Delivery Photos ────────────────────────────────────────────────────────

export async function getDeliveryPhotosByProjectId(projectId: string): Promise<DeliveryPhoto[]> {
  const { data, error } = await supabase
    .from('delivery_photos').select('*').eq('project_id', projectId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data as DeliveryPhoto[]
}

export async function uploadDeliveryPhoto(
  projectId: string,
  file: File,
  caption?: string
): Promise<DeliveryPhoto> {
  const safeName = file.name.replace(/[^a-z0-9._-]/gi, '_')
  const path = `delivery-photos/${projectId}/${Date.now()}-${safeName}`
  const { error: storageErr } = await supabase.storage
    .from('project-files')
    .upload(path, file, { upsert: false })
  if (storageErr) throw storageErr
  const { data, error } = await supabase.from('delivery_photos').insert({
    project_id: projectId,
    file_path: path,
    file_name: file.name,
    caption: caption || null,
  }).select().single()
  if (error) throw error
  return data as DeliveryPhoto
}

export function getDeliveryPhotoUrl(filePath: string): string {
  const { data } = supabase.storage.from('project-files').getPublicUrl(filePath)
  return data.publicUrl
}

export async function deleteDeliveryPhoto(id: string, filePath: string): Promise<void> {
  await supabase.storage.from('project-files').remove([filePath])
  const { error } = await supabase.from('delivery_photos').delete().eq('id', id)
  if (error) throw error
}

// All completed projects that have delivery photos (for the portfolio page)
export async function getPortfolioProjects(): Promise<{ project: Project; photos: DeliveryPhoto[] }[]> {
  const { data: photos, error } = await supabase
    .from('delivery_photos').select('*').order('created_at', { ascending: false })
  if (error) throw error
  const byProject = new Map<string, DeliveryPhoto[]>()
  for (const ph of (photos ?? []) as DeliveryPhoto[]) {
    if (!byProject.has(ph.project_id)) byProject.set(ph.project_id, [])
    byProject.get(ph.project_id)!.push(ph)
  }
  if (byProject.size === 0) return []
  const { data: projects } = await supabase
    .from('projects').select('*, customer:customers(*)')
    .in('id', Array.from(byProject.keys()))
  return ((projects ?? []) as Project[])
    .map(p => ({ project: p, photos: byProject.get(p.id) ?? [] }))
    .sort((a, b) => (b.project.updated_at ?? '').localeCompare(a.project.updated_at ?? ''))
}

// ── Custom Project Types ───────────────────────────────────────────────────

export async function getCustomProjectTypes(): Promise<CustomProjectType[]> {
  const { data, error } = await supabase
    .from('custom_project_types').select('*').eq('is_active', true).order('name')
  if (error) throw error
  return data as CustomProjectType[]
}

export async function createCustomProjectType(input: { name: string; key: string }): Promise<CustomProjectType> {
  const { data, error } = await supabase
    .from('custom_project_types').insert({ ...input, is_active: true }).select().single()
  if (error) throw error
  return data as CustomProjectType
}

export async function updateCustomProjectType(
  id: string,
  input: Partial<{ name: string; is_active: boolean }>
): Promise<CustomProjectType> {
  const { data, error } = await supabase
    .from('custom_project_types').update(input).eq('id', id).select().single()
  if (error) throw error
  return data as CustomProjectType
}

export async function deleteCustomProjectType(id: string): Promise<void> {
  const { error } = await supabase.from('custom_project_types').delete().eq('id', id)
  if (error) throw error
}

// ── Samples ────────────────────────────────────────────────────────────────

export async function getSamplesByProjectId(projectId: string): Promise<Sample[]> {
  const { data, error } = await supabase
    .from('samples')
    .select('*')
    .eq('project_id', projectId)
    .order('date_given', { ascending: false })
  if (error) throw error
  return data as Sample[]
}

// All unreturned samples across all projects (for dashboard badges + Master Doc)
export async function getSamplesOut(): Promise<Sample[]> {
  const { data, error } = await supabase
    .from('samples')
    .select('*, project:projects(*, customer:customers(*)), customer:customers(*)')
    .eq('checked_in', false)
    .order('date_given')
  if (error) throw error
  return data as Sample[]
}

export async function createSample(
  input: Omit<Sample, 'id' | 'created_at' | 'project' | 'customer'>
): Promise<Sample> {
  const { data, error } = await supabase.from('samples').insert(input).select().single()
  if (error) throw error
  return data as Sample
}

export async function updateSample(
  id: string,
  input: Partial<Omit<Sample, 'id' | 'created_at' | 'project' | 'customer'>>
): Promise<Sample> {
  const { data, error } = await supabase
    .from('samples')
    .update(input)
    .eq('id', id).select().single()
  if (error) throw error
  return data as Sample
}

export async function deleteSample(id: string): Promise<void> {
  const { error } = await supabase.from('samples').delete().eq('id', id)
  if (error) throw error
}

// ── Design Meeting Requests ────────────────────────────────────────────────

// Projects flagged design_meeting_requested = true that have NO upcoming
// appointment-type calendar event linked to them.
export async function getPendingDesignMeetingRequests(): Promise<Project[]> {
  const { data: requested, error } = await supabase
    .from('projects')
    .select('*, customer:customers(*)')
    .eq('design_meeting_requested', true)
  if (error) throw error
  const list = (requested ?? []) as Project[]
  if (list.length === 0) return []

  const today = new Date().toISOString().slice(0, 10)
  const { data: upcoming } = await supabase
    .from('calendar_events')
    .select('project_id')
    .eq('event_type', 'appointment')
    .gte('event_date', today)
    .in('project_id', list.map(p => p.id))
  const scheduledIds = new Set((upcoming ?? []).map((e: { project_id: string | null }) => e.project_id))
  return list.filter(p => !scheduledIds.has(p.id))
}

export async function getShopTaskProjects(): Promise<ShopTaskProject[]> {
  // Get all active shop projects with their current step
  const { data: projects, error } = await supabase
    .from('projects')
    .select('*, customer:customers(*)')
    .in('status', ['deposit_received', 'in_production', 'ready_for_delivery'])
  if (error) throw error

  const results: ShopTaskProject[] = []
  await Promise.all((projects ?? []).map(async (p: Project) => {
    const { data: steps } = await supabase
      .from('production_steps').select('*').eq('project_id', p.id).eq('is_current', true).single()
    if (!steps) return
    const [{ data: subtasksData }, { count: qCount }] = await Promise.all([
      supabase.from('step_subtasks').select('*').eq('step_id', steps.id).eq('completed', false).order('created_at'),
      supabase.from('open_questions').select('id', { count: 'exact', head: true })
        .eq('project_id', p.id).eq('resolved', false),
    ])
    const openSubtasks = subtasksData ?? []
    const ageHours = (Date.now() - new Date(steps.created_at).getTime()) / 3600000
    results.push({
      project: p as Project,
      currentStep: steps as ProductionStep,
      subtasks: openSubtasks as StepSubtask[],
      openSubtasks: openSubtasks.length,
      unresolvedQuestions: qCount ?? 0,
      stepAgeHours: Math.round(ageHours),
    })
  }))
  return results
}
