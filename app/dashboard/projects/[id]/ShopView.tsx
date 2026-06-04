'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  updateProject, updateCustomer,
  getMaterialsByProjectId, addMaterial, updateMaterial, deleteMaterial,
  getStepsByProjectId, addStep, updateStep, deleteStep, getStepLibrary, addStepToLibrary,
  getSubtasksByStepId, addSubtask, updateSubtask, deleteSubtask,
  getNotesByProjectId, addDesignMeetingNote, deleteNote,
  getShoppingListByProjectId, addShoppingListItem, updateShoppingListItem, deleteShoppingListItem,
  getOpenQuestionsByProjectId, addOpenQuestion, resolveQuestion, deleteQuestion,
  setCurrentStep, autoAdvanceCurrentStep,
} from '@/lib/api/supabase-client'
import type {
  Project, Customer, MaterialItem, ProductionStep, StepLibraryItem,
  DesignMeetingNote, ShoppingListItem, StepSubtask, OpenQuestion,
  ProjectType, ProjectStatus, StepType, WaitingOn, QuestionDirectedAt,
} from '@/lib/core/types'

const PROJECT_TYPES: ProjectType[] = ['dining_table', 'built_in', 'bookcase', 'buffet', 'other']
const STATUSES: ProjectStatus[] = ['lead', 'design_meeting_scheduled', 'rendering', 'quote_issued', 'deposit_received', 'in_production', 'completed']
const STATUS_LABELS: Record<ProjectStatus, string> = {
  lead: 'Lead', design_meeting_scheduled: 'Design Meeting', rendering: 'Rendering',
  quote_issued: 'Quote Issued', deposit_received: 'Deposit Received',
  in_production: 'In Production', completed: 'Completed',
}

// ── Small helper components ────────────────────────────────────────────────

function Badge({ type, label }: { type: 'action' | 'waiting' | 'customer' | 'internal' | 'supplier' | 'designer'; label?: string }) {
  const map: Record<string, string> = {
    action: 'bg-emerald-900 text-emerald-200',
    waiting: 'bg-orange-900 text-orange-200',
    customer: 'bg-blue-900 text-blue-200',
    internal: 'bg-gray-700 text-gray-300',
    supplier: 'bg-purple-900 text-purple-200',
    designer: 'bg-pink-900 text-pink-200',
  }
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide ${map[type] ?? 'bg-gray-700 text-gray-300'}`}>
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
        className="accent-amber-500 w-3.5 h-3.5 shrink-0 cursor-pointer" />
      <span className={`flex-1 text-xs ${subtask.completed ? 'line-through text-gray-500' : 'text-gray-200'}`}>
        {subtask.description}
      </span>
      <button onClick={onDelete} className="text-red-400 hover:text-red-300 text-xs">×</button>
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
    ? 'border border-blue-600 bg-blue-950/30'
    : step.completed
    ? 'border border-gray-800 bg-gray-800/20'
    : 'border border-gray-800 bg-gray-900'

  return (
    <div className={`rounded-lg ${rowClass} transition-all`}>
      <div
        className="flex items-center gap-2 px-3 py-2.5 cursor-pointer"
        onClick={() => setExpanded(e => !e)}
      >
        <span className="text-gray-500 text-xs w-5 shrink-0 text-right">{index}</span>
        <span className={`flex-1 text-sm font-medium ${step.completed ? 'line-through text-gray-500' : isCurrent ? 'text-blue-300' : 'text-white'}`}>
          {step.step_name}
        </span>
        {isCurrent && <span className="text-[10px] text-blue-400 font-semibold uppercase">Current</span>}
        {step.is_optional && <Badge type="internal" label="Optional" />}
        <Badge type={step.step_type as 'action' | 'waiting'} />
        {subs.length > 0 && (
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${hasIncomplete ? 'bg-red-900 text-red-200' : 'bg-gray-700 text-gray-400'}`}>
            {subs.filter(s => s.completed).length}/{subs.length}
          </span>
        )}
        <span className="text-gray-600 text-xs">{expanded ? '▲' : '▼'}</span>
      </div>

      {expanded && (
        <div className="px-4 pb-3 border-t border-gray-800/50 pt-2 space-y-2">
          {step.step_type === 'waiting' && step.waiting_on && (
            <p className="text-xs text-orange-400">Waiting on: <strong>{step.waiting_on}</strong></p>
          )}

          {/* Subtasks */}
          {subs.map(sub => (
            <SubtaskRow key={sub.id} subtask={sub} onToggle={() => handleToggleSub(sub)} onDelete={() => handleDeleteSub(sub.id)} />
          ))}

          <form onSubmit={handleAddSub} className="flex gap-1.5">
            <input placeholder="Add subtask..." value={newSub} onChange={e => setNewSub(e.target.value)}
              className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white focus:outline-none" />
            <button type="submit" disabled={!newSub.trim()}
              className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white px-2 py-1 rounded text-xs">+</button>
          </form>

          <div className="flex items-center gap-2 pt-1">
            {!step.completed && !isCurrent && (
              <button onClick={() => onSetCurrent(step.id)}
                className="text-xs text-blue-400 hover:text-blue-300">Set as Current</button>
            )}
            {!step.completed && (
              <button
                onClick={() => {
                  if (hasIncomplete) { alert('Complete all subtasks first.'); return }
                  onToggle(step)
                }}
                className="text-xs text-emerald-400 hover:text-emerald-300"
              >
                Mark Complete
              </button>
            )}
            <button onClick={() => onDelete(step.id)} className="text-xs text-red-400 hover:text-red-300 ml-auto">Delete Step</button>
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
  const [colorFinish, setColorFinish] = useState(project.required_fields_completed?.color_finish ? '' : '')
  const [colorFinishText, setColorFinishText] = useState('')
  const [woodSpecies, setWoodSpecies] = useState('')
  const [dimWidth, setDimWidth] = useState('')
  const [dimHeight, setDimHeight] = useState('')
  const [dimDepth, setDimDepth] = useState('')
  const [ceilingHeight, setCeilingHeight] = useState('')
  const [pNotes, setPNotes] = useState(project.notes ?? '')
  const [savingDetails, setSavingDetails] = useState(false)
  const [detailsSaved, setDetailsSaved] = useState(false)

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

  const id = project.id

  useEffect(() => {
    async function load() {
      const [s, sl, m, dn, shop, q] = await Promise.all([
        getStepsByProjectId(id).catch(() => [] as ProductionStep[]),
        getStepLibrary().catch(() => [] as StepLibraryItem[]),
        getMaterialsByProjectId(id).catch(() => [] as MaterialItem[]),
        getNotesByProjectId(id).catch(() => [] as DesignMeetingNote[]),
        getShoppingListByProjectId(id).catch(() => [] as ShoppingListItem[]),
        getOpenQuestionsByProjectId(id).catch(() => [] as OpenQuestion[]),
      ])
      setSteps(s)
      setStepLibrary(sl)
      setMaterials(m)
      setDesignNotes(dn)
      setShopItems(shop)
      setQuestions(q)
      // Preload subtasks for current step
      const curr = s.find(x => x.is_current)
      if (curr) {
        const subs = await getSubtasksByStepId(curr.id).catch(() => [])
        setSubtasksByStep({ [curr.id]: subs })
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

  // ── Details save ────────────────────────────────────────────────────────
  async function saveDetails() {
    setSavingDetails(true)
    try {
      const updated = await updateProject(id, {
        project_type: (pType as ProjectType) || null,
        status: (pStatus as ProjectStatus) || null,
        notes: pNotes || null,
        required_fields_completed: {
          ...project.required_fields_completed,
          color_finish: !!colorFinishText,
          project_type: !!pType,
        },
      })
      setProject(updated)
      setDetailsSaved(true)
      setTimeout(() => setDetailsSaved(false), 2000)
    } finally { setSavingDetails(false) }
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

  const unresolvedQ = questions.filter(q => !q.resolved)
  const resolvedQ = questions.filter(q => q.resolved)
  const completedCount = steps.filter(s => s.completed).length

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div className="flex items-center gap-3 flex-wrap">
          <Link href="/dashboard/shop" className="text-gray-500 hover:text-gray-300 text-sm">← Shop</Link>
          <h1 className="text-lg font-bold text-white">
            {customer?.name ?? 'Project'}
            {project.project_type && (
              <span className="text-gray-400 font-normal ml-2 text-base capitalize">
                — {project.project_type.replace(/_/g, ' ')}
              </span>
            )}
          </h1>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
            project.status === 'in_production' ? 'bg-orange-900 text-orange-200' :
            project.status === 'deposit_received' ? 'bg-green-900 text-green-200' :
            'bg-gray-700 text-gray-300'
          }`}>{project.status ? STATUS_LABELS[project.status] : '—'}</span>
          {!currentStep && (project.status === 'deposit_received' || project.status === 'in_production') && (
            <span className="text-xs bg-red-900 text-red-200 px-2 py-0.5 rounded-full font-semibold">⚠ No Active Step</span>
          )}
        </div>
        <div className="text-sm text-gray-400 shrink-0">{completedCount}/{steps.length} steps</div>
      </div>

      {/* Two-column layout */}
      <div className="flex gap-5 flex-1 min-h-0 overflow-y-auto">

        {/* ── LEFT COLUMN ── */}
        <div className="w-[35%] shrink-0 space-y-4 overflow-y-auto pr-1">

          {/* Card 1: Project Info */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-200">Project Info</h3>
            <div className="space-y-2">
              <div>
                <label className="text-xs text-gray-400">Name</label>
                <input value={cName} onChange={e => setCName(e.target.value)}
                  className="w-full mt-0.5 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-amber-500" />
              </div>
              <div>
                <label className="text-xs text-gray-400">Status</label>
                <select value={pStatus} onChange={async e => {
                  const s = e.target.value as ProjectStatus
                  setPStatus(s)
                  const u = await updateProject(id, { status: s })
                  setProject(u)
                }} className="w-full mt-0.5 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none">
                  {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <label className="text-xs text-gray-400">Phone</label>
                  {customer?.phone ? (
                    <a href={`tel:${customer.phone}`} className="block mt-0.5 text-sm text-amber-400 hover:underline">{customer.phone}</a>
                  ) : (
                    <input value={cPhone} onChange={e => setCPhone(e.target.value)}
                      className="w-full mt-0.5 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-amber-500" />
                  )}
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-400">Email</label>
                {customer?.email ? (
                  <a href={`mailto:${customer.email}`} className="block mt-0.5 text-sm text-amber-400 hover:underline truncate">{customer.email}</a>
                ) : (
                  <input value={cEmail} onChange={e => setCEmail(e.target.value)} type="email"
                    className="w-full mt-0.5 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-amber-500" />
                )}
              </div>
              <div>
                <label className="text-xs text-gray-400">Address</label>
                <input value={cAddress} onChange={e => setCAddress(e.target.value)}
                  className="w-full mt-0.5 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-amber-500" />
              </div>
            </div>
            <button onClick={saveContact} disabled={savingContact}
              className="w-full bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-sm text-white py-1.5 rounded-lg transition-colors">
              {savingContact ? 'Saving...' : contactSaved ? '✓ Saved' : 'Save Contact'}
            </button>
          </div>

          {/* Card 2: Key Details */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-200">Key Details</h3>

            {/* Color/Finish — highlighted if empty */}
            <div>
              <label className={`text-xs font-semibold ${!colorFinishText ? 'text-yellow-400' : 'text-gray-400'}`}>
                🎨 Color / Finish {!colorFinishText && '⚠ Missing'}
              </label>
              <input
                value={colorFinishText}
                onChange={e => setColorFinishText(e.target.value)}
                placeholder="e.g. BM White Dove, natural walnut..."
                className={`w-full mt-0.5 bg-gray-800 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-amber-500 border ${!colorFinishText ? 'border-yellow-600' : 'border-gray-700'}`}
              />
            </div>

            <div>
              <label className="text-xs text-gray-400">Project Type</label>
              <select value={pType} onChange={e => setPType(e.target.value as ProjectType)}
                className="w-full mt-0.5 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none">
                <option value="">—</option>
                {PROJECT_TYPES.map(t => <option key={t} value={t} className="capitalize">{t.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400">Wood Species / Material</label>
              <input value={woodSpecies} onChange={e => setWoodSpecies(e.target.value)}
                placeholder="e.g. Maple, Walnut, Painted MDF"
                className="w-full mt-0.5 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-amber-500" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(['W', 'H', 'D'] as const).map((dim, i) => (
                <div key={dim}>
                  <label className="text-xs text-gray-400">{dim}&quot;</label>
                  <input type="number" placeholder={dim}
                    value={[dimWidth, dimHeight, dimDepth][i]}
                    onChange={e => [setDimWidth, setDimHeight, setDimDepth][i](e.target.value)}
                    className="w-full mt-0.5 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none" />
                </div>
              ))}
            </div>
            {showCeiling && (
              <div>
                <label className="text-xs text-gray-400">Ceiling Height</label>
                <input value={ceilingHeight} onChange={e => setCeilingHeight(e.target.value)}
                  placeholder='e.g. 9&apos;4"'
                  className="w-full mt-0.5 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-amber-500" />
              </div>
            )}
            <div>
              <label className="text-xs text-gray-400">Notes</label>
              <textarea rows={3} value={pNotes} onChange={e => setPNotes(e.target.value)}
                className="w-full mt-0.5 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none resize-none focus:ring-1 focus:ring-amber-500" />
            </div>
            <button onClick={saveDetails} disabled={savingDetails}
              className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-gray-950 font-semibold text-sm py-1.5 rounded-lg transition-colors">
              {savingDetails ? 'Saving...' : detailsSaved ? '✓ Saved' : 'Save Changes'}
            </button>
          </div>

          {/* Card 3: Open Questions */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-200">
                Open Questions
                {unresolvedQ.length > 0 && (
                  <span className="ml-2 text-[10px] bg-orange-900 text-orange-200 px-1.5 py-0.5 rounded font-semibold">{unresolvedQ.length}</span>
                )}
              </h3>
              <button onClick={() => setShowAddQ(v => !v)} className="text-xs text-amber-400 hover:text-amber-300">+ Add</button>
            </div>

            {showAddQ && (
              <form onSubmit={handleAddQuestion} className="space-y-2 bg-gray-800 rounded-lg p-3">
                <textarea rows={2} placeholder="Question..." value={qText} onChange={e => setQText(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-white focus:outline-none resize-none" />
                <div className="flex gap-2">
                  <select value={qDirected} onChange={e => setQDirected(e.target.value as QuestionDirectedAt)}
                    className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-white focus:outline-none">
                    <option value="customer">Customer</option>
                    <option value="internal">Internal</option>
                  </select>
                  <select value={qStepId} onChange={e => setQStepId(e.target.value)}
                    className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-white focus:outline-none">
                    <option value="">No step</option>
                    {steps.map(s => <option key={s.id} value={s.id}>{s.step_name}</option>)}
                  </select>
                </div>
                <div className="flex gap-2">
                  <button type="submit" disabled={addingQ || !qText.trim()}
                    className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-gray-950 font-semibold px-3 py-1 rounded text-xs">
                    {addingQ ? '...' : 'Add'}
                  </button>
                  <button type="button" onClick={() => setShowAddQ(false)} className="text-gray-400 text-xs">Cancel</button>
                </div>
              </form>
            )}

            {unresolvedQ.length === 0 && !showAddQ && (
              <p className="text-xs text-gray-500">No open questions</p>
            )}

            <div className="space-y-2">
              {unresolvedQ.map(q => (
                <div key={q.id} className="bg-gray-800 rounded-lg p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs text-white flex-1">{q.question}</p>
                    <Badge type={q.directed_at as 'customer' | 'internal'} />
                  </div>
                  <p className="text-[10px] text-gray-500">{new Date(q.created_at).toLocaleDateString()}</p>
                  {resolvingId === q.id ? (
                    <div className="space-y-1">
                      <input placeholder="Answer..." value={resolveAnswer} onChange={e => setResolveAnswer(e.target.value)}
                        className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-white focus:outline-none" />
                      <div className="flex gap-2">
                        <button onClick={() => handleResolve(q.id)} disabled={!resolveAnswer.trim()}
                          className="bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white px-2 py-0.5 rounded text-xs">Resolve</button>
                        <button onClick={() => setResolvingId(null)} className="text-gray-400 text-xs">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-3">
                      <button onClick={() => { setResolvingId(q.id); setResolveAnswer('') }}
                        className="text-xs text-emerald-400 hover:text-emerald-300">Resolve</button>
                      <button onClick={() => deleteQuestion(q.id).then(() => setQuestions(prev => prev.filter(x => x.id !== q.id)))}
                        className="text-xs text-red-400 hover:text-red-300">Delete</button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {resolvedQ.length > 0 && (
              <button onClick={() => setShowResolved(v => !v)} className="text-xs text-gray-500 hover:text-gray-400">
                {showResolved ? 'Hide' : `Show`} Resolved ({resolvedQ.length})
              </button>
            )}
            {showResolved && resolvedQ.map(q => (
              <div key={q.id} className="bg-gray-800/50 rounded-lg p-2 opacity-60">
                <p className="text-xs text-gray-400 line-through">{q.question}</p>
                {q.answer && <p className="text-xs text-gray-500 mt-1">→ {q.answer}</p>}
              </div>
            ))}
          </div>

          {/* Card 4: Design Notes */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-200">Design Meeting Notes</h3>
            <form onSubmit={handleAddNote} className="flex gap-2">
              <input value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="Add a note..."
                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-amber-500" />
              <button type="submit" disabled={addingNote || !newNote.trim()}
                className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg text-sm">Add</button>
            </form>
            {designNotes.length === 0 ? (
              <p className="text-xs text-gray-500">No notes yet</p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {designNotes.map(n => (
                  <div key={n.id} className="bg-gray-800 rounded-lg p-2.5">
                    <div className="flex justify-between">
                      <p className="text-[10px] text-gray-500">{new Date(n.created_at).toLocaleString()}</p>
                      <button onClick={() => deleteNote(n.id).then(() => setDesignNotes(prev => prev.filter(x => x.id !== n.id)))}
                        className="text-red-400 hover:text-red-300 text-xs">×</button>
                    </div>
                    <p className="text-xs text-gray-200 mt-1 whitespace-pre-wrap">{n.notes}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT COLUMN ── */}
        <div className="flex-1 min-w-0 space-y-4 overflow-y-auto">

          {/* Current Step — prominent */}
          <div className={`rounded-xl p-5 border-2 ${currentStep ? 'border-blue-600 bg-blue-950/20' : 'border-dashed border-gray-700 bg-gray-900'}`}>
            {currentStep ? (
              <>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs text-blue-400 font-semibold uppercase tracking-wide">Current Step</p>
                  <div className="flex items-center gap-2">
                    <Badge type={currentStep.step_type as 'action' | 'waiting'} />
                    {currentStep.waiting_on && <Badge type={currentStep.waiting_on as WaitingOn} />}
                  </div>
                </div>
                <h2 className="text-xl font-bold text-white mb-4">{currentStep.step_name}</h2>
                {currentStep.step_type === 'waiting' && currentStep.waiting_on && (
                  <p className="text-sm text-orange-300 mb-3">Waiting on: <strong>{currentStep.waiting_on}</strong></p>
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
                <p className="text-gray-400 text-sm mb-2">No active step set</p>
                <p className="text-xs text-gray-600">Click &ldquo;Set as Current&rdquo; on a step below</p>
              </div>
            )}
          </div>

          {/* Full Step List */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-200">All Steps</h3>
              <span className="text-xs text-gray-500">{completedCount}/{steps.length} complete</span>
            </div>

            {libPrompt && (
              <div className="bg-blue-950 border border-blue-800 rounded-lg px-3 py-2 text-xs text-blue-200 flex items-center justify-between mb-3">
                <span>Save &ldquo;{libPrompt}&rdquo; to library?</span>
                <div className="flex gap-2 ml-3">
                  <button onClick={() => saveToLibrary(libPrompt)} className="text-blue-300 hover:text-white font-medium">Yes</button>
                  <button onClick={() => setLibPrompt(null)} className="text-blue-400 hover:text-white">No</button>
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
                className="mt-3 w-full border border-dashed border-gray-700 hover:border-amber-500/50 text-gray-500 hover:text-amber-400 rounded-lg py-2 text-sm transition-colors">
                + Add Custom Step
              </button>
            ) : (
              <form onSubmit={handleAddStep} className="mt-3 bg-gray-800 border border-gray-700 rounded-lg p-3 space-y-2">
                <input type="text" required placeholder="Step name" value={newStepName} onChange={e => setNewStepName(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-white focus:outline-none" />
                <div className="flex gap-2">
                  <select value={newStepType} onChange={e => setNewStepType(e.target.value as StepType)}
                    className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-white focus:outline-none">
                    <option value="action">Action</option>
                    <option value="waiting">Waiting</option>
                  </select>
                  {newStepType === 'waiting' && (
                    <select value={newStepWaiting} onChange={e => setNewStepWaiting(e.target.value as WaitingOn)}
                      className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-white focus:outline-none">
                      <option value="">Waiting on...</option>
                      <option value="customer">Customer</option>
                      <option value="supplier">Supplier</option>
                      <option value="designer">Designer</option>
                      <option value="internal">Internal</option>
                    </select>
                  )}
                  <label className="flex items-center gap-1 text-xs text-gray-400 cursor-pointer">
                    <input type="checkbox" checked={newStepOptional} onChange={e => setNewStepOptional(e.target.checked)} className="accent-amber-500" />
                    Optional
                  </label>
                </div>
                <div className="flex gap-2">
                  <button type="submit" disabled={addingStep || !newStepName.trim()}
                    className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-gray-950 font-semibold px-3 py-1 rounded text-xs">
                    {addingStep ? '...' : 'Add Step'}
                  </button>
                  <button type="button" onClick={() => setShowAddStep(false)} className="text-gray-400 hover:text-white text-xs px-2">Cancel</button>
                </div>
              </form>
            )}
          </div>

          {/* Shopping List */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-gray-200 mb-3">Shopping List</h3>
            {shopItems.length > 0 && (
              <div className="space-y-1.5 mb-3">
                {shopItems.map(item => (
                  <div key={item.id} className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm ${item.purchased ? 'bg-gray-800/40' : 'bg-gray-800'}`}>
                    <input type="checkbox" checked={item.purchased}
                      onChange={async () => { const u = await updateShoppingListItem(item.id, { purchased: !item.purchased }); setShopItems(prev => prev.map(i => i.id === item.id ? u : i)) }}
                      className="accent-emerald-500 w-4 h-4 shrink-0 cursor-pointer" />
                    <span className={`flex-1 ${item.purchased ? 'line-through text-gray-500' : 'text-white'}`}>{item.item}</span>
                    <button onClick={async () => { await deleteShoppingListItem(item.id); setShopItems(prev => prev.filter(i => i.id !== item.id)) }}
                      className="text-red-400 hover:text-red-300 text-xs">×</button>
                  </div>
                ))}
              </div>
            )}
            <form onSubmit={handleAddShop} className="flex gap-2">
              <input value={shopInput} onChange={e => setShopInput(e.target.value)} placeholder="Add item to buy..."
                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-amber-500" />
              <button type="submit" disabled={addingShop || !shopInput.trim()}
                className="bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white font-semibold px-3 py-2 rounded-lg text-sm">
                {addingShop ? '...' : 'Add'}
              </button>
            </form>
          </div>

          {/* Materials Checklist */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-gray-200 mb-3">Materials Checklist</h3>
            {materials.length > 0 && (
              <div className="space-y-1.5 mb-3">
                {materials.map(mat => (
                  <div key={mat.id} className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-2 text-xs">
                    <span className="flex-1 text-white">{mat.item_name}</span>
                    {mat.cost_estimate != null && <span className="text-gray-400 font-mono">${mat.cost_estimate.toFixed(0)}</span>}
                    <label className="flex items-center gap-1 text-gray-400 cursor-pointer">
                      <input type="checkbox" checked={mat.ordered} onChange={() => updateMaterial(mat.id, { ordered: !mat.ordered }).then(u => setMaterials(prev => prev.map(m => m.id === mat.id ? u : m)))} className="accent-amber-500 w-3 h-3" />
                      Ord
                    </label>
                    <label className="flex items-center gap-1 text-gray-400 cursor-pointer">
                      <input type="checkbox" checked={mat.received} onChange={() => updateMaterial(mat.id, { received: !mat.received }).then(u => setMaterials(prev => prev.map(m => m.id === mat.id ? u : m)))} className="accent-emerald-500 w-3 h-3" />
                      Rcvd
                    </label>
                    <button onClick={() => deleteMaterial(mat.id).then(() => setMaterials(prev => prev.filter(m => m.id !== mat.id)))} className="text-red-400 hover:text-red-300">×</button>
                  </div>
                ))}
              </div>
            )}
            <form onSubmit={handleAddMat} className="flex gap-2">
              <input required placeholder="Item name" value={matName} onChange={e => setMatName(e.target.value)}
                className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500" />
              <input type="number" placeholder="Cost" value={matCost} onChange={e => setMatCost(e.target.value)}
                className="w-20 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-white focus:outline-none" />
              <button type="submit" disabled={addingMat || !matName}
                className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-gray-950 font-semibold px-3 py-1.5 rounded text-xs">
                {addingMat ? '...' : 'Add'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
