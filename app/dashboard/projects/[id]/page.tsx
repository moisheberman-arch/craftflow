'use client'

import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  getProjectById, updateProject, getCustomers,
  getMaterialsByProjectId, addMaterial, updateMaterial, deleteMaterial,
  getStepsByProjectId, addStep, updateStep, deleteStep,
  getStepLibrary, addStepToLibrary,
  getQuoteByProjectId,
  getNotesByProjectId, addDesignMeetingNote, deleteNote,
} from '@/lib/api/supabase-client'
import type {
  Project, Customer, MaterialItem, ProductionStep, StepLibraryItem,
  Quote, ProjectStatus, ProjectType, DesignMeetingNote,
} from '@/lib/core/types'

const PROJECT_TYPES: ProjectType[] = ['dining_table', 'built_in', 'bookcase', 'buffet', 'other']
const STATUSES: ProjectStatus[] = ['lead', 'design_meeting_scheduled', 'rendering', 'quote_issued', 'deposit_received', 'in_production', 'completed']

const STATUS_LABELS: Record<ProjectStatus, string> = {
  lead: 'Lead',
  design_meeting_scheduled: 'Design Meeting Scheduled',
  rendering: 'Rendering',
  quote_issued: 'Quote Issued',
  deposit_received: 'Deposit Received',
  in_production: 'In Production',
  completed: 'Completed',
}

const QUOTE_STATUS_COLORS = {
  initial: 'bg-gray-700 text-gray-200',
  revised: 'bg-blue-900 text-blue-200',
  final: 'bg-emerald-900 text-emerald-200',
}

// Bug 2: stage-aware alert logic
function getStageAlerts(project: Project): string[] {
  const status = project.status
  const rf = project.required_fields_completed
  const hasCustomer = !!project.customer_id
  const hasContactInfo = hasCustomer && rf.customer_info
  const hasProjectType = !!project.project_type
  const hasColorFinish = rf.color_finish

  if (!status || status === 'lead' || status === 'completed') return []

  if (status === 'design_meeting_scheduled') {
    if (!hasContactInfo) return ['Customer contact info is missing']
    return []
  }
  if (status === 'rendering') {
    const alerts = []
    if (!hasContactInfo) alerts.push('Customer contact info is missing')
    if (!hasProjectType) alerts.push('Project type is not set')
    return alerts
  }
  if (status === 'quote_issued') {
    if (!hasColorFinish) return ['Color / finish has not been confirmed']
    return []
  }
  if (status === 'deposit_received') {
    const alerts = []
    if (!hasColorFinish) alerts.push('Color / finish has not been confirmed')
    if (!hasProjectType) alerts.push('Project type is not set')
    return alerts
  }
  if (status === 'in_production') {
    if (!hasColorFinish) return ['Color / finish has not been confirmed']
    return []
  }
  return []
}

type Tab = 'overview' | 'materials' | 'steps' | 'quote'

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  // Bug 3: determine which tabs to show based on ?view param
  const view = searchParams.get('view') ?? 'sales'
  const isShopView = view === 'shop'
  const visibleTabs: Tab[] = isShopView
    ? ['overview', 'materials', 'steps', 'quote']
    : ['overview', 'materials', 'quote']

  const [tab, setTab] = useState<Tab>('overview')
  const [project, setProject] = useState<Project | null>(null)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [materials, setMaterials] = useState<MaterialItem[]>([])
  const [steps, setSteps] = useState<ProductionStep[]>([])
  const [stepLibrary, setStepLibrary] = useState<StepLibraryItem[]>([])
  const [quote, setQuote] = useState<Quote | null>(null)
  const [designNotes, setDesignNotes] = useState<DesignMeetingNote[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Overview form state
  const [customerId, setCustomerId] = useState('')
  const [projectType, setProjectType] = useState<ProjectType | ''>('')
  const [status, setStatus] = useState<ProjectStatus | ''>('')
  const [address, setAddress] = useState('')
  const [notes, setNotes] = useState('')

  // Material form state
  const [newItemName, setNewItemName] = useState('')
  const [newItemCost, setNewItemCost] = useState('')
  const [newItemNotes, setNewItemNotes] = useState('')
  const [addingMaterial, setAddingMaterial] = useState(false)

  // Step form state
  const [showAddStep, setShowAddStep] = useState(false)
  const [newStepName, setNewStepName] = useState('')
  const [useLibrary, setUseLibrary] = useState(false)
  const [selectedLibraryStep, setSelectedLibraryStep] = useState('')
  const [addingStep, setAddingStep] = useState(false)
  const [saveToLibraryPrompt, setSaveToLibraryPrompt] = useState<string | null>(null)

  // Design note form state
  const [newNote, setNewNote] = useState('')
  const [addingNote, setAddingNote] = useState(false)

  useEffect(() => {
    // Bug 5: each fetch is independent — one failing won't kill the others
    async function load() {
      const p = await getProjectById(id)
      if (!p) { setError('Project not found'); return }
      setProject(p)
      setCustomerId(p.customer_id ?? '')
      setProjectType(p.project_type ?? '')
      setStatus(p.status ?? '')
      setAddress(p.address ?? '')
      setNotes(p.notes ?? '')

      // Load secondary data independently — failures are non-fatal
      const [c, m, s, sl, q, dn] = await Promise.all([
        getCustomers().catch(() => [] as Customer[]),
        getMaterialsByProjectId(id).catch(() => [] as MaterialItem[]),
        getStepsByProjectId(id).catch(() => [] as ProductionStep[]),
        getStepLibrary().catch(() => [] as StepLibraryItem[]),
        getQuoteByProjectId(id).catch(() => null),
        getNotesByProjectId(id).catch(() => [] as DesignMeetingNote[]),
      ])
      setCustomers(c)
      setMaterials(m)
      setSteps(s)
      setStepLibrary(sl)
      setQuote(q)
      setDesignNotes(dn)
    }
    load().catch(err => setError(String(err))).finally(() => setLoading(false))
  }, [id])

  async function saveOverview() {
    setSaving(true)
    try {
      const updated = await updateProject(id, {
        customer_id: customerId || null,
        project_type: (projectType as ProjectType) || null,
        status: (status as ProjectStatus) || null,
        address: address || null,
        notes: notes || null,
      })
      setProject(updated)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  async function handleAddMaterial(e: React.FormEvent) {
    e.preventDefault()
    setAddingMaterial(true)
    try {
      const m = await addMaterial({
        project_id: id,
        item_name: newItemName,
        cost_estimate: newItemCost ? parseFloat(newItemCost) : null,
        ordered: false,
        received: false,
        notes: newItemNotes || null,
      })
      setMaterials(prev => [...prev, m])
      setNewItemName(''); setNewItemCost(''); setNewItemNotes('')
    } finally {
      setAddingMaterial(false)
    }
  }

  async function toggleMaterial(mat: MaterialItem, field: 'ordered' | 'received') {
    const updated = await updateMaterial(mat.id, { [field]: !mat[field] })
    setMaterials(prev => prev.map(m => m.id === mat.id ? updated : m))
  }

  async function handleDeleteMaterial(matId: string) {
    await deleteMaterial(matId)
    setMaterials(prev => prev.filter(m => m.id !== matId))
  }

  async function handleAddStep() {
    const name = useLibrary ? selectedLibraryStep : newStepName
    if (!name) return
    setAddingStep(true)
    try {
      const maxOrder = steps.reduce((max, s) => Math.max(max, s.sequence_order ?? 0), 0)
      const s = await addStep({
        project_id: id,
        step_name: name,
        description: null,
        sequence_order: maxOrder + 1,
        completed: false,
        assigned_to: null,
        notes: null,
      })
      setSteps(prev => [...prev, s])
      setShowAddStep(false)
      setNewStepName('')
      setSelectedLibraryStep('')
      if (!useLibrary) {
        const inLibrary = stepLibrary.some(l => l.step_name === name)
        if (!inLibrary) setSaveToLibraryPrompt(name)
      }
    } finally {
      setAddingStep(false)
    }
  }

  async function saveStepToLibrary(name: string) {
    const item = await addStepToLibrary({ step_name: name, description: null, category: null })
    setStepLibrary(prev => [...prev, item])
    setSaveToLibraryPrompt(null)
  }

  async function toggleStep(step: ProductionStep) {
    const updated = await updateStep(step.id, { completed: !step.completed })
    setSteps(prev => prev.map(s => s.id === step.id ? updated : s))
  }

  async function updateStepField(step: ProductionStep, field: 'assigned_to' | 'notes', value: string) {
    const updated = await updateStep(step.id, { [field]: value || null })
    setSteps(prev => prev.map(s => s.id === step.id ? updated : s))
  }

  async function handleDeleteStep(stepId: string) {
    await deleteStep(stepId)
    setSteps(prev => prev.filter(s => s.id !== stepId))
  }

  async function handleAddNote(e: React.FormEvent) {
    e.preventDefault()
    if (!newNote.trim()) return
    setAddingNote(true)
    try {
      const n = await addDesignMeetingNote(id, newNote.trim())
      setDesignNotes(prev => [n, ...prev])
      setNewNote('')
    } finally {
      setAddingNote(false)
    }
  }

  async function handleDeleteNote(noteId: string) {
    await deleteNote(noteId)
    setDesignNotes(prev => prev.filter(n => n.id !== noteId))
  }

  if (loading) return <div className="text-center py-8 text-gray-500">Loading...</div>
  if (error || !project) return (
    <div className="text-center py-8">
      <p className="text-gray-400 mb-2">{error ?? 'Project not found'}</p>
      <Link href="/dashboard/sales" className="text-amber-400 hover:text-amber-300 text-sm">← Back to Sales</Link>
    </div>
  )

  // Bug 2: stage-aware alerts
  const stageAlerts = getStageAlerts(project)

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link
          href={isShopView ? '/dashboard/shop' : '/dashboard/sales'}
          className="text-gray-500 hover:text-gray-300 text-sm"
        >
          ← {isShopView ? 'Shop' : 'Sales'}
        </Link>
        <h1 className="text-xl font-bold">
          {project.customer?.name ?? 'New Project'}
          {project.project_type && (
            <span className="text-gray-400 font-normal ml-2 text-base capitalize">
              — {project.project_type.replace(/_/g, ' ')}
            </span>
          )}
        </h1>
        {project.status && (
          <span className="text-xs text-gray-400 bg-gray-800 px-2 py-0.5 rounded-full">
            {STATUS_LABELS[project.status]}
          </span>
        )}
      </div>

      {/* Bug 3: tabs determined by view param */}
      <div className="flex gap-1 mb-6 border-b border-gray-800">
        {visibleTabs.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
              tab === t
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            {t === 'steps' ? 'Production Steps' : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* ── Overview Tab ── */}
      {tab === 'overview' && (
        <div className="space-y-5">
          {/* Bug 2: stage-aware yellow alert — only on overview, only if relevant */}
          {stageAlerts.length > 0 && (
            <div className="bg-yellow-950 border border-yellow-800 rounded-lg px-4 py-3 text-sm text-yellow-300">
              <strong className="font-semibold">Action needed:</strong>{' '}
              {stageAlerts.join(' · ')}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Customer</label>
              <select
                value={customerId}
                onChange={e => setCustomerId(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="">— Select customer —</option>
                {customers.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Project Type</label>
              <select
                value={projectType}
                onChange={e => setProjectType(e.target.value as ProjectType)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="">— Select type —</option>
                {PROJECT_TYPES.map(t => (
                  <option key={t} value={t} className="capitalize">{t.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Status</label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value as ProjectStatus)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="">— Select status —</option>
                {STATUSES.map(s => (
                  <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Address</label>
              <input
                type="text"
                value={address}
                onChange={e => setAddress(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                placeholder="Job site address"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm text-gray-400">Color / Finish Confirmed</label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={project.required_fields_completed.color_finish}
                  onChange={async () => {
                    const updated = await updateProject(id, {
                      required_fields_completed: {
                        ...project.required_fields_completed,
                        color_finish: !project.required_fields_completed.color_finish,
                      },
                    })
                    setProject(updated)
                  }}
                  className="accent-amber-500 w-4 h-4"
                />
                <span className="text-sm text-gray-300">
                  {project.required_fields_completed.color_finish ? 'Yes' : 'Not yet'}
                </span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={4}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              placeholder="Project notes..."
            />
          </div>

          <button
            onClick={saveOverview}
            disabled={saving}
            className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-gray-950 font-semibold px-5 py-2 rounded-lg transition-colors text-sm"
          >
            {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Changes'}
          </button>
        </div>
      )}

      {/* ── Materials Tab ── */}
      {tab === 'materials' && (
        <div className="space-y-4">
          <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
            {materials.length === 0 ? (
              <div className="p-6 text-center text-gray-500 text-sm">No materials yet</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="px-4 py-2 text-left text-gray-400 font-medium">Item</th>
                    <th className="px-4 py-2 text-left text-gray-400 font-medium">Cost Est.</th>
                    <th className="px-4 py-2 text-center text-gray-400 font-medium">Ordered</th>
                    <th className="px-4 py-2 text-center text-gray-400 font-medium">Received</th>
                    <th className="px-4 py-2 text-left text-gray-400 font-medium">Notes</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {materials.map(mat => (
                    <tr key={mat.id} className="border-b border-gray-800 last:border-0">
                      <td className="px-4 py-3">{mat.item_name}</td>
                      <td className="px-4 py-3 text-gray-300">
                        {mat.cost_estimate != null ? `$${mat.cost_estimate.toFixed(2)}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <input type="checkbox" checked={mat.ordered} onChange={() => toggleMaterial(mat, 'ordered')} className="accent-amber-500 w-4 h-4" />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <input type="checkbox" checked={mat.received} onChange={() => toggleMaterial(mat, 'received')} className="accent-amber-500 w-4 h-4" />
                      </td>
                      <td className="px-4 py-3 text-gray-400">{mat.notes ?? '—'}</td>
                      <td className="px-4 py-3">
                        <button onClick={() => handleDeleteMaterial(mat.id)} className="text-red-400 hover:text-red-300 text-xs">Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <form onSubmit={handleAddMaterial} className="bg-gray-900 rounded-xl border border-gray-800 p-4">
            <h3 className="text-sm font-medium text-gray-300 mb-3">Add Material</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input type="text" placeholder="Item name *" value={newItemName} onChange={e => setNewItemName(e.target.value)} required
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-amber-500" />
              <input type="number" placeholder="Cost estimate" value={newItemCost} onChange={e => setNewItemCost(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-amber-500" />
              <input type="text" placeholder="Notes" value={newItemNotes} onChange={e => setNewItemNotes(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-amber-500" />
            </div>
            <button type="submit" disabled={addingMaterial || !newItemName}
              className="mt-3 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-gray-950 font-semibold px-4 py-2 rounded-lg text-sm">
              {addingMaterial ? 'Adding...' : 'Add Material'}
            </button>
          </form>
        </div>
      )}

      {/* ── Production Steps Tab (shop view only) ── */}
      {tab === 'steps' && (
        <div className="space-y-3">
          {saveToLibraryPrompt && (
            <div className="bg-blue-950 border border-blue-800 rounded-lg px-4 py-3 text-sm text-blue-200 flex items-center justify-between">
              <span>Save &ldquo;{saveToLibraryPrompt}&rdquo; to the step library?</span>
              <div className="flex gap-2">
                <button onClick={() => saveStepToLibrary(saveToLibraryPrompt)} className="text-blue-300 hover:text-white font-medium">Yes</button>
                <button onClick={() => setSaveToLibraryPrompt(null)} className="text-blue-400 hover:text-white">No</button>
              </div>
            </div>
          )}

          {steps.length === 0 ? (
            <div className="text-center text-gray-500 text-sm py-4">No steps yet</div>
          ) : (
            <div className="space-y-2">
              {steps.map((step, idx) => (
                <div key={step.id} className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="text-gray-500 text-sm w-5 shrink-0">{idx + 1}</span>
                    <input type="checkbox" checked={step.completed} onChange={() => toggleStep(step)} className="accent-amber-500 w-4 h-4 shrink-0" />
                    <span className={`flex-1 text-sm ${step.completed ? 'line-through text-gray-500' : 'text-white'}`}>{step.step_name}</span>
                    <input type="text" defaultValue={step.assigned_to ?? ''} onBlur={e => updateStepField(step, 'assigned_to', e.target.value)}
                      placeholder="Assigned to"
                      className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white w-28 focus:outline-none focus:ring-1 focus:ring-amber-500" />
                    <button onClick={() => handleDeleteStep(step.id)} className="text-red-400 hover:text-red-300 text-xs shrink-0">Delete</button>
                  </div>
                  <div className="ml-8 mt-2">
                    <input type="text" defaultValue={step.notes ?? ''} onBlur={e => updateStepField(step, 'notes', e.target.value)}
                      placeholder="Notes..."
                      className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-300 w-full focus:outline-none focus:ring-1 focus:ring-amber-500" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {!showAddStep ? (
            <button onClick={() => setShowAddStep(true)} className="bg-amber-500 hover:bg-amber-400 text-gray-950 font-semibold px-4 py-2 rounded-lg text-sm">
              + Add Step
            </button>
          ) : (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-4">
                <button onClick={() => setUseLibrary(false)} className={`text-sm px-3 py-1 rounded ${!useLibrary ? 'bg-gray-700 text-white' : 'text-gray-400'}`}>Custom</button>
                <button onClick={() => setUseLibrary(true)} className={`text-sm px-3 py-1 rounded ${useLibrary ? 'bg-gray-700 text-white' : 'text-gray-400'}`}>From Library</button>
              </div>
              {useLibrary ? (
                <select value={selectedLibraryStep} onChange={e => setSelectedLibraryStep(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-amber-500">
                  <option value="">— Pick from library —</option>
                  {stepLibrary.map(s => <option key={s.id} value={s.step_name}>{s.step_name}</option>)}
                </select>
              ) : (
                <input type="text" placeholder="Step name" value={newStepName} onChange={e => setNewStepName(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-amber-500" />
              )}
              <div className="flex gap-2">
                <button onClick={handleAddStep} disabled={addingStep || (useLibrary ? !selectedLibraryStep : !newStepName)}
                  className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-gray-950 font-semibold px-4 py-2 rounded-lg text-sm">
                  {addingStep ? 'Adding...' : 'Add'}
                </button>
                <button onClick={() => { setShowAddStep(false); setNewStepName(''); setSelectedLibraryStep('') }} className="text-gray-400 hover:text-white text-sm px-3">Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Quote Tab ── */}
      {tab === 'quote' && (
        <div className="space-y-6">
          {!quote ? (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
              <p className="text-gray-400 mb-4">No quote yet for this project.</p>
              <Link
                href={`/dashboard/projects/${id}/quote-agent?view=${view}`}
                className="bg-amber-500 hover:bg-amber-400 text-gray-950 font-semibold px-5 py-2.5 rounded-lg text-sm inline-block"
              >
                Start AI Quote
              </Link>
            </div>
          ) : (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h2 className="font-semibold">Quote</h2>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${QUOTE_STATUS_COLORS[quote.status ?? 'initial']}`}>
                    {(quote.status ?? 'initial').charAt(0).toUpperCase() + (quote.status ?? 'initial').slice(1)}
                    {(quote.version ?? 1) > 1 && ` v${quote.version}`}
                  </span>
                </div>
                <Link
                  href={`/dashboard/projects/${id}/quote-agent?view=${view}`}
                  className="text-sm text-amber-400 hover:text-amber-300"
                >
                  Open Quote Agent
                </Link>
              </div>

              {quote.total_price != null && (
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">Final Price</p>
                  <p className="text-3xl font-bold text-amber-400">${quote.total_price.toLocaleString()}</p>
                </div>
              )}
              {quote.scope_of_work && (
                <div>
                  <p className="text-xs text-gray-400 mb-1">Scope of Work</p>
                  <p className="text-sm text-gray-300 leading-relaxed">{quote.scope_of_work}</p>
                </div>
              )}
              {quote.complexity_assessment && (
                <div>
                  <p className="text-xs text-gray-400 mb-1">Complexity Assessment</p>
                  <p className="text-sm text-gray-300">{quote.complexity_assessment}</p>
                </div>
              )}
            </div>
          )}

          {/* Design Meeting Notes */}
          <div>
            <h2 className="text-base font-semibold mb-3">Design Meeting Notes</h2>
            <form onSubmit={handleAddNote} className="mb-4">
              <textarea
                value={newNote}
                onChange={e => setNewNote(e.target.value)}
                rows={3}
                placeholder="Add meeting notes, customer preferences, or observations..."
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
              <button type="submit" disabled={addingNote || !newNote.trim()}
                className="mt-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm">
                {addingNote ? 'Adding...' : 'Add Note'}
              </button>
            </form>
            {designNotes.length === 0 ? (
              <p className="text-sm text-gray-500">No notes yet.</p>
            ) : (
              <div className="space-y-3">
                {designNotes.map(n => (
                  <div key={n.id} className="bg-gray-900 border border-gray-800 rounded-lg p-4">
                    <div className="flex justify-between items-start">
                      <p className="text-xs text-gray-500">{new Date(n.created_at).toLocaleString()}</p>
                      <button onClick={() => handleDeleteNote(n.id)} className="text-red-400 hover:text-red-300 text-xs">Delete</button>
                    </div>
                    <p className="text-sm text-gray-200 mt-1 whitespace-pre-wrap">{n.notes}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
