'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  getStepLibrary, addStepToLibrary, updateStepLibraryItem,
  deleteStepLibraryItem, reorderStepLibrary,
} from '@/lib/api/supabase-client'
import type { StepLibraryItem, StepType, WaitingOn } from '@/lib/core/types'

const WAITING_OPTIONS: WaitingOn[] = ['customer', 'supplier', 'designer', 'internal']

interface StepFormValue {
  step_name: string
  step_type: StepType
  waiting_on: WaitingOn | ''
  is_optional: boolean
  suggested_subtasks: string[]
}

function emptyForm(): StepFormValue {
  return { step_name: '', step_type: 'action', waiting_on: '', is_optional: false, suggested_subtasks: [] }
}

function StepForm({ initial, saving, onSave, onCancel }: {
  initial: StepFormValue
  saving: boolean
  onSave: (v: StepFormValue) => void
  onCancel: () => void
}) {
  const [v, setV] = useState<StepFormValue>(initial)
  const [newSubtask, setNewSubtask] = useState('')

  function addSubtaskItem() {
    if (!newSubtask.trim()) return
    setV(prev => ({ ...prev, suggested_subtasks: [...prev.suggested_subtasks, newSubtask.trim()] }))
    setNewSubtask('')
  }

  return (
    <div className="bg-gray-100/60 border border-gray-300 rounded-lg p-4 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <label className="block text-xs text-gray-500 mb-1">Step Name *</label>
          <input value={v.step_name} onChange={e => setV(prev => ({ ...prev, step_name: e.target.value }))}
            className="w-full bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Step Type</label>
          <select value={v.step_type}
            onChange={e => setV(prev => ({ ...prev, step_type: e.target.value as StepType, waiting_on: e.target.value === 'action' ? '' : prev.waiting_on }))}
            className="w-full bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none">
            <option value="action">Action</option>
            <option value="waiting">Waiting</option>
          </select>
        </div>
        {v.step_type === 'waiting' && (
          <div>
            <label className="block text-xs text-gray-500 mb-1">Waiting On</label>
            <select value={v.waiting_on} onChange={e => setV(prev => ({ ...prev, waiting_on: e.target.value as WaitingOn | '' }))}
              className="w-full bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none">
              <option value="">—</option>
              {WAITING_OPTIONS.map(w => <option key={w} value={w} className="capitalize">{w}</option>)}
            </select>
          </div>
        )}
        <div className="flex items-end pb-1">
          <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
            <input type="checkbox" checked={v.is_optional}
              onChange={e => setV(prev => ({ ...prev, is_optional: e.target.checked }))}
              className="accent-blue-600 w-4 h-4" />
            Optional step
          </label>
        </div>
      </div>

      {/* Suggested sub-tasks */}
      <div>
        <label className="block text-xs text-gray-500 mb-1">Suggested Sub-Tasks</label>
        {v.suggested_subtasks.length > 0 && (
          <div className="space-y-1 mb-2">
            {v.suggested_subtasks.map((st, i) => (
              <div key={i} className="flex items-center gap-2 text-sm text-gray-700 bg-gray-100 rounded px-2 py-1">
                <span className="flex-1">{st}</span>
                <button onClick={() => setV(prev => ({ ...prev, suggested_subtasks: prev.suggested_subtasks.filter((_, j) => j !== i) }))}
                  className="text-red-600 hover:text-red-600 text-xs">×</button>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <input placeholder="Add suggested sub-task..." value={newSubtask}
            onChange={e => setNewSubtask(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSubtaskItem() } }}
            className="flex-1 bg-gray-100 border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          <button onClick={addSubtaskItem} disabled={!newSubtask.trim()}
            className="text-xs bg-gray-200 hover:bg-gray-300 disabled:opacity-40 text-gray-900 px-3 rounded-lg">Add</button>
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <button onClick={() => onSave(v)} disabled={saving || !v.step_name.trim()}
          className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold px-4 py-2 rounded-lg text-sm">
          {saving ? 'Saving...' : 'Save Step'}
        </button>
        <button onClick={onCancel} className="text-gray-500 hover:text-gray-900 text-sm px-3">Cancel</button>
      </div>
    </div>
  )
}

export default function StepTemplatesPage() {
  const [steps, setSteps] = useState<StepLibraryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const dragId = useRef<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)

  useEffect(() => {
    getStepLibrary()
      .then(setSteps)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  async function handleDrop(toId: string) {
    const fromId = dragId.current
    setDragOverId(null)
    if (!fromId || fromId === toId) return
    const fromIdx = steps.findIndex(s => s.id === fromId)
    const toIdx = steps.findIndex(s => s.id === toId)
    if (fromIdx === -1 || toIdx === -1) return
    const reordered = [...steps]
    const [moved] = reordered.splice(fromIdx, 1)
    reordered.splice(toIdx, 0, moved)
    setSteps(reordered.map((s, i) => ({ ...s, sequence_order: i + 1 })))
    await reorderStepLibrary(reordered.map(s => s.id)).catch(console.error)
  }

  async function handleSaveEdit(id: string, v: { step_name: string; step_type: StepType; waiting_on: WaitingOn | ''; is_optional: boolean; suggested_subtasks: string[] }) {
    setSaving(true)
    try {
      const updated = await updateStepLibraryItem(id, {
        step_name: v.step_name.trim(),
        step_type: v.step_type,
        waiting_on: v.step_type === 'waiting' ? (v.waiting_on || null) : null,
        is_optional: v.is_optional,
        suggested_subtasks: v.suggested_subtasks,
      })
      setSteps(prev => prev.map(s => s.id === id ? updated : s))
      setEditingId(null)
    } finally { setSaving(false) }
  }

  async function handleAdd(v: { step_name: string; step_type: StepType; waiting_on: WaitingOn | ''; is_optional: boolean; suggested_subtasks: string[] }) {
    setSaving(true)
    try {
      const maxOrder = steps.reduce((m, s) => Math.max(m, s.sequence_order ?? 0), 0)
      const created = await addStepToLibrary({
        step_name: v.step_name.trim(),
        description: null,
        category: null,
        step_type: v.step_type,
        waiting_on: v.step_type === 'waiting' ? ((v.waiting_on || null) as WaitingOn | null) : null,
        is_optional: v.is_optional,
        sequence_order: maxOrder + 1,
        suggested_subtasks: v.suggested_subtasks,
      })
      setSteps(prev => [...prev, created])
      setShowAdd(false)
    } finally { setSaving(false) }
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    try {
      await deleteStepLibraryItem(id)
      setSteps(prev => prev.filter(s => s.id !== id))
      setConfirmDeleteId(null)
    } finally { setDeletingId(null) }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/shop" className="text-gray-500 hover:text-gray-700 text-sm">← Back</Link>
        <h1 className="text-xl font-bold text-gray-900">Step Templates</h1>
      </div>

      <div className="bg-blue-50/40 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-600">
        Changes to step templates apply to new projects only. Projects already in progress keep their existing steps.
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-500">Loading...</div>
      ) : (
        <div className="space-y-2">
          {steps.map((s, idx) => (
            <div key={s.id}>
              <div
                draggable
                onDragStart={() => { dragId.current = s.id }}
                onDragOver={e => { e.preventDefault(); setDragOverId(s.id) }}
                onDrop={e => { e.preventDefault(); handleDrop(s.id) }}
                onDragEnd={() => { dragId.current = null; setDragOverId(null) }}
                className={`bg-white shadow-sm border rounded-xl px-4 py-3 flex items-center gap-3 ${
                  dragOverId === s.id ? 'border-blue-400 ring-1 ring-blue-500/50' : 'border-gray-200'
                }`}
              >
                <span className="text-gray-400 cursor-grab active:cursor-grabbing text-base" title="Drag to reorder">⠿</span>
                <span className="text-gray-500 text-sm w-6 shrink-0">{idx + 1}</span>
                <span className="flex-1 text-sm text-gray-900 truncate">{s.step_name}</span>
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase shrink-0 ${
                  s.step_type === 'waiting' ? 'bg-orange-100 text-orange-700' : 'bg-emerald-100 text-emerald-700'
                }`}>{s.step_type === 'waiting' ? 'Waiting' : 'Action'}</span>
                {s.step_type === 'waiting' && s.waiting_on && (
                  <span className="text-[10px] text-orange-600 shrink-0 capitalize">({s.waiting_on})</span>
                )}
                {s.is_optional && (
                  <span className="text-[10px] bg-gray-200 text-gray-700 px-1.5 py-0.5 rounded shrink-0">Optional</span>
                )}
                {Array.isArray(s.suggested_subtasks) && s.suggested_subtasks.length > 0 && (
                  <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded shrink-0">
                    {s.suggested_subtasks.length} sub-task{s.suggested_subtasks.length === 1 ? '' : 's'}
                  </span>
                )}
                <button onClick={() => { setEditingId(editingId === s.id ? null : s.id); setShowAdd(false) }}
                  className="text-xs text-gray-500 hover:text-gray-900 shrink-0">Edit</button>
                <button onClick={() => setConfirmDeleteId(s.id)}
                  className="text-xs text-red-600 hover:text-red-600 shrink-0">Delete</button>
              </div>

              {editingId === s.id && (
                <div className="mt-2 ml-6">
                  <StepForm
                    initial={{
                      step_name: s.step_name,
                      step_type: s.step_type ?? 'action',
                      waiting_on: s.waiting_on ?? '',
                      is_optional: s.is_optional ?? false,
                      suggested_subtasks: Array.isArray(s.suggested_subtasks) ? s.suggested_subtasks : [],
                    }}
                    saving={saving}
                    onSave={v => handleSaveEdit(s.id, v)}
                    onCancel={() => setEditingId(null)}
                  />
                </div>
              )}
            </div>
          ))}

          {/* Add step */}
          {showAdd ? (
            <StepForm
              initial={emptyForm()}
              saving={saving}
              onSave={handleAdd}
              onCancel={() => setShowAdd(false)}
            />
          ) : (
            <button onClick={() => { setShowAdd(true); setEditingId(null) }}
              className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-4 py-2 rounded-lg text-sm">
              + Add Step
            </button>
          )}
        </div>
      )}

      {/* Delete confirmation */}
      {confirmDeleteId && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-white shadow-sm border border-gray-200 rounded-xl w-full max-w-sm p-6 space-y-4 shadow-2xl">
            <h3 className="font-semibold text-gray-900">Delete Step Template?</h3>
            <p className="text-sm text-gray-500">
              &ldquo;{steps.find(s => s.id === confirmDeleteId)?.step_name}&rdquo; will be removed from the default template.
              This will not affect projects already in progress.
            </p>
            <div className="flex gap-3">
              <button onClick={() => handleDelete(confirmDeleteId)} disabled={!!deletingId}
                className="flex-1 bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white font-semibold py-2 rounded-lg text-sm">
                {deletingId ? 'Deleting...' : 'Delete Step'}
              </button>
              <button onClick={() => setConfirmDeleteId(null)}
                className="px-4 py-2 text-sm text-gray-500 hover:text-gray-900">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
