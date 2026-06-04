'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { getProjectById, updateProject, getCustomers, getMaterialsByProjectId, addMaterial, updateMaterial, deleteMaterial, getStepsByProjectId, addStep, updateStep, deleteStep, reorderSteps, getStepLibrary, addStepToLibrary, getQuoteByProjectId } from '@/lib/api/supabase-client'
import type { Project, Customer, MaterialItem, ProductionStep, StepLibraryItem, Quote, ProjectStatus, ProjectType } from '@/lib/core/types'

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

type Tab = 'overview' | 'materials' | 'steps' | 'quote'

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [tab, setTab] = useState<Tab>('overview')
  const [project, setProject] = useState<Project | null>(null)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [materials, setMaterials] = useState<MaterialItem[]>([])
  const [steps, setSteps] = useState<ProductionStep[]>([])
  const [stepLibrary, setStepLibrary] = useState<StepLibraryItem[]>([])
  const [quote, setQuote] = useState<Quote | null>(null)
  const [loading, setLoading] = useState(true)
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

  useEffect(() => {
    async function load() {
      const [p, c, m, s, sl, q] = await Promise.all([
        getProjectById(id),
        getCustomers(),
        getMaterialsByProjectId(id),
        getStepsByProjectId(id),
        getStepLibrary(),
        getQuoteByProjectId(id),
      ])
      if (p) {
        setProject(p)
        setCustomerId(p.customer_id ?? '')
        setProjectType(p.project_type ?? '')
        setStatus(p.status ?? '')
        setAddress(p.address ?? '')
        setNotes(p.notes ?? '')
      }
      setCustomers(c)
      setMaterials(m)
      setSteps(s)
      setStepLibrary(sl)
      setQuote(q)
    }
    load().catch(console.error).finally(() => setLoading(false))
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

  const missingFields = project
    ? Object.entries(project.required_fields_completed)
        .filter(([, v]) => !v)
        .map(([k]) => k.replace('_', ' '))
    : []

  if (loading) return <div className="text-center py-8 text-gray-500">Loading...</div>
  if (!project) return <div className="text-center py-8 text-gray-500">Project not found</div>

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <h1 className="text-xl font-bold">
          {project.customer?.name ?? 'New Project'}
          {project.project_type && (
            <span className="text-gray-400 font-normal ml-2 text-base capitalize">
              — {project.project_type.replace('_', ' ')}
            </span>
          )}
        </h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-800">
        {(['overview', 'materials', 'steps', 'quote'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
              tab === t
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* ── Overview Tab ── */}
      {tab === 'overview' && (
        <div className="space-y-5">
          {missingFields.length > 0 && (
            <div className="bg-red-950 border border-red-800 rounded-lg px-4 py-3 text-sm text-red-300">
              <strong>Missing required fields:</strong> {missingFields.join(', ')}
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
                  <option key={t} value={t} className="capitalize">{t.replace('_', ' ')}</option>
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
                        <input
                          type="checkbox"
                          checked={mat.ordered}
                          onChange={() => toggleMaterial(mat, 'ordered')}
                          className="accent-amber-500 w-4 h-4"
                        />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={mat.received}
                          onChange={() => toggleMaterial(mat, 'received')}
                          className="accent-amber-500 w-4 h-4"
                        />
                      </td>
                      <td className="px-4 py-3 text-gray-400">{mat.notes ?? '—'}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleDeleteMaterial(mat.id)}
                          className="text-red-400 hover:text-red-300 text-xs"
                        >
                          Delete
                        </button>
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
              <input
                type="text"
                placeholder="Item name *"
                value={newItemName}
                onChange={e => setNewItemName(e.target.value)}
                required
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
              <input
                type="number"
                placeholder="Cost estimate"
                value={newItemCost}
                onChange={e => setNewItemCost(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
              <input
                type="text"
                placeholder="Notes"
                value={newItemNotes}
                onChange={e => setNewItemNotes(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>
            <button
              type="submit"
              disabled={addingMaterial || !newItemName}
              className="mt-3 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-gray-950 font-semibold px-4 py-2 rounded-lg text-sm"
            >
              {addingMaterial ? 'Adding...' : 'Add Material'}
            </button>
          </form>
        </div>
      )}

      {/* ── Steps Tab ── */}
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
                    <input
                      type="checkbox"
                      checked={step.completed}
                      onChange={() => toggleStep(step)}
                      className="accent-amber-500 w-4 h-4 shrink-0"
                    />
                    <span className={`flex-1 text-sm ${step.completed ? 'line-through text-gray-500' : 'text-white'}`}>
                      {step.step_name}
                    </span>
                    <input
                      type="text"
                      defaultValue={step.assigned_to ?? ''}
                      onBlur={e => updateStepField(step, 'assigned_to', e.target.value)}
                      placeholder="Assigned to"
                      className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white w-28 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                    <button
                      onClick={() => handleDeleteStep(step.id)}
                      className="text-red-400 hover:text-red-300 text-xs shrink-0"
                    >
                      Delete
                    </button>
                  </div>
                  <div className="ml-8 mt-2">
                    <input
                      type="text"
                      defaultValue={step.notes ?? ''}
                      onBlur={e => updateStepField(step, 'notes', e.target.value)}
                      placeholder="Notes..."
                      className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-300 w-full focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {!showAddStep ? (
            <button
              onClick={() => setShowAddStep(true)}
              className="bg-amber-500 hover:bg-amber-400 text-gray-950 font-semibold px-4 py-2 rounded-lg text-sm"
            >
              + Add Step
            </button>
          ) : (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setUseLibrary(false)}
                  className={`text-sm px-3 py-1 rounded ${!useLibrary ? 'bg-gray-700 text-white' : 'text-gray-400'}`}
                >
                  Custom
                </button>
                <button
                  onClick={() => setUseLibrary(true)}
                  className={`text-sm px-3 py-1 rounded ${useLibrary ? 'bg-gray-700 text-white' : 'text-gray-400'}`}
                >
                  From Library
                </button>
              </div>
              {useLibrary ? (
                <select
                  value={selectedLibraryStep}
                  onChange={e => setSelectedLibraryStep(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                >
                  <option value="">— Pick from library —</option>
                  {stepLibrary.map(s => (
                    <option key={s.id} value={s.step_name}>{s.step_name}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  placeholder="Step name"
                  value={newStepName}
                  onChange={e => setNewStepName(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              )}
              <div className="flex gap-2">
                <button
                  onClick={handleAddStep}
                  disabled={addingStep || (useLibrary ? !selectedLibraryStep : !newStepName)}
                  className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-gray-950 font-semibold px-4 py-2 rounded-lg text-sm"
                >
                  {addingStep ? 'Adding...' : 'Add'}
                </button>
                <button onClick={() => { setShowAddStep(false); setNewStepName(''); setSelectedLibraryStep('') }} className="text-gray-400 hover:text-white text-sm px-3">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Quote Tab ── */}
      {tab === 'quote' && (
        <div className="space-y-5">
          {quote ? (
            <>
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
                  <p className="text-xs text-gray-400 mb-1">Base Price</p>
                  <p className="text-xl font-semibold">{quote.base_price != null ? `$${quote.base_price.toFixed(2)}` : '—'}</p>
                </div>
                <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
                  <p className="text-xs text-gray-400 mb-1">Markup</p>
                  <p className="text-xl font-semibold">{quote.markup_percentage != null ? `${quote.markup_percentage}%` : '—'}</p>
                </div>
                <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
                  <p className="text-xs text-gray-400 mb-1">Total Price</p>
                  <p className="text-xl font-semibold text-amber-400">{quote.total_price != null ? `$${quote.total_price.toFixed(2)}` : '—'}</p>
                </div>
              </div>

              {quote.add_ons.length > 0 && (
                <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
                  <h3 className="text-sm font-medium text-gray-300 mb-2">Add-ons</h3>
                  {quote.add_ons.map((a, i) => (
                    <div key={i} className="flex justify-between text-sm text-gray-300 py-1">
                      <span>{a.name}</span>
                      <span>${a.price.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}

              {quote.ai_conversation_history.length > 0 && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3 max-h-96 overflow-y-auto">
                  <h3 className="text-sm font-medium text-gray-300 mb-2">AI Conversation</h3>
                  {quote.ai_conversation_history.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-xs rounded-lg px-3 py-2 text-sm ${
                        msg.role === 'user'
                          ? 'bg-amber-500 text-gray-950'
                          : 'bg-gray-800 text-gray-100'
                      }`}>
                        {msg.content}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="text-center text-gray-500 text-sm py-4">No quote yet for this project</div>
          )}

          <button
            disabled
            className="opacity-40 bg-gray-700 text-gray-300 font-semibold px-5 py-2 rounded-lg text-sm cursor-not-allowed"
          >
            Open AI Quote Agent (coming soon)
          </button>
        </div>
      )}
    </div>
  )
}
