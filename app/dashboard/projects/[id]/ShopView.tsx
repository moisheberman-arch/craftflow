'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  updateProject, updateCustomer,
  getMaterialsByProjectId, addMaterial, updateMaterial, deleteMaterial,
  getStepsByProjectId, addStep, updateStep, deleteStep, getStepLibrary, addStepToLibrary,
  getNotesByProjectId, addDesignMeetingNote, deleteNote,
  getShoppingListByProjectId, addShoppingListItem, updateShoppingListItem, deleteShoppingListItem,
} from '@/lib/api/supabase-client'
import type {
  Project, Customer, MaterialItem, ProductionStep, StepLibraryItem,
  DesignMeetingNote, ShoppingListItem, ProjectType, ProjectStatus,
} from '@/lib/core/types'

const PROJECT_TYPES: ProjectType[] = ['dining_table', 'built_in', 'bookcase', 'buffet', 'other']

// ── Inline editable field ──────────────────────────────────────────────────
function Field({
  label,
  value,
  onChange,
  type = 'text',
  rows,
  placeholder,
  highlight,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  rows?: number
  placeholder?: string
  highlight?: boolean
}) {
  const cls = `w-full bg-gray-800 border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-amber-500 ${
    highlight ? 'border-amber-500/60' : 'border-gray-700'
  }`
  return (
    <div>
      <label className={`block text-xs mb-1 ${highlight ? 'text-amber-400 font-semibold' : 'text-gray-400'}`}>{label}</label>
      {rows ? (
        <textarea rows={rows} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className={cls} />
      ) : (
        <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className={cls} />
      )}
    </div>
  )
}

export default function ShopView({ project: initialProject }: { project: Project }) {
  const [project, setProject] = useState(initialProject)
  const customer = project.customer as Customer | undefined

  // Left column state
  const [cName, setCName] = useState(customer?.name ?? '')
  const [cPhone, setCPhone] = useState(customer?.phone ?? '')
  const [cEmail, setCEmail] = useState(customer?.email ?? '')
  const [cAddress, setCAddress] = useState(customer?.address ?? '')
  const [savingContact, setSavingContact] = useState(false)
  const [contactSaved, setContactSaved] = useState(false)

  const [pType, setPType] = useState<ProjectType | ''>(project.project_type ?? '')
  const [colorFinish, setColorFinish] = useState(project.required_fields_completed.color_finish ? 'confirmed' : '')
  const [woodSpecies, setWoodSpecies] = useState('')
  const [ceilingHeight, setCeilingHeight] = useState('')
  const [dimWidth, setDimWidth] = useState('')
  const [dimHeight, setDimHeight] = useState('')
  const [dimDepth, setDimDepth] = useState('')
  const [pNotes, setPNotes] = useState(project.notes ?? '')
  const [savingDetails, setSavingDetails] = useState(false)
  const [detailsSaved, setDetailsSaved] = useState(false)

  // Design notes
  const [designNotes, setDesignNotes] = useState<DesignMeetingNote[]>([])
  const [newNote, setNewNote] = useState('')
  const [addingNote, setAddingNote] = useState(false)

  // Production steps
  const [steps, setSteps] = useState<ProductionStep[]>([])
  const [stepLibrary, setStepLibrary] = useState<StepLibraryItem[]>([])
  const [showAddStep, setShowAddStep] = useState(false)
  const [newStepName, setNewStepName] = useState('')
  const [useLibrary, setUseLibrary] = useState(false)
  const [selectedLibStep, setSelectedLibStep] = useState('')
  const [addingStep, setAddingStep] = useState(false)
  const [libPrompt, setLibPrompt] = useState<string | null>(null)

  // Materials
  const [materials, setMaterials] = useState<MaterialItem[]>([])
  const [matName, setMatName] = useState('')
  const [matCost, setMatCost] = useState('')
  const [matNotes, setMatNotes] = useState('')
  const [addingMat, setAddingMat] = useState(false)

  // Shopping list
  const [shopItems, setShopItems] = useState<ShoppingListItem[]>([])
  const [shopInput, setShopInput] = useState('')
  const [addingShop, setAddingShop] = useState(false)

  const id = project.id

  useEffect(() => {
    Promise.all([
      getStepsByProjectId(id).catch(() => [] as ProductionStep[]),
      getStepLibrary().catch(() => [] as StepLibraryItem[]),
      getMaterialsByProjectId(id).catch(() => [] as MaterialItem[]),
      getNotesByProjectId(id).catch(() => [] as DesignMeetingNote[]),
      getShoppingListByProjectId(id).catch(() => [] as ShoppingListItem[]),
    ]).then(([s, sl, m, dn, shop]) => {
      setSteps(s)
      setStepLibrary(sl)
      setMaterials(m)
      setDesignNotes(dn)
      setShopItems(shop)
    })
  }, [id])

  // ── Contact save ────────────────────────────────────────────────────────
  async function saveContact() {
    setSavingContact(true)
    try {
      if (customer?.id) {
        await updateCustomer(customer.id, { name: cName, phone: cPhone || null, email: cEmail || null, address: cAddress || null })
      }
      await updateProject(id, { address: cAddress || null })
      setProject(p => ({ ...p, address: cAddress || null }))
      setContactSaved(true)
      setTimeout(() => setContactSaved(false), 2000)
    } finally {
      setSavingContact(false)
    }
  }

  // ── Details save ────────────────────────────────────────────────────────
  async function saveDetails() {
    setSavingDetails(true)
    try {
      const updated = await updateProject(id, {
        project_type: (pType as ProjectType) || null,
        notes: pNotes || null,
        required_fields_completed: {
          ...project.required_fields_completed,
          color_finish: !!colorFinish,
          project_type: !!pType,
        },
      })
      setProject(updated)
      setDetailsSaved(true)
      setTimeout(() => setDetailsSaved(false), 2000)
    } finally {
      setSavingDetails(false)
    }
  }

  // ── Steps ────────────────────────────────────────────────────────────────
  async function handleAddStep() {
    const name = useLibrary ? selectedLibStep : newStepName
    if (!name) return
    setAddingStep(true)
    try {
      const maxOrder = steps.reduce((m, s) => Math.max(m, s.sequence_order ?? 0), 0)
      const s = await addStep({ project_id: id, step_name: name, description: null, sequence_order: maxOrder + 1, completed: false, assigned_to: null, notes: null })
      setSteps(prev => [...prev, s])
      setShowAddStep(false); setNewStepName(''); setSelectedLibStep('')
      if (!useLibrary && !stepLibrary.some(l => l.step_name === name)) setLibPrompt(name)
    } finally { setAddingStep(false) }
  }

  async function saveToLibrary(name: string) {
    const item = await addStepToLibrary({ step_name: name, description: null, category: null })
    setStepLibrary(prev => [...prev, item])
    setLibPrompt(null)
  }

  async function toggleStep(step: ProductionStep) {
    const u = await updateStep(step.id, { completed: !step.completed })
    setSteps(prev => prev.map(s => s.id === step.id ? u : s))
  }

  async function updateStepNotes(step: ProductionStep, v: string) {
    const u = await updateStep(step.id, { notes: v || null })
    setSteps(prev => prev.map(s => s.id === step.id ? u : s))
  }

  // ── Materials ────────────────────────────────────────────────────────────
  async function handleAddMat(e: React.FormEvent) {
    e.preventDefault()
    setAddingMat(true)
    try {
      const m = await addMaterial({ project_id: id, item_name: matName, cost_estimate: matCost ? parseFloat(matCost) : null, ordered: false, received: false, notes: matNotes || null })
      setMaterials(prev => [...prev, m])
      setMatName(''); setMatCost(''); setMatNotes('')
    } finally { setAddingMat(false) }
  }

  async function toggleMat(mat: MaterialItem, field: 'ordered' | 'received') {
    const u = await updateMaterial(mat.id, { [field]: !mat[field] })
    setMaterials(prev => prev.map(m => m.id === mat.id ? u : m))
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

  // ── Shopping list ─────────────────────────────────────────────────────────
  async function handleAddShopItem(e: React.FormEvent) {
    e.preventDefault()
    if (!shopInput.trim()) return
    setAddingShop(true)
    try {
      const item = await addShoppingListItem(id, shopInput.trim())
      setShopItems(prev => [...prev, item])
      setShopInput('')
    } finally { setAddingShop(false) }
  }

  async function togglePurchased(item: ShoppingListItem) {
    const u = await updateShoppingListItem(item.id, { purchased: !item.purchased })
    setShopItems(prev => prev.map(i => i.id === item.id ? u : i))
  }

  const completedSteps = steps.filter(s => s.completed).length

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-5 shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/shop" className="text-gray-500 hover:text-gray-300 text-sm">← Shop</Link>
          <h1 className="text-lg font-bold">
            {customer?.name ?? 'Project'}
            {project.project_type && (
              <span className="text-gray-400 font-normal ml-2 text-base capitalize">
                — {project.project_type.replace(/_/g, ' ')}
              </span>
            )}
          </h1>
          {project.status && (
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
              project.status === 'in_production' ? 'bg-orange-900 text-orange-200' : 'bg-green-900 text-green-200'
            }`}>
              {project.status.replace(/_/g, ' ')}
            </span>
          )}
        </div>
        <div className="text-sm text-gray-400">
          {completedSteps}/{steps.length} steps complete
        </div>
      </div>

      {/* Two-column layout */}
      <div className="flex gap-5 flex-1 min-h-0 overflow-y-auto">
        {/* Left column ~35% */}
        <div className="w-[34%] shrink-0 space-y-4 overflow-y-auto">
          {/* Contact info */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-200">Customer Info</h3>
            <Field label="Name" value={cName} onChange={setCName} />
            <Field label="Phone" value={cPhone} onChange={setCPhone} />
            <Field label="Email" value={cEmail} onChange={setCEmail} type="email" />
            <Field label="Address" value={cAddress} onChange={setCAddress} />
            <button onClick={saveContact} disabled={savingContact}
              className="w-full bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-white text-sm py-1.5 rounded-lg transition-colors">
              {savingContact ? 'Saving...' : contactSaved ? '✓ Saved' : 'Save Contact'}
            </button>
          </div>

          {/* Key project details */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-200">Project Details</h3>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Project Type</label>
              <select value={pType} onChange={e => setPType(e.target.value as ProjectType)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-amber-500">
                <option value="">—</option>
                {PROJECT_TYPES.map(t => <option key={t} value={t} className="capitalize">{t.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <Field
              label="Color / Finish ★"
              value={colorFinish}
              onChange={setColorFinish}
              placeholder="e.g. BM White Dove, natural walnut..."
              highlight
            />
            <Field label="Wood Species / Material" value={woodSpecies} onChange={setWoodSpecies} placeholder="e.g. Maple, Walnut, Painted MDF" />
            <Field label="Ceiling Height" value={ceilingHeight} onChange={setCeilingHeight} placeholder='e.g. 9&apos;4"' />
            <div className="grid grid-cols-3 gap-2">
              <Field label='Width' value={dimWidth} onChange={setDimWidth} placeholder='W"' />
              <Field label='Height' value={dimHeight} onChange={setDimHeight} placeholder='H"' />
              <Field label='Depth' value={dimDepth} onChange={setDimDepth} placeholder='D"' />
            </div>
            <Field label="Notes" value={pNotes} onChange={setPNotes} rows={3} placeholder="Project notes..." />
            <button onClick={saveDetails} disabled={savingDetails}
              className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-gray-950 font-semibold text-sm py-1.5 rounded-lg transition-colors">
              {savingDetails ? 'Saving...' : detailsSaved ? '✓ Saved' : 'Save Changes'}
            </button>
          </div>

          {/* Design notes */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-200">Design Meeting Notes</h3>
            <form onSubmit={handleAddNote} className="flex gap-2">
              <input
                value={newNote}
                onChange={e => setNewNote(e.target.value)}
                placeholder="Add a note..."
                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
              <button type="submit" disabled={addingNote || !newNote.trim()}
                className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg text-sm shrink-0">
                Add
              </button>
            </form>
            {designNotes.length === 0 ? (
              <p className="text-xs text-gray-500">No notes yet</p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {designNotes.map(n => (
                  <div key={n.id} className="bg-gray-800 rounded-lg p-3">
                    <div className="flex justify-between items-start">
                      <p className="text-xs text-gray-500">{new Date(n.created_at).toLocaleString()}</p>
                      <button onClick={() => deleteNote(n.id).then(() => setDesignNotes(prev => prev.filter(x => x.id !== n.id)))}
                        className="text-red-400 hover:text-red-300 text-xs ml-2">×</button>
                    </div>
                    <p className="text-xs text-gray-200 mt-1 whitespace-pre-wrap">{n.notes}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right column ~65% */}
        <div className="flex-1 min-w-0 space-y-4 overflow-y-auto">
          {/* Production Steps */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-200">Production Steps</h3>
              <span className="text-xs text-gray-500">{completedSteps}/{steps.length}</span>
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
                <div key={step.id} className={`rounded-lg p-3 border transition-colors ${step.completed ? 'bg-gray-800/40 border-gray-800' : 'bg-gray-800 border-gray-700'}`}>
                  <div className="flex items-center gap-2.5">
                    <span className="text-gray-600 text-xs w-4 shrink-0">{idx + 1}</span>
                    <input type="checkbox" checked={step.completed} onChange={() => toggleStep(step)} className="accent-amber-500 w-4 h-4 shrink-0" />
                    <span className={`flex-1 text-sm ${step.completed ? 'line-through text-gray-500' : 'text-white'}`}>
                      {step.step_name}
                    </span>
                    <button onClick={() => deleteStep(step.id).then(() => setSteps(prev => prev.filter(s => s.id !== step.id)))}
                      className="text-red-400 hover:text-red-300 text-xs shrink-0">×</button>
                  </div>
                  <div className="ml-9 mt-1.5">
                    <input type="text" defaultValue={step.notes ?? ''} onBlur={e => updateStepNotes(step, e.target.value)}
                      placeholder="Notes..."
                      className="bg-gray-700/50 border border-gray-700 rounded px-2 py-1 text-xs text-gray-300 w-full focus:outline-none focus:ring-1 focus:ring-amber-500/50" />
                  </div>
                </div>
              ))}
            </div>

            {!showAddStep ? (
              <button onClick={() => setShowAddStep(true)}
                className="mt-3 w-full border border-dashed border-gray-700 hover:border-amber-500/50 text-gray-500 hover:text-amber-400 rounded-lg py-2 text-sm transition-colors">
                + Add Step
              </button>
            ) : (
              <div className="mt-3 bg-gray-800 border border-gray-700 rounded-lg p-3 space-y-2">
                <div className="flex gap-1">
                  <button onClick={() => setUseLibrary(false)} className={`text-xs px-2 py-1 rounded ${!useLibrary ? 'bg-gray-700 text-white' : 'text-gray-400'}`}>Custom</button>
                  <button onClick={() => setUseLibrary(true)} className={`text-xs px-2 py-1 rounded ${useLibrary ? 'bg-gray-700 text-white' : 'text-gray-400'}`}>From Library</button>
                </div>
                {useLibrary ? (
                  <select value={selectedLibStep} onChange={e => setSelectedLibStep(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-white focus:outline-none">
                    <option value="">— Pick step —</option>
                    {stepLibrary.map(s => <option key={s.id} value={s.step_name}>{s.step_name}</option>)}
                  </select>
                ) : (
                  <input type="text" placeholder="Step name" value={newStepName} onChange={e => setNewStepName(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-white focus:outline-none" />
                )}
                <div className="flex gap-2">
                  <button onClick={handleAddStep} disabled={addingStep || (useLibrary ? !selectedLibStep : !newStepName)}
                    className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-gray-950 font-semibold px-3 py-1 rounded text-xs">
                    {addingStep ? 'Adding...' : 'Add'}
                  </button>
                  <button onClick={() => { setShowAddStep(false); setNewStepName(''); setSelectedLibStep('') }}
                    className="text-gray-400 hover:text-white text-xs px-2">Cancel</button>
                </div>
              </div>
            )}
          </div>

          {/* Materials Checklist */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-gray-200 mb-3">Materials Checklist</h3>
            {materials.length === 0 ? (
              <p className="text-xs text-gray-500 mb-3">No materials yet</p>
            ) : (
              <div className="space-y-1.5 mb-3">
                {materials.map(mat => (
                  <div key={mat.id} className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-2 text-xs">
                    <span className="flex-1 text-white">{mat.item_name}</span>
                    {mat.cost_estimate != null && (
                      <span className="text-gray-400 font-mono">${mat.cost_estimate.toFixed(0)}</span>
                    )}
                    <label className="flex items-center gap-1 text-gray-400 cursor-pointer">
                      <input type="checkbox" checked={mat.ordered} onChange={() => toggleMat(mat, 'ordered')} className="accent-amber-500 w-3 h-3" />
                      Ord
                    </label>
                    <label className="flex items-center gap-1 text-gray-400 cursor-pointer">
                      <input type="checkbox" checked={mat.received} onChange={() => toggleMat(mat, 'received')} className="accent-emerald-500 w-3 h-3" />
                      Rcvd
                    </label>
                    <button onClick={() => deleteMaterial(mat.id).then(() => setMaterials(prev => prev.filter(m => m.id !== mat.id)))}
                      className="text-red-400 hover:text-red-300">×</button>
                  </div>
                ))}
              </div>
            )}
            <form onSubmit={handleAddMat} className="flex gap-2">
              <input required placeholder="Item name" value={matName} onChange={e => setMatName(e.target.value)}
                className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500" />
              <input type="number" placeholder="Cost" value={matCost} onChange={e => setMatCost(e.target.value)}
                className="w-20 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500" />
              <button type="submit" disabled={addingMat || !matName}
                className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-gray-950 font-semibold px-3 py-1.5 rounded text-xs">
                {addingMat ? '...' : 'Add'}
              </button>
            </form>
          </div>

          {/* Shopping List */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-gray-200 mb-3">Shopping List</h3>
            {shopItems.length === 0 ? (
              <p className="text-xs text-gray-500 mb-3">Nothing on the list yet</p>
            ) : (
              <div className="space-y-1.5 mb-3">
                {shopItems.map(item => (
                  <div key={item.id} className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm ${item.purchased ? 'bg-gray-800/40' : 'bg-gray-800'}`}>
                    <input type="checkbox" checked={item.purchased} onChange={() => togglePurchased(item)} className="accent-emerald-500 w-4 h-4 shrink-0" />
                    <span className={`flex-1 ${item.purchased ? 'line-through text-gray-500' : 'text-white'}`}>{item.item}</span>
                    <button onClick={() => deleteShoppingListItem(item.id).then(() => setShopItems(prev => prev.filter(i => i.id !== item.id)))}
                      className="text-red-400 hover:text-red-300 text-xs">×</button>
                  </div>
                ))}
              </div>
            )}
            <form onSubmit={handleAddShopItem} className="flex gap-2">
              <input
                placeholder="Add item to buy..."
                value={shopInput}
                onChange={e => setShopInput(e.target.value)}
                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
              <button type="submit" disabled={addingShop || !shopInput.trim()}
                className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold px-3 py-2 rounded-lg text-sm">
                {addingShop ? '...' : 'Add'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
