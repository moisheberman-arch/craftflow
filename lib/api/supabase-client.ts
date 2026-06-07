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

export async function setCurrentStep(projectId: string, stepId: string): Promise<void> {
  // Clear all is_current for project
  await supabase.from('production_steps')
    .update({ is_current: false }).eq('project_id', projectId)
  // Set the chosen step as current
  await supabase.from('production_steps')
    .update({ is_current: true }).eq('id', stepId)
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
  projectId: string,
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
  openSubtasks: number
  unresolvedQuestions: number
  stepAgeHours: number
}

export async function getShopTaskProjects(): Promise<ShopTaskProject[]> {
  // Get all active shop projects with their current step
  const { data: projects, error } = await supabase
    .from('projects')
    .select('*, customer:customers(*)')
    .in('status', ['deposit_received', 'in_production'])
  if (error) throw error

  const results: ShopTaskProject[] = []
  await Promise.all((projects ?? []).map(async (p: Project) => {
    const { data: steps } = await supabase
      .from('production_steps').select('*').eq('project_id', p.id).eq('is_current', true).single()
    if (!steps) return
    const [{ count: subCount }, { count: qCount }] = await Promise.all([
      supabase.from('step_subtasks').select('id', { count: 'exact', head: true })
        .eq('step_id', steps.id).eq('completed', false),
      supabase.from('open_questions').select('id', { count: 'exact', head: true })
        .eq('project_id', p.id).eq('resolved', false),
    ])
    const ageHours = (Date.now() - new Date(steps.created_at).getTime()) / 3600000
    results.push({
      project: p as Project,
      currentStep: steps as ProductionStep,
      openSubtasks: subCount ?? 0,
      unresolvedQuestions: qCount ?? 0,
      stepAgeHours: Math.round(ageHours),
    })
  }))
  return results
}
