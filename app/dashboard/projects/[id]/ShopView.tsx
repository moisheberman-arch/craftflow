'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  updateProject, updateCustomer, deleteProject, getProjectCountByCustomerId, deleteCustomer,
  getMaterialsByProjectId, addMaterial, updateMaterial, deleteMaterial,
  getStepsByProjectId, addStep, updateStep, deleteStep, getStepLibrary, addStepToLibrary,
  getSubtasksByStepId, addSubtask, updateSubtask, deleteSubtask,
  getNotesByProjectId, addDesignMeetingNote, deleteNote,
  getShoppingListByProjectId, addShoppingListItem, updateShoppingListItem, deleteShoppingListItem,
  getOpenQuestionsByProjectId, addOpenQuestion, resolveQuestion, deleteQuestion,
  setCurrentStep, autoAdvanceCurrentStep, seedDefaultStepsIfEmpty,
  getFilesByProjectId, uploadProjectFile, getProjectFileUrl, deleteProjectFile,
  getDeliveryPhotosByProjectId, uploadDeliveryPhoto, getDeliveryPhotoUrl, deleteDeliveryPhoto,
  initializeProjectWorkflow,
} from '@/lib/api/supabase-client'
import WorkflowPanel from '@/components/WorkflowPanel'
import type {
  Project, Customer, MaterialItem, ProductionStep, StepLibraryItem,
  DesignMeetingNote, ShoppingListItem, StepSubtask, OpenQuestion,
  ProjectType, ProjectStatus, StepType, WaitingOn, QuestionDirectedAt,
  ProjectFile, DeliveryPhoto,
} from '@/lib/core/types'

const PROJECT_TYPES: ProjectType[] = ['dining_table', 'built_in', 'bookcase', 'buffet', 'other']
const STATUSES: ProjectStatus[] = [
  'lead', 'tentative_quote_sent', 'design_meeting_scheduled',
  'post_design_meeting', 'rendering_in_progress', 'final_quote_issued',
  'deposit_received', 'in_production', 'ready_for_delivery', 'completed',
]
const STATUS_LABELS: Record<ProjectStatus, string> = {
  lead: 'Lead',
  tentative_quote_sent: 'Tentative Quote Sent',
  design_meeting_scheduled: 'Design Meeting Scheduled',
  post_design_meeting: 'Post Design Meeting',
  rendering_in_progress: 'Rendering In Progress',
  final_quote_issued: 'Final Quote Issued',
  deposit_received: 'Deposit Received',
  in_production: 'In Production',
  ready_for_delivery: 'Ready for Delivery',
  completed: 'Completed',
}

// ── Small helper components ────────────────────────────────────────────────

function Badge({ type, label }: { type: 'action' | 'waiting' | 'customer' | 'internal' | 'supplier' | 'designer'; label?: string }) {
  const map: Record<string, string> = {
    action: 'bg-emerald-100 text-emerald-700',
    waiting: 'bg-orange-100 text-orange-700',
    customer: 'bg-blue-100 text-blue-700',
    internal: 'bg-gray-200 text-gray-700',
    supplier: 'bg-purple-100 text-purple-700',
    designer: 'bg-pink-100 text-pink-700',
  }
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide ${map[type] ?? 'bg-gray-200 text-gray-700'}`}>
      {label ?? type}
    </span>
  )
}

// ── Subtask row ────────────────────────────────────────────────────────────
function SubtaskRow({ subtask, onToggle, onDelete }: {
  subtask: StepSubtask
  onToggle: () => void
  onDelete: () => void
}) {
  return (
    <div className="flex items-center gap-2 py-1">
      <input type="checkbox" checked={subtask.completed} onChange={onToggle}
        className="accent-blue-600 w-3.5 h-3.5 shrink-0 cursor-pointer" />
      <span className={`flex-1 text-xs ${subtask.completed ? 'line-through text-gray-500' : 'text-gray-800'}`}>
        {subtask.description}
      </span>
      <button onClick={onDelete} className="text-red-600 hover:text-red-600 text-xs">×</button>
    </div>
  )
}

// ── Step row (expandable) ─────────────────────────────────────────────────
function StepRow({
  step, index, isCurrent, projectId, stepLibrary,
  onToggle, onDelete, onSetCurrent, subtasksByStep, onSubtasksChange,
}: {
  step: ProductionStep
  index: number
  isCurrent: boolean
  projectId: string
  stepLibrary: StepLibraryItem[]
  onToggle: (step: ProductionStep) => void
  onDelete: (id: string) => void
  onSetCurrent: (id: string) => void
  subtasksByStep: Record<string, StepSubtask[]>
  onSubtasksChange: (stepId: string, subs: StepSubtask[]) => void
}) {
  const [expanded, setExpanded] = useState(isCurrent)
  const [newSub, setNewSub] = useState('')
  const subs = subtasksByStep[step.id] ?? []
  const hasIncomplete = subs.some(s => !s.completed)

  async function handleAddSub(e: React.FormEvent) {
    e.preventDefault()
    if (!newSub.trim()) return
    const s = await addSubtask(step.id, projectId, newSub.trim())
    onSubtasksChange(step.id, [...subs, s])
    setNewSub('')
  }

  async function handleToggleSub(sub: StepSubtask) {
    const u = await updateSubtask(sub.id, { completed: !sub.completed })
    onSubtasksChange(step.id, subs.map(s => s.id === sub.id ? u : s))
  }

  async function handleDeleteSub(id: string) {
    await deleteSubtask(id)
    onSubtasksChange(step.id, subs.filter(s => s.id !== id))
  }

  const rowClass = isCurrent
    ? 'border border-blue-400 bg-blue-50/30'
    : step.completed
    ? 'border border-gray-200 bg-gray-100/20'
    : 'border border-gray-200 bg-white shadow-sm'

  return (
    <div className={`rounded-lg ${rowClass} transition-all`}>
      <div
        className="flex items-center gap-2 px-3 py-2.5 cursor-pointer"
        onClick={() => setExpanded(e => !e)}
      >
        <span className="text-gray-500 text-xs w-5 shrink-0 text-right">{index}</span>
        <span className={`flex-1 text-sm font-medium ${step.completed ? 'line-through text-gray-500' : isCurrent ? 'text-blue-600' : 'text-gray-900'}`}>
          {step.step_name}
        </span>
        {isCurrent && <span className="text-[10px] text-blue-600 font-semibold uppercase">Current</span>}
        {step.is_optional && <Badge type="internal" label="Optional" />}
        <Badge type={step.step_type as 'action' | 'waiting'} />
        {subs.length > 0 && (
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${hasIncomplete ? 'bg-red-100 text-red-700' : 'bg-gray-200 text-gray-500'}`}>
            {subs.filter(s => s.completed).length}/{subs.length}
          </span>
        )}
        <span className="text-gray-400 text-xs">{expanded ? '▲' : '▼'}</span>
      </div>

      {expanded && (
        <div className="px-4 pb-3 border-t border-gray-200/50 pt-2 space-y-2">
          {step.step_type === 'waiting' && step.waiting_on && (
            <p className="text-xs text-orange-600">Waiting on: <strong>{step.waiting_on}</strong></p>
          )}

          {/* Subtasks */}
          {subs.map(sub => (
            <SubtaskRow key={sub.id} subtask={sub} onToggle={() => handleToggleSub(sub)} onDelete={() => handleDeleteSub(sub.id)} />
          ))}

          <form onSubmit={handleAddSub} className="flex gap-1.5">
            <input placeholder="Add subtask..." value={newSub} onChange={e => setNewSub(e.target.value)}
              className="flex-1 bg-gray-100 border border-gray-300 rounded px-2 py-1 text-xs text-gray-900 focus:outline-none" />
            <button type="submit" disabled={!newSub.trim()}
              className="bg-gray-200 hover:bg-gray-300 disabled:opacity-50 text-gray-900 px-2 py-1 rounded text-xs">+</button>
          </form>

          <div className="flex items-center gap-2 pt-1">
            {!step.completed && !isCurrent && (
              <button onClick={() => onSetCurrent(step.id)}
                className="text-xs text-blue-600 hover:text-blue-600">Set as Current</button>
            )}
            {!step.completed && (
              <button
                onClick={() => {
                  if (hasIncomplete) { alert('Complete all subtasks first.'); return }
                  onToggle(step)
                }}
                className="text-xs text-emerald-600 hover:text-emerald-600"
              >
                Mark Complete
              </button>
            )}
            <button onClick={() => onDelete(step.id)} className="text-xs text-red-600 hover:text-red-600 ml-auto">Delete Step</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main ShopView ─────────────────────────────────────────────────────────
export default function ShopView({ project: initialProject }: { project: Project }) {
  const router = useRouter()
  const [project, setProject] = useState(initialProject)
  const customer = project.customer as Customer | undefined

  // Left column
  const [cName, setCName] = useState(customer?.name ?? '')
  const [cPhone, setCPhone] = useState(customer?.phone ?? '')
  const [cEmail, setCEmail] = useState(customer?.email ?? '')
  const [cAddress, setCAddress] = useState(customer?.address ?? '')
  const [savingContact, setSavingContact] = useState(false)
  const [contactSaved, setContactSaved] = useState(false)

  const [pType, setPType] = useState<ProjectType | ''>(project.project_type ?? '')
  const [pStatus, setPStatus] = useState<ProjectStatus | ''>(project.status ?? '')
  const [colorFinishText, setColorFinishText] = useState(project.color_finish ?? '')
  const [woodSpecies, setWoodSpecies] = useState(project.primary_material ?? '')
  const [dimWidth, setDimWidth] = useState(project.width_inches != null ? String(project.width_inches) : '')
  const [dimHeight, setDimHeight] = useState(project.height_inches != null ? String(project.height_inches) : '')
  const [dimDepth, setDimDepth] = useState(project.depth_inches != null ? String(project.depth_inches) : '')
  const [ceilingHeight, setCeilingHeight] = useState(project.ceiling_height_inches != null ? String(project.ceiling_height_inches) : '')
  const [pNotes, setPNotes] = useState(project.notes ?? '')

  // Step-specific data capture state
  const [stepDataSaving, setStepDataSaving] = useState(false)
  const [stepDataSaved, setStepDataSaved] = useState(false)
  const [measureWidth, setMeasureWidth] = useState(project.width_inches != null ? String(project.width_inches) : '')
  const [measureHeight, setMeasureHeight] = useState(project.height_inches != null ? String(project.height_inches) : '')
  const [measureDepth, setMeasureDepth] = useState(project.depth_inches != null ? String(project.depth_inches) : '')
  const [measureCeiling, setMeasureCeiling] = useState(project.ceiling_height_inches != null ? String(project.ceiling_height_inches) : '')
  const [measureNotes, setMeasureNotes] = useState('')
  const [finishColor, setFinishColor] = useState(project.color_finish ?? '')
  const [approvalDate, setApprovalDate] = useState('')
  const [approvalCustomerNotes, setApprovalCustomerNotes] = useState('')
  const [savingDetails, setSavingDetails] = useState(false)
  const [detailsSaved, setDetailsSaved] = useState(false)

  // Fix 4: collapsible step list
  const [stepsExpanded, setStepsExpanded] = useState(false)

  // Fix 3: delete modal
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showDeleteCustomer, setShowDeleteCustomer] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const showCeiling = pType === 'built_in' || pType === 'bookcase'

  // Questions
  const [questions, setQuestions] = useState<OpenQuestion[]>([])
  const [showResolved, setShowResolved] = useState(false)
  const [showAddQ, setShowAddQ] = useState(false)
  const [qText, setQText] = useState('')
  const [qDirected, setQDirected] = useState<QuestionDirectedAt>('customer')
  const [qStepId, setQStepId] = useState('')
  const [addingQ, setAddingQ] = useState(false)
  const [resolvingId, setResolvingId] = useState<string | null>(null)
  const [resolveAnswer, setResolveAnswer] = useState('')

  // Design notes
  const [designNotes, setDesignNotes] = useState<DesignMeetingNote[]>([])
  const [newNote, setNewNote] = useState('')
  const [addingNote, setAddingNote] = useState(false)

  // Steps
  const [steps, setSteps] = useState<ProductionStep[]>([])
  const [stepLibrary, setStepLibrary] = useState<StepLibraryItem[]>([])
  const [subtasksByStep, setSubtasksByStep] = useState<Record<string, StepSubtask[]>>({})
  const [showAddStep, setShowAddStep] = useState(false)
  const [newStepName, setNewStepName] = useState('')
  const [newStepType, setNewStepType] = useState<StepType>('action')
  const [newStepWaiting, setNewStepWaiting] = useState<WaitingOn | ''>('')
  const [newStepOptional, setNewStepOptional] = useState(false)
  const [addingStep, setAddingStep] = useState(false)
  const [libPrompt, setLibPrompt] = useState<string | null>(null)
  const [advancing, setAdvancing] = useState(false)

  // Materials
  const [materials, setMaterials] = useState<MaterialItem[]>([])
  const [matName, setMatName] = useState('')
  const [matCost, setMatCost] = useState('')
  const [addingMat, setAddingMat] = useState(false)

  // Shopping list
  const [shopItems, setShopItems] = useState<ShoppingListItem[]>([])
  const [shopInput, setShopInput] = useState('')
  const [addingShop, setAddingShop] = useState(false)

  // Files
  const [files, setFiles] = useState<ProjectFile[]>([])
  const [uploadingFile, setUploadingFile] = useState(false)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)

  // Delivery photos
  const [deliveryPhotos, setDeliveryPhotos] = useState<DeliveryPhoto[]>([])
  const [photoBannerDismissed, setPhotoBannerDismissed] = useState(false)
  const [showPhotoModal, setShowPhotoModal] = useState(false)
  const [pendingPhotos, setPendingPhotos] = useState<{ file: File; preview: string; caption: string }[]>([])
  const [uploadingPhotos, setUploadingPhotos] = useState(false)
  const [confirmDeletePhotoId, setConfirmDeletePhotoId] = useState<string | null>(null)

  const id = project.id

  useEffect(() => {
    async function load() {
      const [s, sl, m, dn, shop, q, f] = await Promise.all([
        getStepsByProjectId(id).catch(() => [] as ProductionStep[]),
        getStepLibrary().catch(() => [] as StepLibraryItem[]),
        getMaterialsByProjectId(id).catch(() => [] as MaterialItem[]),
        getNotesByProjectId(id).catch(() => [] as DesignMeetingNote[]),
        getShoppingListByProjectId(id).catch(() => [] as ShoppingListItem[]),
        getOpenQuestionsByProjectId(id).catch(() => [] as OpenQuestion[]),
        getFilesByProjectId(id).catch(() => [] as ProjectFile[]),
      ])
      setSteps(s)
      setStepLibrary(sl)
      setMaterials(m)
      setDesignNotes(dn)
      setShopItems(shop)
      setQuestions(q)
      setFiles(f)
      getDeliveryPhotosByProjectId(id).then(setDeliveryPhotos).catch(() => {})
      // Preload subtasks for current step
      const curr = s.find(x => x.is_current)
      if (curr) {
        const subs = await getSubtasksByStepId(curr.id).catch(() => [])
        setSubtasksByStep({ [curr.id]: subs })
      }
      // Safety net: seed steps if project is deposit_received/in_production but has none
      if (s.length === 0 && (initialProject.status === 'deposit_received' || initialProject.status === 'in_production')) {
        seedDefaultStepsIfEmpty(id).then(() => getStepsByProjectId(id)).then(setSteps).catch(console.error)
      }
    }
    load()
  }, [id])

  const currentStep = steps.find(s => s.is_current)
  const nextStep = currentStep
    ? steps.find(s => !s.completed && !s.is_current && (s.sequence_order ?? 0) > (currentStep.sequence_order ?? 0))
    : steps.find(s => !s.completed)

  // Load subtasks when a step is expanded
  async function ensureSubtasksLoaded(stepId: string) {
    if (subtasksByStep[stepId]) return
    const subs = await getSubtasksByStepId(stepId).catch(() => [])
    setSubtasksByStep(prev => ({ ...prev, [stepId]: subs }))
  }

  // ── Contact save ────────────────────────────────────────────────────────
  async function saveContact() {
    setSavingContact(true)
    try {
      if (customer?.id) {
        await updateCustomer(customer.id, { name: cName, phone: cPhone || null, email: cEmail || null, address: cAddress || null })
      }
      const updated = await updateProject(id, { address: cAddress || null })
      setProject(updated)
      setContactSaved(true)
      setTimeout(() => setContactSaved(false), 2000)
    } finally { setSavingContact(false) }
  }

  // ── Delivery window helpers ──────────────────────────────────────────────
  function deliveryDisplay() {
    const start = project.expected_delivery_start
    const end = project.expected_delivery_end
    if (!end) return null
    const endDate = new Date(end)
    const daysLeft = Math.ceil((endDate.getTime() - Date.now()) / 86400000)
    const fmt = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    const label = start ? `${fmt(start)} — ${fmt(end)}` : fmt(end)
    const color = daysLeft < 0
      ? 'bg-red-100 text-red-700'
      : daysLeft <= 7
      ? 'bg-orange-100 text-orange-700'
      : 'bg-emerald-100 text-emerald-700'
    const icon = daysLeft < 0 ? '⚠ ' : '📅 '
    return { label, color, icon, daysLeft }
  }

  // ── Step-specific data save ───────────────────────────────────────────────
  async function saveStepData(patch: Parameters<typeof updateProject>[1]) {
    setStepDataSaving(true)
    try {
      const updated = await updateProject(id, patch)
      setProject(updated)
      setStepDataSaved(true)
      setTimeout(() => setStepDataSaved(false), 2000)
    } finally { setStepDataSaving(false) }
  }

  // ── Details save — writes primary_material + dimensions back to project ──
  async function saveDetails() {
    setSavingDetails(true)
    try {
      const updated = await updateProject(id, {
        project_type: (pType as ProjectType) || null,
        status: (pStatus as ProjectStatus) || null,
        notes: pNotes || null,
        primary_material: woodSpecies || null,
        width_inches: dimWidth ? parseFloat(dimWidth) : null,
        height_inches: dimHeight ? parseFloat(dimHeight) : null,
        depth_inches: dimDepth ? parseFloat(dimDepth) : null,
        ceiling_height_inches: ceilingHeight ? parseFloat(ceilingHeight) : null,
        required_fields_completed: {
          ...project.required_fields_completed,
          color_finish: !!colorFinishText,
          project_type: !!pType,
        },
      })
      setProject(updated)
      if (pStatus === 'deposit_received') {
        seedDefaultStepsIfEmpty(id).catch(console.error)
        initializeProjectWorkflow(id).catch(console.error)
      }
      setDetailsSaved(true)
      setTimeout(() => setDetailsSaved(false), 2000)
    } finally { setSavingDetails(false) }
  }

  // ── Fix 3: Delete project ────────────────────────────────────────────────
  async function handleDeleteProject() {
    setDeleting(true)
    try {
      await deleteProject(id)
      const customerId = project.customer_id
      if (customerId) {
        const remaining = await getProjectCountByCustomerId(customerId)
        if (remaining === 0) {
          setShowDeleteConfirm(false)
          setShowDeleteCustomer(true)
          return
        }
      }
      router.push('/dashboard/shop')
    } catch (err) {
      alert(`Delete failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  async function handleDeleteCustomerToo() {
    if (project.customer_id) {
      await deleteCustomer(project.customer_id).catch(console.error)
    }
    router.push('/dashboard/shop')
  }

  // ── Mark Complete & Advance ──────────────────────────────────────────────
  async function handleMarkCompleteAndAdvance() {
    if (!currentStep) return
    const currSubs = subtasksByStep[currentStep.id] ?? []
    if (currSubs.some(s => !s.completed)) {
      alert('Complete all subtasks on the current step first.')
      return
    }
    setAdvancing(true)
    try {
      const { nextStep: next, projectCompleted } = await autoAdvanceCurrentStep(id, currentStep.id)
      if (projectCompleted) {
        const updated = await updateProject(id, { status: 'completed' })
        setProject(updated)
        setPStatus('completed')
        alert('All steps complete! Project marked as delivered.')
      }
      // Refresh steps
      const fresh = await getStepsByProjectId(id)
      setSteps(fresh)
      if (next) {
        const subs = await getSubtasksByStepId(next.id).catch(() => [])
        setSubtasksByStep(prev => ({ ...prev, [next.id]: subs }))
      }
    } finally { setAdvancing(false) }
  }

  // ── Set current step ────────────────────────────────────────────────────
  async function handleSetCurrent(stepId: string) {
    await setCurrentStep(id, stepId)
    const fresh = await getStepsByProjectId(id)
    setSteps(fresh)
    await ensureSubtasksLoaded(stepId)
  }

  // ── Toggle step complete (from step list) ───────────────────────────────
  async function handleToggleStep(step: ProductionStep) {
    const currSubs = subtasksByStep[step.id] ?? []
    if (!step.completed && currSubs.some(s => !s.completed)) {
      alert('Complete all subtasks first.')
      return
    }
    const u = await updateStep(step.id, { completed: !step.completed, is_current: step.is_current && step.completed })
    setSteps(prev => prev.map(s => s.id === step.id ? u : s))
  }

  // ── Add step ────────────────────────────────────────────────────────────
  async function handleAddStep(e: React.FormEvent) {
    e.preventDefault()
    if (!newStepName.trim()) return
    setAddingStep(true)
    try {
      const maxOrder = steps.reduce((m, s) => Math.max(m, s.sequence_order ?? 0), 0)
      const s = await addStep({
        project_id: id,
        step_name: newStepName,
        description: null,
        sequence_order: maxOrder + 1,
        completed: false,
        assigned_to: null,
        notes: null,
        step_type: newStepType,
        waiting_on: (newStepWaiting as WaitingOn) || null,
        is_current: false,
        is_optional: newStepOptional,
      })
      setSteps(prev => [...prev, s])
      setShowAddStep(false)
      setNewStepName(''); setNewStepType('action'); setNewStepWaiting(''); setNewStepOptional(false)
      const inLib = stepLibrary.some(l => l.step_name === newStepName)
      if (!inLib) setLibPrompt(newStepName)
    } finally { setAddingStep(false) }
  }

  async function saveToLibrary(name: string) {
    const item = await addStepToLibrary({ step_name: name, description: null, category: null, step_type: newStepType, waiting_on: (newStepWaiting as WaitingOn) || null, is_optional: newStepOptional, sequence_order: null })
    setStepLibrary(prev => [...prev, item])
    setLibPrompt(null)
  }

  // ── Questions ────────────────────────────────────────────────────────────
  async function handleAddQuestion(e: React.FormEvent) {
    e.preventDefault()
    if (!qText.trim()) return
    setAddingQ(true)
    try {
      const q = await addOpenQuestion(id, qText.trim(), qDirected, qStepId || null)
      setQuestions(prev => [q, ...prev])
      setQText(''); setShowAddQ(false)
    } finally { setAddingQ(false) }
  }

  async function handleResolve(qId: string) {
    if (!resolveAnswer.trim()) return
    const updated = await resolveQuestion(qId, resolveAnswer.trim())
    setQuestions(prev => prev.map(q => q.id === qId ? updated : q))
    setResolvingId(null)
    setResolveAnswer('')
  }

  // ── Design notes ─────────────────────────────────────────────────────────
  async function handleAddNote(e: React.FormEvent) {
    e.preventDefault()
    if (!newNote.trim()) return
    setAddingNote(true)
    try {
      const n = await addDesignMeetingNote(id, newNote.trim())
      setDesignNotes(prev => [n, ...prev])
      setNewNote('')
    } finally { setAddingNote(false) }
  }

  // ── Materials ────────────────────────────────────────────────────────────
  async function handleAddMat(e: React.FormEvent) {
    e.preventDefault()
    setAddingMat(true)
    try {
      const m = await addMaterial({ project_id: id, item_name: matName, cost_estimate: matCost ? parseFloat(matCost) : null, ordered: false, received: false, notes: null })
      setMaterials(prev => [...prev, m])
      setMatName(''); setMatCost('')
    } finally { setAddingMat(false) }
  }

  // ── File uploads ──────────────────────────────────────────────────────────
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? [])
    if (selected.length === 0) return
    setUploadingFile(true)
    try {
      const uploaded = await Promise.all(selected.map(f => uploadProjectFile(id, f)))
      setFiles(prev => [...uploaded, ...prev])
    } catch (err) {
      console.error('File upload failed:', err)
    } finally {
      setUploadingFile(false)
      e.target.value = ''
    }
  }

  async function handleDeleteFile(file: ProjectFile) {
    await deleteProjectFile(file.id, file.file_path).catch(console.error)
    setFiles(prev => prev.filter(f => f.id !== file.id))
  }

  // ── Shopping list ─────────────────────────────────────────────────────────
  async function handleAddShop(e: React.FormEvent) {
    e.preventDefault()
    if (!shopInput.trim()) return
    setAddingShop(true)
    try {
      const item = await addShoppingListItem(id, shopInput.trim())
      setShopItems(prev => [...prev, item])
      setShopInput('')
    } finally { setAddingShop(false) }
  }

  // ── Delivery photos ───────────────────────────────────────────────────────
  function handlePickPhotos(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? [])
    setPendingPhotos(prev => [
      ...prev,
      ...selected.map(file => ({ file, preview: URL.createObjectURL(file), caption: '' })),
    ])
    e.target.value = ''
  }

  async function handleUploadAllPhotos() {
    if (pendingPhotos.length === 0) return
    setUploadingPhotos(true)
    try {
      const uploaded: DeliveryPhoto[] = []
      for (const p of pendingPhotos) {
        uploaded.push(await uploadDeliveryPhoto(id, p.file, p.caption))
      }
      setDeliveryPhotos(prev => [...uploaded, ...prev])
      pendingPhotos.forEach(p => URL.revokeObjectURL(p.preview))
      setPendingPhotos([])
    } catch (err) {
      alert(`Upload failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setUploadingPhotos(false)
    }
  }

  async function handleDeletePhoto(photo: DeliveryPhoto) {
    await deleteDeliveryPhoto(photo.id, photo.file_path).catch(console.error)
    setDeliveryPhotos(prev => prev.filter(p => p.id !== photo.id))
    setConfirmDeletePhotoId(null)
  }

  const showPhotoBanner = !photoBannerDismissed &&
    (project.status === 'completed' || currentStep?.step_name === 'Delivered and Installed')
  const showPhotoSection = deliveryPhotos.length > 0 || project.status === 'completed'

  const unresolvedQ = questions.filter(q => !q.resolved)
  const resolvedQ = questions.filter(q => q.resolved)
  const completedCount = steps.filter(s => s.completed).length

  return (
    <div className="flex flex-col h-full">
      {/* Delivery photo prompt banner */}
      {showPhotoBanner && (
        <div className="bg-emerald-50/40 border border-emerald-300 rounded-xl px-4 py-3 mb-4 flex items-center justify-between gap-3 flex-wrap shrink-0">
          <p className="text-sm text-emerald-600 font-medium">
            🎉 Project Complete! Don&apos;t forget to capture delivery photos for your portfolio.
          </p>
          <div className="flex gap-2 shrink-0">
            <button onClick={() => setShowPhotoModal(true)}
              className="text-xs bg-emerald-700 hover:bg-emerald-600 text-white font-semibold px-4 py-2 rounded-lg">
              Upload Photos Now
            </button>
            <button onClick={() => setPhotoBannerDismissed(true)}
              className="text-xs text-gray-500 hover:text-gray-900 px-3 py-2">
              Skip
            </button>
          </div>
        </div>
      )}

      {/* Top bar */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div className="flex items-center gap-3 flex-wrap">
          <Link href="/dashboard/shop" className="text-gray-500 hover:text-gray-700 text-sm">← Shop</Link>
          <h1 className="text-lg font-bold text-gray-900">
            {customer?.name ?? 'Project'}
            {project.project_type && (
              <span className="text-gray-500 font-normal ml-2 text-base capitalize">
                — {project.project_type.replace(/_/g, ' ')}
              </span>
            )}
          </h1>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
            project.status === 'in_production' ? 'bg-orange-100 text-orange-700' :
            project.status === 'ready_for_delivery' ? 'bg-teal-100 text-teal-700' :
            project.status === 'deposit_received' ? 'bg-green-100 text-green-700' :
            'bg-gray-200 text-gray-700'
          }`}>{project.status ? STATUS_LABELS[project.status] : '—'}</span>
          {!currentStep && (project.status === 'deposit_received' || project.status === 'in_production') && (
            <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-semibold">⚠ No Active Step</span>
          )}
        </div>
        <div className="text-sm text-gray-500 shrink-0">{completedCount}/{steps.length} steps</div>
      </div>

      {/* Two-column layout */}
      <div className="flex gap-5 flex-1 min-h-0 overflow-y-auto">

        {/* ── LEFT COLUMN ── */}
        <div className="w-[35%] shrink-0 space-y-4 overflow-y-auto pr-1">

          {/* Card 1: Project Info — read-only compact */}
          {(() => {
            const delivery = deliveryDisplay()
            return (
              <div className="bg-white shadow-sm border border-gray-200 rounded-xl p-3.5 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-bold text-gray-900 text-base leading-tight">{customer?.name ?? 'Unknown'}</p>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase ${
                    project.status === 'in_production' ? 'bg-orange-100 text-orange-700' :
                    project.status === 'ready_for_delivery' ? 'bg-teal-100 text-teal-700' :
                    project.status === 'deposit_received' ? 'bg-green-100 text-green-700' :
                    'bg-gray-200 text-gray-700'
                  }`}>{project.status ? STATUS_LABELS[project.status as ProjectStatus] : '—'}</span>
                  {delivery && (
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${delivery.color}`}>
                      {delivery.icon}{delivery.label}
                    </span>
                  )}
                </div>
                <div className="space-y-1 text-xs text-gray-500">
                  {customer?.phone && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <a href={`tel:${customer.phone}`} className="text-blue-600 hover:underline">{customer.phone}</a>
                      {customer?.contact_preferences?.call && <span className="text-[9px] font-semibold bg-emerald-100 text-emerald-700 px-1 py-0.5 rounded">📞 Call</span>}
                      {customer?.contact_preferences?.text && <span className="text-[9px] font-semibold bg-blue-100 text-blue-700 px-1 py-0.5 rounded">💬 Text</span>}
                      {customer?.contact_preferences?.whatsapp && <span className="text-[9px] font-semibold bg-green-100 text-green-700 px-1 py-0.5 rounded">📱 WA</span>}
                    </div>
                  )}
                  {customer?.email && (
                    <div><a href={`mailto:${customer.email}`} className="text-blue-600 hover:underline truncate block">{customer.email}</a></div>
                  )}
                  {(project.address || customer?.address) && (
                    <div className="text-gray-500">{project.address ?? customer?.address}</div>
                  )}
                </div>
              </div>
            )
          })()}

          {/* Card 2: Key Details */}
          <div className="bg-white shadow-sm border border-gray-200 rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-800">Key Details</h3>

            {/* Color/Finish — highlighted if empty */}
            <div>
              <label className={`text-xs font-semibold ${!colorFinishText ? 'text-yellow-600' : 'text-gray-500'}`}>
                🎨 Color / Finish {!colorFinishText && '⚠ Missing'}
              </label>
              <input
                value={colorFinishText}
                onChange={e => setColorFinishText(e.target.value)}
                placeholder="e.g. BM White Dove, natural walnut..."
                className={`w-full mt-0.5 bg-gray-100 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500 border ${!colorFinishText ? 'border-yellow-400' : 'border-gray-300'}`}
              />
            </div>

            <div>
              <label className="text-xs text-gray-500">Project Type</label>
              <select value={pType} onChange={e => setPType(e.target.value as ProjectType)}
                className="w-full mt-0.5 bg-gray-100 border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none">
                <option value="">—</option>
                {PROJECT_TYPES.map(t => <option key={t} value={t} className="capitalize">{t.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500">Wood Species / Material</label>
              <input value={woodSpecies} onChange={e => setWoodSpecies(e.target.value)}
                placeholder="e.g. Maple, Walnut, Painted MDF"
                className="w-full mt-0.5 bg-gray-100 border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(['W', 'H', 'D'] as const).map((dim, i) => (
                <div key={dim}>
                  <label className="text-xs text-gray-500">{dim}&quot;</label>
                  <input type="number" placeholder={dim}
                    value={[dimWidth, dimHeight, dimDepth][i]}
                    onChange={e => [setDimWidth, setDimHeight, setDimDepth][i](e.target.value)}
                    className="w-full mt-0.5 bg-gray-100 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-900 focus:outline-none" />
                </div>
              ))}
            </div>
            {showCeiling && (
              <div>
                <label className="text-xs text-gray-500">Ceiling Height</label>
                <input value={ceilingHeight} onChange={e => setCeilingHeight(e.target.value)}
                  placeholder='e.g. 9&apos;4"'
                  className="w-full mt-0.5 bg-gray-100 border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>
            )}
            <div>
              <label className="text-xs text-gray-500">Notes</label>
              <textarea rows={3} value={pNotes} onChange={e => setPNotes(e.target.value)}
                className="w-full mt-0.5 bg-gray-100 border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none resize-none focus:ring-1 focus:ring-blue-500" />
            </div>
            <button onClick={saveDetails} disabled={savingDetails}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold text-sm py-1.5 rounded-lg transition-colors">
              {savingDetails ? 'Saving...' : detailsSaved ? '✓ Saved' : 'Save Changes'}
            </button>
          </div>

          {/* Card 3: Open Questions */}
          <div className="bg-white shadow-sm border border-gray-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-800">
                Open Questions
                {unresolvedQ.length > 0 && (
                  <span className="ml-2 text-[10px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-semibold">{unresolvedQ.length}</span>
                )}
              </h3>
              <button onClick={() => setShowAddQ(v => !v)} className="text-xs text-blue-600 hover:text-blue-500">+ Add</button>
            </div>

            {showAddQ && (
              <form onSubmit={handleAddQuestion} className="space-y-2 bg-gray-100 rounded-lg p-3">
                <textarea rows={2} placeholder="Question..." value={qText} onChange={e => setQText(e.target.value)}
                  className="w-full bg-gray-200 border border-gray-300 rounded px-2 py-1 text-xs text-gray-900 focus:outline-none resize-none" />
                <div className="flex gap-2">
                  <select value={qDirected} onChange={e => setQDirected(e.target.value as QuestionDirectedAt)}
                    className="flex-1 bg-gray-200 border border-gray-300 rounded px-2 py-1 text-xs text-gray-900 focus:outline-none">
                    <option value="customer">Customer</option>
                    <option value="internal">Internal</option>
                  </select>
                  <select value={qStepId} onChange={e => setQStepId(e.target.value)}
                    className="flex-1 bg-gray-200 border border-gray-300 rounded px-2 py-1 text-xs text-gray-900 focus:outline-none">
                    <option value="">No step</option>
                    {steps.map(s => <option key={s.id} value={s.id}>{s.step_name}</option>)}
                  </select>
                </div>
                <div className="flex gap-2">
                  <button type="submit" disabled={addingQ || !qText.trim()}
                    className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold px-3 py-1 rounded text-xs">
                    {addingQ ? '...' : 'Add'}
                  </button>
                  <button type="button" onClick={() => setShowAddQ(false)} className="text-gray-500 text-xs">Cancel</button>
                </div>
              </form>
            )}

            {unresolvedQ.length === 0 && !showAddQ && (
              <p className="text-xs text-gray-500">No open questions</p>
            )}

            <div className="space-y-2">
              {unresolvedQ.map(q => (
                <div key={q.id} className="bg-gray-100 rounded-lg p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs text-gray-900 flex-1">{q.question}</p>
                    <Badge type={q.directed_at as 'customer' | 'internal'} />
                  </div>
                  <p className="text-[10px] text-gray-500">{new Date(q.created_at).toLocaleDateString()}</p>
                  {resolvingId === q.id ? (
                    <div className="space-y-1">
                      <input placeholder="Answer..." value={resolveAnswer} onChange={e => setResolveAnswer(e.target.value)}
                        className="w-full bg-gray-200 border border-gray-300 rounded px-2 py-1 text-xs text-gray-900 focus:outline-none" />
                      <div className="flex gap-2">
                        <button onClick={() => handleResolve(q.id)} disabled={!resolveAnswer.trim()}
                          className="bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white px-2 py-0.5 rounded text-xs">Resolve</button>
                        <button onClick={() => setResolvingId(null)} className="text-gray-500 text-xs">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-3">
                      <button onClick={() => { setResolvingId(q.id); setResolveAnswer('') }}
                        className="text-xs text-emerald-600 hover:text-emerald-600">Resolve</button>
                      <button onClick={() => deleteQuestion(q.id).then(() => setQuestions(prev => prev.filter(x => x.id !== q.id)))}
                        className="text-xs text-red-600 hover:text-red-600">Delete</button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {resolvedQ.length > 0 && (
              <button onClick={() => setShowResolved(v => !v)} className="text-xs text-gray-500 hover:text-gray-500">
                {showResolved ? 'Hide' : `Show`} Resolved ({resolvedQ.length})
              </button>
            )}
            {showResolved && resolvedQ.map(q => (
              <div key={q.id} className="bg-gray-100/50 rounded-lg p-2 opacity-60">
                <p className="text-xs text-gray-500 line-through">{q.question}</p>
                {q.answer && <p className="text-xs text-gray-500 mt-1">→ {q.answer}</p>}
              </div>
            ))}
          </div>

          {/* Card 4: Design Notes */}
          <div className="bg-white shadow-sm border border-gray-200 rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-800">Design Meeting Notes</h3>
            <form onSubmit={handleAddNote} className="flex gap-2">
              <input value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="Add a note..."
                className="flex-1 bg-gray-100 border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500" />
              <button type="submit" disabled={addingNote || !newNote.trim()}
                className="bg-gray-200 hover:bg-gray-300 disabled:opacity-50 text-gray-900 px-3 py-1.5 rounded-lg text-sm">Add</button>
            </form>
            {designNotes.length === 0 ? (
              <p className="text-xs text-gray-500">No notes yet</p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {designNotes.map(n => (
                  <div key={n.id} className="bg-gray-100 rounded-lg p-2.5">
                    <div className="flex justify-between">
                      <p className="text-[10px] text-gray-500">{new Date(n.created_at).toLocaleString()}</p>
                      <button onClick={() => deleteNote(n.id).then(() => setDesignNotes(prev => prev.filter(x => x.id !== n.id)))}
                        className="text-red-600 hover:text-red-600 text-xs">×</button>
                    </div>
                    <p className="text-xs text-gray-800 mt-1 whitespace-pre-wrap">{n.notes}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Fix 3: Delete project link at bottom of left column */}
          <div className="pt-1">
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="text-xs text-red-500 hover:text-red-600 transition-colors"
            >
              Delete Project
            </button>
          </div>
        </div>

        {/* ── RIGHT COLUMN ── */}
        <div className="flex-1 min-w-0 space-y-4 overflow-y-auto">

          {/* Workflow status + tasks */}
          <WorkflowPanel projectId={id} />

          {/* Current Step — prominent */}
          <div className={`rounded-xl p-5 border-2 ${currentStep ? 'border-blue-400 bg-blue-50/20' : 'border-dashed border-gray-300 bg-white shadow-sm'}`}>
            {currentStep ? (
              <>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs text-blue-600 font-semibold uppercase tracking-wide">Current Step</p>
                  <div className="flex items-center gap-2">
                    <Badge type={currentStep.step_type as 'action' | 'waiting'} />
                    {currentStep.waiting_on && <Badge type={currentStep.waiting_on as WaitingOn} />}
                  </div>
                </div>
                <h2 className="text-xl font-bold text-gray-900 mb-4">{currentStep.step_name}</h2>
                {currentStep.step_type === 'waiting' && currentStep.waiting_on && (
                  <p className="text-sm text-orange-600 mb-3">Waiting on: <strong>{currentStep.waiting_on}</strong></p>
                )}
                {/* Subtasks for current step */}
                {(subtasksByStep[currentStep.id] ?? []).length > 0 && (
                  <div className="mb-3 space-y-1">
                    {(subtasksByStep[currentStep.id] ?? []).map(sub => (
                      <SubtaskRow key={sub.id} subtask={sub}
                        onToggle={async () => {
                          const u = await updateSubtask(sub.id, { completed: !sub.completed })
                          setSubtasksByStep(prev => ({ ...prev, [currentStep.id]: (prev[currentStep.id] ?? []).map(s => s.id === sub.id ? u : s) }))
                        }}
                        onDelete={async () => {
                          await deleteSubtask(sub.id)
                          setSubtasksByStep(prev => ({ ...prev, [currentStep.id]: (prev[currentStep.id] ?? []).filter(s => s.id !== sub.id) }))
                        }}
                      />
                    ))}
                  </div>
                )}
                {/* Step-specific data capture */}
                {currentStep.step_name.toLowerCase().includes('measurements taken') && (
                  <div className="bg-blue-50/30 border border-blue-200/40 rounded-lg p-3 space-y-2 mb-3">
                    <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide">Record Measurements</p>
                    <div className="grid grid-cols-2 gap-2">
                      {[['Width"', measureWidth, setMeasureWidth], ['Height"', measureHeight, setMeasureHeight], ['Depth"', measureDepth, setMeasureDepth], ['Ceiling"', measureCeiling, setMeasureCeiling]] .map(([label, val, setter]) => (
                        <div key={label as string}>
                          <label className="text-[10px] text-gray-500">{label as string}</label>
                          <input type="number" value={val as string} onChange={e => (setter as (v: string) => void)(e.target.value)}
                            className="w-full bg-gray-100 border border-gray-300 rounded px-2 py-1 text-xs text-gray-900 focus:outline-none mt-0.5" />
                        </div>
                      ))}
                    </div>
                    <input placeholder="Additional notes..." value={measureNotes} onChange={e => setMeasureNotes(e.target.value)}
                      className="w-full bg-gray-100 border border-gray-300 rounded px-2 py-1 text-xs text-gray-900 focus:outline-none" />
                    <button disabled={stepDataSaving} onClick={() => saveStepData({
                      width_inches: measureWidth ? parseFloat(measureWidth) : null,
                      height_inches: measureHeight ? parseFloat(measureHeight) : null,
                      depth_inches: measureDepth ? parseFloat(measureDepth) : null,
                      ceiling_height_inches: measureCeiling ? parseFloat(measureCeiling) : null,
                      notes: measureNotes || project.notes || null,
                    })} className="w-full bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white text-xs py-1.5 rounded-lg font-semibold">
                      {stepDataSaving ? 'Saving...' : stepDataSaved ? '✓ Saved' : 'Save Measurements'}
                    </button>
                  </div>
                )}

                {(currentStep.step_name.toLowerCase().includes('finish color') || currentStep.step_name.toLowerCase().includes('color confirmed')) && (
                  <div className="bg-blue-50/30 border border-blue-200/40 rounded-lg p-3 space-y-2 mb-3">
                    <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide">Confirm Color / Finish</p>
                    <input placeholder="e.g. BM White Dove, natural walnut..." value={finishColor} onChange={e => setFinishColor(e.target.value)}
                      className="w-full bg-gray-100 border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none" />
                    <button disabled={stepDataSaving || !finishColor.trim()} onClick={() => saveStepData({ color_finish: finishColor.trim() })}
                      className="w-full bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white text-xs py-1.5 rounded-lg font-semibold">
                      {stepDataSaving ? 'Saving...' : stepDataSaved ? '✓ Saved' : 'Save Color'}
                    </button>
                  </div>
                )}

                {(currentStep.step_name.toLowerCase().includes('approval on sketch') || currentStep.step_name.toLowerCase().includes('approval on rendering')) && (
                  <div className="bg-blue-50/30 border border-blue-200/40 rounded-lg p-3 space-y-2 mb-3">
                    <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide">Record Approval</p>
                    <div>
                      <label className="text-[10px] text-gray-500">Approval Date</label>
                      <input type="date" value={approvalDate} onChange={e => setApprovalDate(e.target.value)}
                        className="w-full mt-0.5 bg-gray-100 border border-gray-300 rounded px-2 py-1.5 text-xs text-gray-900 focus:outline-none" />
                    </div>
                    <textarea placeholder="Customer notes..." rows={2} value={approvalCustomerNotes} onChange={e => setApprovalCustomerNotes(e.target.value)}
                      className="w-full bg-gray-100 border border-gray-300 rounded px-2 py-1 text-xs text-gray-900 focus:outline-none resize-none" />
                    <button disabled={stepDataSaving} onClick={() => saveStepData({
                      approval_notes: {
                        ...(project.approval_notes ?? {}),
                        [currentStep.step_name]: { date: approvalDate, notes: approvalCustomerNotes },
                      },
                    })} className="w-full bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white text-xs py-1.5 rounded-lg font-semibold">
                      {stepDataSaving ? 'Saving...' : stepDataSaved ? '✓ Saved' : 'Save Approval'}
                    </button>
                  </div>
                )}

                <button
                  onClick={handleMarkCompleteAndAdvance}
                  disabled={advancing}
                  className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition-colors text-sm"
                >
                  {advancing ? 'Advancing...' : '✓ Mark Complete & Advance'}
                </button>
                {nextStep && (
                  <p className="text-xs text-gray-500 mt-2 text-center">Next: {nextStep.step_name}</p>
                )}
              </>
            ) : (
              <div className="text-center py-4">
                <p className="text-gray-500 text-sm mb-2">No active step set</p>
                <p className="text-xs text-gray-400">Click &ldquo;Set as Current&rdquo; on a step below</p>
              </div>
            )}
          </div>

          {/* Fix 4: Collapsible Step List */}
          <div className="bg-white shadow-sm border border-gray-200 rounded-xl overflow-hidden">
            {/* Collapsible header — always visible */}
            <button
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-blue-50 transition-colors"
              onClick={() => setStepsExpanded(e => !e)}
            >
              <span className="text-sm font-semibold text-gray-800">
                All Steps — {completedCount}/{steps.length} complete
              </span>
              <span className="text-gray-500 text-xs">{stepsExpanded ? '▲' : '▼'}</span>
            </button>

            {/* Progress bar — always visible */}
            <div className="h-1 bg-gray-100">
              <div
                className="h-full bg-blue-500 transition-all"
                style={{ width: steps.length > 0 ? `${(completedCount / steps.length) * 100}%` : '0%' }}
              />
            </div>

            {/* Expanded content */}
            {stepsExpanded && (
              <div className="p-4 pt-3">
                {libPrompt && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-700 flex items-center justify-between mb-3">
                    <span>Save &ldquo;{libPrompt}&rdquo; to library?</span>
                    <div className="flex gap-2 ml-3">
                      <button onClick={() => saveToLibrary(libPrompt)} className="text-blue-600 hover:text-gray-900 font-medium">Yes</button>
                      <button onClick={() => setLibPrompt(null)} className="text-blue-600 hover:text-gray-900">No</button>
                    </div>
                  </div>
                )}

                <div className="space-y-1.5">
                  {steps.map((step, idx) => (
                    <div key={step.id} onClick={() => ensureSubtasksLoaded(step.id)}>
                      <StepRow
                        step={step}
                        index={step.sequence_order ?? idx + 1}
                        isCurrent={step.is_current}
                        projectId={id}
                        stepLibrary={stepLibrary}
                        onToggle={handleToggleStep}
                        onDelete={async (sid) => { await deleteStep(sid); setSteps(prev => prev.filter(s => s.id !== sid)) }}
                        onSetCurrent={handleSetCurrent}
                        subtasksByStep={subtasksByStep}
                        onSubtasksChange={(stepId, subs) => setSubtasksByStep(prev => ({ ...prev, [stepId]: subs }))}
                      />
                    </div>
                  ))}
                </div>

                {!showAddStep ? (
                  <button onClick={() => setShowAddStep(true)}
                    className="mt-3 w-full border border-dashed border-gray-300 hover:border-blue-400/50 text-gray-500 hover:text-blue-600 rounded-lg py-2 text-sm transition-colors">
                    + Add Custom Step
                  </button>
                ) : (
                  <form onSubmit={handleAddStep} className="mt-3 bg-gray-100 border border-gray-300 rounded-lg p-3 space-y-2">
                    <input type="text" required placeholder="Step name" value={newStepName} onChange={e => setNewStepName(e.target.value)}
                      className="w-full bg-gray-200 border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-900 focus:outline-none" />
                    <div className="flex gap-2">
                      <select value={newStepType} onChange={e => setNewStepType(e.target.value as StepType)}
                        className="flex-1 bg-gray-200 border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-900 focus:outline-none">
                        <option value="action">Action</option>
                        <option value="waiting">Waiting</option>
                      </select>
                      {newStepType === 'waiting' && (
                        <select value={newStepWaiting} onChange={e => setNewStepWaiting(e.target.value as WaitingOn)}
                          className="flex-1 bg-gray-200 border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-900 focus:outline-none">
                          <option value="">Waiting on...</option>
                          <option value="customer">Customer</option>
                          <option value="supplier">Supplier</option>
                          <option value="designer">Designer</option>
                          <option value="internal">Internal</option>
                        </select>
                      )}
                      <label className="flex items-center gap-1 text-xs text-gray-500 cursor-pointer">
                        <input type="checkbox" checked={newStepOptional} onChange={e => setNewStepOptional(e.target.checked)} className="accent-blue-600" />
                        Optional
                      </label>
                    </div>
                    <div className="flex gap-2">
                      <button type="submit" disabled={addingStep || !newStepName.trim()}
                        className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold px-3 py-1 rounded text-xs">
                        {addingStep ? '...' : 'Add Step'}
                      </button>
                      <button type="button" onClick={() => setShowAddStep(false)} className="text-gray-500 hover:text-gray-900 text-xs px-2">Cancel</button>
                    </div>
                  </form>
                )}
              </div>
            )}
          </div>

          {/* Shopping List */}
          <div className="bg-white shadow-sm border border-gray-200 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-gray-800 mb-3">Shopping List</h3>
            {shopItems.length > 0 && (
              <div className="space-y-1.5 mb-3">
                {shopItems.map(item => (
                  <div key={item.id} className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm ${item.purchased ? 'bg-gray-100/40' : 'bg-gray-100'}`}>
                    <input type="checkbox" checked={item.purchased}
                      onChange={async () => { const u = await updateShoppingListItem(item.id, { purchased: !item.purchased }); setShopItems(prev => prev.map(i => i.id === item.id ? u : i)) }}
                      className="accent-emerald-500 w-4 h-4 shrink-0 cursor-pointer" />
                    <span className={`flex-1 ${item.purchased ? 'line-through text-gray-500' : 'text-gray-900'}`}>{item.item}</span>
                    <button onClick={async () => { await deleteShoppingListItem(item.id); setShopItems(prev => prev.filter(i => i.id !== item.id)) }}
                      className="text-red-600 hover:text-red-600 text-xs">×</button>
                  </div>
                ))}
              </div>
            )}
            <form onSubmit={handleAddShop} className="flex gap-2">
              <input value={shopInput} onChange={e => setShopInput(e.target.value)} placeholder="Add item to buy..."
                className="flex-1 bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500" />
              <button type="submit" disabled={addingShop || !shopInput.trim()}
                className="bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white font-semibold px-3 py-2 rounded-lg text-sm">
                {addingShop ? '...' : 'Add'}
              </button>
            </form>
          </div>

          {/* Files */}
          <div className="bg-white shadow-sm border border-gray-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-800">Files</h3>
              <label className={`cursor-pointer text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors ${uploadingFile ? 'bg-gray-200 text-gray-500 cursor-wait' : 'bg-blue-600 hover:bg-blue-500 text-white'}`}>
                {uploadingFile ? 'Uploading...' : '+ Upload'}
                <input type="file" multiple className="hidden" onChange={handleFileUpload} disabled={uploadingFile} />
              </label>
            </div>
            {files.length === 0 && !uploadingFile ? (
              <p className="text-xs text-gray-400">No files yet</p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {files.map(file => {
                  const isImage = file.mime_type?.startsWith('image/')
                  const url = getProjectFileUrl(file.file_path)
                  return (
                    <div key={file.id} className="relative group rounded-lg overflow-hidden bg-gray-100 border border-gray-300">
                      {isImage ? (
                        <button
                          onClick={() => setLightboxUrl(url)}
                          className="w-full aspect-square block"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={url} alt={file.file_name} className="w-full h-full object-cover" />
                        </button>
                      ) : (
                        <a href={url} target="_blank" rel="noopener noreferrer" download={file.file_name} className="w-full aspect-square flex flex-col items-center justify-center p-2">
                          <span className="text-2xl">📄</span>
                          <span className="text-[9px] text-gray-500 truncate w-full text-center mt-1">{file.file_name}</span>
                        </a>
                      )}
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-between px-1.5 py-1.5 pointer-events-none group-hover:pointer-events-auto">
                        <a href={url} download={file.file_name} target="_blank" rel="noopener noreferrer"
                          className="text-[10px] text-gray-900 bg-gray-200 hover:bg-gray-300 rounded px-1.5 py-0.5">↓</a>
                        <button onClick={() => handleDeleteFile(file)}
                          className="text-[10px] text-red-600 bg-red-100/80 hover:bg-red-200 rounded px-1.5 py-0.5">×</button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Materials Checklist */}
          <div className="bg-white shadow-sm border border-gray-200 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-gray-800 mb-3">Materials Checklist</h3>
            {materials.length > 0 && (
              <div className="space-y-1.5 mb-3">
                {materials.map(mat => (
                  <div key={mat.id} className="flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-2 text-xs">
                    <span className="flex-1 text-gray-900">{mat.item_name}</span>
                    {mat.cost_estimate != null && <span className="text-gray-500 font-mono">${mat.cost_estimate.toFixed(0)}</span>}
                    <label className="flex items-center gap-1 text-gray-500 cursor-pointer">
                      <input type="checkbox" checked={mat.ordered} onChange={() => updateMaterial(mat.id, { ordered: !mat.ordered }).then(u => setMaterials(prev => prev.map(m => m.id === mat.id ? u : m)))} className="accent-blue-600 w-3 h-3" />
                      Ord
                    </label>
                    <label className="flex items-center gap-1 text-gray-500 cursor-pointer">
                      <input type="checkbox" checked={mat.received} onChange={() => updateMaterial(mat.id, { received: !mat.received }).then(u => setMaterials(prev => prev.map(m => m.id === mat.id ? u : m)))} className="accent-emerald-500 w-3 h-3" />
                      Rcvd
                    </label>
                    <button onClick={() => deleteMaterial(mat.id).then(() => setMaterials(prev => prev.filter(m => m.id !== mat.id)))} className="text-red-600 hover:text-red-600">×</button>
                  </div>
                ))}
              </div>
            )}
            <form onSubmit={handleAddMat} className="flex gap-2">
              <input required placeholder="Item name" value={matName} onChange={e => setMatName(e.target.value)}
                className="flex-1 bg-gray-100 border border-gray-300 rounded px-2 py-1.5 text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500" />
              <input type="number" placeholder="Cost" value={matCost} onChange={e => setMatCost(e.target.value)}
                className="w-20 bg-gray-100 border border-gray-300 rounded px-2 py-1.5 text-xs text-gray-900 focus:outline-none" />
              <button type="submit" disabled={addingMat || !matName}
                className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold px-3 py-1.5 rounded text-xs">
                {addingMat ? '...' : 'Add'}
              </button>
            </form>
          </div>

          {/* Delivery Photos */}
          {showPhotoSection && (
            <div className="bg-white shadow-sm border border-gray-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-800">Delivery Photos</h3>
                <button onClick={() => setShowPhotoModal(true)}
                  className="text-xs text-blue-600 hover:text-blue-500">+ Add More Photos</button>
              </div>
              {deliveryPhotos.length === 0 ? (
                <p className="text-xs text-gray-400">No delivery photos yet.</p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {deliveryPhotos.map(photo => {
                    const url = getDeliveryPhotoUrl(photo.file_path)
                    return (
                      <div key={photo.id} className="relative group">
                        <button onClick={() => setLightboxUrl(url)} className="w-full aspect-square block rounded-lg overflow-hidden bg-gray-100 border border-gray-300">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={url} alt={photo.caption ?? photo.file_name} className="w-full h-full object-cover" />
                        </button>
                        {photo.caption && (
                          <p className="text-[10px] text-gray-500 mt-1 truncate">{photo.caption}</p>
                        )}
                        <button onClick={() => setConfirmDeletePhotoId(photo.id)}
                          className="absolute top-1 right-1 hidden group-hover:flex items-center justify-center w-5 h-5 bg-red-100/90 hover:bg-red-700 text-white rounded-full text-xs">×</button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Delivery Photo Upload Modal */}
      {showPhotoModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget && !uploadingPhotos) setShowPhotoModal(false) }}>
          <div className="bg-white shadow-sm border border-gray-200 rounded-xl w-full max-w-lg max-h-[85vh] overflow-y-auto p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Delivery Photos</h3>
              <button onClick={() => setShowPhotoModal(false)} disabled={uploadingPhotos}
                className="text-gray-500 hover:text-gray-900 text-xl leading-none">×</button>
            </div>

            <label className="block cursor-pointer border-2 border-dashed border-gray-300 hover:border-emerald-400 rounded-xl p-6 text-center text-sm text-gray-500 hover:text-emerald-600 transition-colors">
              📷 Tap to select photos (JPG, PNG, HEIC)
              <input type="file" multiple accept="image/jpeg,image/png,image/heic,image/heif,image/*"
                className="hidden" onChange={handlePickPhotos} disabled={uploadingPhotos} />
            </label>

            {pendingPhotos.length > 0 && (
              <div className="space-y-2">
                {pendingPhotos.map((p, i) => (
                  <div key={i} className="flex items-center gap-3 bg-gray-100 rounded-lg p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.preview} alt="" className="w-14 h-14 object-cover rounded-lg shrink-0" />
                    <input placeholder="Caption (optional)" value={p.caption}
                      onChange={e => setPendingPhotos(prev => prev.map((x, j) => j === i ? { ...x, caption: e.target.value } : x))}
                      className="flex-1 bg-gray-200 border border-gray-300 rounded px-2 py-1.5 text-xs text-gray-900 focus:outline-none" />
                    <button onClick={() => setPendingPhotos(prev => { URL.revokeObjectURL(prev[i].preview); return prev.filter((_, j) => j !== i) })}
                      disabled={uploadingPhotos}
                      className="text-red-600 hover:text-red-600 text-sm shrink-0">×</button>
                  </div>
                ))}
                <button onClick={handleUploadAllPhotos} disabled={uploadingPhotos}
                  className="w-full bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white font-semibold py-2 rounded-lg text-sm">
                  {uploadingPhotos ? 'Uploading...' : `Upload All (${pendingPhotos.length})`}
                </button>
              </div>
            )}

            {deliveryPhotos.length > 0 && pendingPhotos.length === 0 && (
              <p className="text-xs text-gray-500">{deliveryPhotos.length} photo{deliveryPhotos.length === 1 ? '' : 's'} uploaded for this project.</p>
            )}

            <button onClick={() => setShowPhotoModal(false)} disabled={uploadingPhotos}
              className="w-full text-sm text-gray-500 hover:text-gray-900 py-1">Done</button>
          </div>
        </div>
      )}

      {/* Delete delivery photo confirmation */}
      {confirmDeletePhotoId && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-white shadow-sm border border-gray-200 rounded-xl w-full max-w-sm p-6 space-y-4 shadow-2xl">
            <h3 className="font-semibold text-gray-900">Delete Photo?</h3>
            <p className="text-sm text-gray-500">This delivery photo will be permanently removed.</p>
            <div className="flex gap-3">
              <button
                onClick={() => { const p = deliveryPhotos.find(x => x.id === confirmDeletePhotoId); if (p) handleDeletePhoto(p) }}
                className="flex-1 bg-red-700 hover:bg-red-600 text-white font-semibold py-2 rounded-lg text-sm">
                Delete Photo
              </button>
              <button onClick={() => setConfirmDeletePhotoId(null)}
                className="px-4 py-2 text-sm text-gray-500 hover:text-gray-900">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Fix 3: Delete Project confirmation modals ── */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-white shadow-sm border border-gray-200 rounded-xl w-full max-w-sm p-6 space-y-4 shadow-2xl">
            <h3 className="font-semibold text-gray-900">Delete Project?</h3>
            <p className="text-sm text-gray-500">Are you sure you want to delete this project? This cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={handleDeleteProject} disabled={deleting}
                className="flex-1 bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white font-semibold py-2 rounded-lg text-sm">
                {deleting ? 'Deleting...' : 'Delete Project'}
              </button>
              <button onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 text-sm text-gray-500 hover:text-gray-900">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showDeleteCustomer && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-white shadow-sm border border-gray-200 rounded-xl w-full max-w-sm p-6 space-y-4 shadow-2xl">
            <h3 className="font-semibold text-gray-900">Delete Customer Too?</h3>
            <p className="text-sm text-gray-500">
              This customer has no other projects. Do you want to delete the customer record as well?
            </p>
            <div className="flex gap-3">
              <button onClick={handleDeleteCustomerToo}
                className="flex-1 bg-red-700 hover:bg-red-600 text-white font-semibold py-2 rounded-lg text-sm">
                Yes, Delete Customer
              </button>
              <button onClick={() => router.push('/dashboard/shop')}
                className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-900 font-semibold py-2 rounded-lg text-sm">
                No, Keep Customer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
          onClick={() => setLightboxUrl(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightboxUrl} alt="Preview" className="max-w-full max-h-full rounded-lg shadow-2xl" onClick={e => e.stopPropagation()} />
          <button
            onClick={() => setLightboxUrl(null)}
            className="absolute top-4 right-4 text-gray-900 bg-gray-100 hover:bg-gray-200 w-8 h-8 rounded-full flex items-center justify-center text-lg"
          >×</button>
        </div>
      )}
    </div>
  )
}
