'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  getAllProjectTypeFields, addProjectTypeField, updateProjectTypeField,
  deleteProjectTypeField, reorderProjectTypeFields,
  getCustomProjectTypes, createCustomProjectType, updateCustomProjectType, deleteCustomProjectType,
} from '@/lib/api/supabase-client'
import type { ProjectTypeField, ProjectTypeFieldType, CustomProjectType } from '@/lib/core/types'

const PROJECT_TYPES = ['dining_table', 'built_in', 'bookcase', 'bar', 'buffet', 'desk', 'other'] as const
type PTKey = typeof PROJECT_TYPES[number]

const PT_LABELS: Record<PTKey, string> = {
  dining_table: 'Dining Table', built_in: 'Built-In', bookcase: 'Bookcase',
  bar: 'Bar', buffet: 'Buffet', desk: 'Desk', other: 'Other',
}

const FIELD_TYPE_LABELS: Record<ProjectTypeFieldType, string> = {
  yes_no: 'Yes / No', number: 'Number', dropdown: 'Dropdown', text: 'Text',
}

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}

// ── Inline field editor ──────────────────────────────────────────────────

function FieldEditor({
  initial,
  projectType,
  onSave,
  onCancel,
}: {
  initial?: ProjectTypeField | null
  projectType: string
  onSave: (f: ProjectTypeField) => void
  onCancel: () => void
}) {
  const [label, setLabel] = useState(initial?.field_label ?? '')
  const [key, setKey] = useState(initial?.field_key ?? '')
  const [type, setType] = useState<ProjectTypeFieldType>(initial?.field_type ?? 'yes_no')
  const [options, setOptions] = useState<string[]>(initial?.field_options as string[] ?? [])
  const [optInput, setOptInput] = useState('')
  const [affectsPrice, setAffectsPrice] = useState(initial?.affects_price ?? false)
  const [saving, setSaving] = useState(false)

  function handleLabelChange(v: string) {
    setLabel(v)
    if (!initial) setKey(slugify(v))
  }

  async function handleSave() {
    if (!label.trim() || !key.trim()) return
    setSaving(true)
    try {
      const payload = {
        project_type: projectType,
        field_label: label.trim(),
        field_key: key.trim(),
        field_type: type,
        field_options: options,
        affects_price: affectsPrice,
        sequence_order: initial?.sequence_order ?? 999,
        is_active: true,
      }
      let result: ProjectTypeField
      if (initial) {
        result = await updateProjectTypeField(initial.id, payload)
      } else {
        result = await addProjectTypeField(payload)
      }
      onSave(result)
    } finally { setSaving(false) }
  }

  return (
    <div className="bg-gray-100 border border-gray-300 rounded-lg p-4 space-y-3 mt-2">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-500 block mb-1">Field Label *</label>
          <input value={label} onChange={e => handleLabelChange(e.target.value)}
            placeholder="e.g. Does the customer want leaves?"
            className="w-full bg-gray-200 border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-900 focus:outline-none" />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Field Key *</label>
          <input value={key} onChange={e => setKey(e.target.value)}
            placeholder="e.g. wants_leaves"
            className="w-full bg-gray-200 border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-900 focus:outline-none font-mono" />
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div>
          <label className="text-xs text-gray-500 block mb-1">Field Type</label>
          <select value={type} onChange={e => setType(e.target.value as ProjectTypeFieldType)}
            className="bg-gray-200 border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-900 focus:outline-none">
            {(Object.entries(FIELD_TYPE_LABELS) as [ProjectTypeFieldType, string][]).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 cursor-pointer mt-4">
          <input type="checkbox" checked={affectsPrice} onChange={e => setAffectsPrice(e.target.checked)} className="accent-blue-600" />
          <span className="text-sm text-gray-700">Affects Price ($)</span>
        </label>
      </div>
      {type === 'dropdown' && (
        <div>
          <label className="text-xs text-gray-500 block mb-1">Options</label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {options.map((opt, i) => (
              <span key={i} className="bg-gray-200 text-gray-800 text-xs px-2 py-0.5 rounded flex items-center gap-1">
                {opt}
                <button onClick={() => setOptions(prev => prev.filter((_, j) => j !== i))} className="text-red-600 hover:text-red-600 text-xs">×</button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input value={optInput} onChange={e => setOptInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && optInput.trim()) { setOptions(p => [...p, optInput.trim()]); setOptInput('') } }}
              placeholder='Add option, press Enter'
              className="flex-1 bg-gray-200 border border-gray-300 rounded px-2 py-1 text-xs text-gray-900 focus:outline-none" />
            <button type="button" onClick={() => { if (optInput.trim()) { setOptions(p => [...p, optInput.trim()]); setOptInput('') } }}
              className="bg-gray-300 hover:bg-gray-500 text-gray-900 px-2 py-1 rounded text-xs">Add</button>
          </div>
        </div>
      )}
      <div className="flex gap-2 pt-1">
        <button onClick={handleSave} disabled={saving || !label.trim() || !key.trim()}
          className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold px-4 py-1.5 rounded text-sm">
          {saving ? 'Saving...' : initial ? 'Save Changes' : 'Add Field'}
        </button>
        <button onClick={onCancel} className="text-gray-500 hover:text-gray-900 text-sm px-3">Cancel</button>
      </div>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function ProjectTypesPage() {
  const [allFields, setAllFields] = useState<ProjectTypeField[]>([])
  const [selectedType, setSelectedType] = useState<PTKey>('dining_table')
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<string | null>(null)

  // Custom project types
  const [customTypes, setCustomTypes] = useState<CustomProjectType[]>([])
  const [showNewType, setShowNewType] = useState(false)
  const [newTypeName, setNewTypeName] = useState('')
  const [savingNewType, setSavingNewType] = useState(false)

  useEffect(() => {
    Promise.all([
      getAllProjectTypeFields(),
      getCustomProjectTypes().catch(() => [] as CustomProjectType[]),
    ]).then(([f, ct]) => { setAllFields(f); setCustomTypes(ct) }).catch(console.error).finally(() => setLoading(false))
  }, [])

  const fieldsForType = allFields.filter(f => f.project_type === selectedType).sort((a, b) => a.sequence_order - b.sequence_order)

  function handleSaved(f: ProjectTypeField) {
    setAllFields(prev => {
      const exists = prev.find(x => x.id === f.id)
      return exists ? prev.map(x => x.id === f.id ? f : x) : [...prev, f]
    })
    setShowAdd(false)
    setEditingId(null)
  }

  async function handleDelete(id: string) {
    await deleteProjectTypeField(id).catch(console.error)
    setAllFields(prev => prev.filter(f => f.id !== id))
  }

  async function handleToggleActive(f: ProjectTypeField) {
    const updated = await updateProjectTypeField(f.id, { is_active: !f.is_active }).catch(() => f)
    setAllFields(prev => prev.map(x => x.id === updated.id ? updated : x))
  }

  async function handleDrop(targetId: string) {
    if (!dragId || dragId === targetId) { setDragId(null); setDragOver(null); return }
    const list = [...fieldsForType]
    const fromIdx = list.findIndex(f => f.id === dragId)
    const toIdx = list.findIndex(f => f.id === targetId)
    const [moved] = list.splice(fromIdx, 1)
    list.splice(toIdx, 0, moved)
    const updated = list.map((f, i) => ({ ...f, sequence_order: i + 1 }))
    setAllFields(prev => {
      const others = prev.filter(f => f.project_type !== selectedType)
      return [...others, ...updated]
    })
    await reorderProjectTypeFields(selectedType, updated.map(f => f.id))
    setDragId(null); setDragOver(null)
  }

  function slugifyType(name: string) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
  }

  async function handleCreateCustomType(e: React.FormEvent) {
    e.preventDefault()
    if (!newTypeName.trim()) return
    setSavingNewType(true)
    try {
      const ct = await createCustomProjectType({ name: newTypeName.trim(), key: slugifyType(newTypeName.trim()) })
      setCustomTypes(prev => [...prev, ct])
      setNewTypeName('')
      setShowNewType(false)
    } finally { setSavingNewType(false) }
  }

  async function handleDeleteCustomType(id: string) {
    await deleteCustomProjectType(id).catch(console.error)
    setCustomTypes(prev => prev.filter(ct => ct.id !== id))
  }

  async function handleToggleCustomType(ct: CustomProjectType) {
    const updated = await updateCustomProjectType(ct.id, { is_active: !ct.is_active }).catch(() => ct)
    setCustomTypes(prev => prev.map(x => x.id === updated.id ? updated : x))
  }

  if (loading) return <div className="text-center py-8 text-gray-500">Loading...</div>

  return (
    <div className="flex gap-6">
      {/* Sidebar */}
      <div className="w-48 shrink-0">
        <div className="flex items-center gap-2 mb-4">
          <Link href="/dashboard/settings/pricing" className="text-gray-500 hover:text-gray-700 text-xs">← Pricing</Link>
        </div>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Project Types</h2>
        <div className="space-y-0.5">
          {PROJECT_TYPES.map(pt => {
            const count = allFields.filter(f => f.project_type === pt).length
            return (
              <button
                key={pt}
                onClick={() => { setSelectedType(pt); setShowAdd(false); setEditingId(null) }}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center justify-between ${
                  selectedType === pt ? 'bg-blue-600 text-white font-semibold' : 'text-gray-500 hover:text-gray-900 hover:bg-blue-50'
                }`}
              >
                {PT_LABELS[pt]}
                <span className={`text-[10px] ${selectedType === pt ? 'text-gray-700' : 'text-gray-400'}`}>{count}</span>
              </button>
            )
          })}
        </div>

        {customTypes.length > 0 && (
          <div className="mt-3">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1 px-1">Custom Types</p>
            <div className="space-y-0.5">
              {customTypes.map(ct => (
                <div key={ct.id} className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm ${!ct.is_active ? 'opacity-40' : ''}`}>
                  <span className="text-gray-700 truncate flex-1">{ct.name}</span>
                  <div className="flex gap-1 ml-1">
                    <button onClick={() => handleToggleCustomType(ct)}
                      className={`text-[9px] px-1 py-0.5 rounded font-semibold ${ct.is_active ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-200 text-gray-500'}`}>
                      {ct.is_active ? 'On' : 'Off'}
                    </button>
                    <button onClick={() => handleDeleteCustomType(ct.id)}
                      className="text-[9px] text-red-600 hover:text-red-600">×</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-3">
          {showNewType ? (
            <form onSubmit={handleCreateCustomType} className="space-y-2">
              <input
                required
                placeholder="Type name (e.g. Murphy Bed)"
                value={newTypeName}
                onChange={e => setNewTypeName(e.target.value)}
                className="w-full bg-gray-100 border border-gray-300 rounded-lg px-2 py-1.5 text-xs text-gray-900 focus:outline-none"
              />
              <div className="flex gap-1.5">
                <button type="submit" disabled={savingNewType || !newTypeName.trim()}
                  className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold text-xs py-1.5 rounded-lg">
                  {savingNewType ? '...' : 'Add'}
                </button>
                <button type="button" onClick={() => { setShowNewType(false); setNewTypeName('') }}
                  className="text-gray-500 hover:text-gray-900 text-xs px-2">Cancel</button>
              </div>
            </form>
          ) : (
            <button
              onClick={() => setShowNewType(true)}
              className="w-full text-left text-xs text-blue-600 hover:text-blue-500 px-1 py-1"
            >
              + New Project Type
            </button>
          )}
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-gray-900">{PT_LABELS[selectedType]} Fields</h1>
          <button onClick={() => { setShowAdd(true); setEditingId(null) }}
            className="bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm px-4 py-2 rounded-lg">
            + Add Field
          </button>
        </div>

        {showAdd && (
          <FieldEditor
            projectType={selectedType}
            onSave={handleSaved}
            onCancel={() => setShowAdd(false)}
          />
        )}

        <div className="space-y-2 mt-3">
          {fieldsForType.map(field => (
            <div key={field.id}>
              {editingId === field.id ? (
                <FieldEditor
                  initial={field}
                  projectType={selectedType}
                  onSave={handleSaved}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <div
                  draggable
                  onDragStart={() => setDragId(field.id)}
                  onDragOver={e => { e.preventDefault(); setDragOver(field.id) }}
                  onDrop={() => handleDrop(field.id)}
                  onDragEnd={() => { setDragId(null); setDragOver(null) }}
                  className={`bg-white shadow-sm border rounded-xl px-4 py-3 flex items-center gap-3 transition-colors ${
                    dragOver === field.id ? 'border-blue-400' : 'border-gray-200'
                  } ${dragId === field.id ? 'opacity-50' : ''} ${!field.is_active ? 'opacity-50' : ''}`}
                >
                  <span className="text-gray-400 cursor-grab select-none">⠿</span>
                  <span className="text-gray-500 text-xs w-5 text-right shrink-0">{field.sequence_order}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{field.field_label}</p>
                    <p className="text-[10px] text-gray-400 font-mono">{field.field_key}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-semibold bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded uppercase">{field.field_type.replace('_', '/')}</span>
                    {field.affects_price && <span className="text-[10px] font-semibold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">$ Price</span>}
                    <button onClick={() => handleToggleActive(field)} className={`text-[10px] px-1.5 py-0.5 rounded font-semibold transition-colors ${field.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-500'}`}>
                      {field.is_active ? 'Active' : 'Off'}
                    </button>
                    <button onClick={() => setEditingId(field.id)} className="text-xs text-gray-500 hover:text-gray-900">Edit</button>
                    <button onClick={() => handleDelete(field.id)} className="text-xs text-red-600 hover:text-red-600">Delete</button>
                  </div>
                </div>
              )}
            </div>
          ))}
          {fieldsForType.length === 0 && !showAdd && (
            <div className="text-center py-8 text-gray-400 text-sm">No fields for {PT_LABELS[selectedType]} yet. Click "+ Add Field" to create one.</div>
          )}
        </div>
      </div>
    </div>
  )
}
