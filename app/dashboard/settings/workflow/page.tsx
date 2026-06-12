'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  getAllWorkflowStatuses,
  getAllWorkflowTasksByStatusId,
  getWorkflowTaskCounts,
  addWorkflowStatus,
  updateWorkflowStatus,
  deleteWorkflowStatus,
  reorderWorkflowStatuses,
  addWorkflowTask,
  updateWorkflowTask,
  deleteWorkflowTask,
  reorderWorkflowTasks,
} from '@/lib/api/supabase-client'
import type { WorkflowStatus, WorkflowTask, TaskOwner } from '@/lib/core/types'

const PRESET_COLORS = ['#2E86AB', '#8E44AD', '#F39C12', '#27AE60', '#E67E22', '#E74C3C', '#16A085', '#2ECC71']

// ── Status form (add / edit) ────────────────────────────────────────────────

function StatusForm({
  initial, onSave, onCancel,
}: {
  initial?: WorkflowStatus
  onSave: (values: { name: string; description: string; color: string }) => Promise<void>
  onCancel: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [color, setColor] = useState(initial?.color ?? PRESET_COLORS[0])
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    try {
      await onSave({ name: name.trim(), description: description.trim(), color })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2">
      <input value={name} onChange={e => setName(e.target.value)} required autoFocus placeholder="Status name"
        className="w-full bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500" />
      <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Description (optional)"
        className="w-full bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500" />
      <div className="flex items-center gap-1.5">
        {PRESET_COLORS.map(c => (
          <button key={c} type="button" onClick={() => setColor(c)}
            className={`w-6 h-6 rounded-full border-2 transition-transform ${color === c ? 'border-gray-900 scale-110' : 'border-transparent'}`}
            style={{ backgroundColor: c }} title={c} />
        ))}
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={saving || !name.trim()}
          className="text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold px-3 py-1.5 rounded-lg">
          {saving ? 'Saving...' : 'Save'}
        </button>
        <button type="button" onClick={onCancel} className="text-xs text-gray-500 hover:text-gray-900 px-2">Cancel</button>
      </div>
    </form>
  )
}

// ── Task form (add / edit) ──────────────────────────────────────────────────

function TaskForm({
  initial, onSave, onCancel,
}: {
  initial?: WorkflowTask
  onSave: (values: { task_name: string; is_mandatory: boolean; owned_by: TaskOwner; has_print_action: boolean; print_label: string | null }) => Promise<void>
  onCancel: () => void
}) {
  const [taskName, setTaskName] = useState(initial?.task_name ?? '')
  const [mandatory, setMandatory] = useState(initial?.is_mandatory ?? true)
  const [ownedBy, setOwnedBy] = useState<TaskOwner>(initial?.owned_by ?? 'shop')
  const [hasPrint, setHasPrint] = useState(initial?.has_print_action ?? false)
  const [printLabel, setPrintLabel] = useState(initial?.print_label ?? '')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!taskName.trim()) return
    setSaving(true)
    try {
      await onSave({
        task_name: taskName.trim(),
        is_mandatory: mandatory,
        owned_by: ownedBy,
        has_print_action: hasPrint,
        print_label: hasPrint && printLabel.trim() ? printLabel.trim() : null,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2">
      <input value={taskName} onChange={e => setTaskName(e.target.value)} required autoFocus placeholder="Task name"
        className="w-full bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500" />
      <div className="flex items-center gap-4 flex-wrap">
        <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
          <input type="checkbox" checked={mandatory} onChange={e => setMandatory(e.target.checked)}
            className="w-3.5 h-3.5 accent-blue-600" />
          Mandatory
        </label>
        <select value={ownedBy} onChange={e => setOwnedBy(e.target.value as TaskOwner)}
          className="bg-gray-100 border border-gray-300 rounded-lg px-2 py-1.5 text-xs text-gray-900 focus:outline-none">
          <option value="sales">Sales</option>
          <option value="shop">Shop</option>
        </select>
        <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
          <input type="checkbox" checked={hasPrint} onChange={e => setHasPrint(e.target.checked)}
            className="w-3.5 h-3.5 accent-blue-600" />
          🖨 Print action
        </label>
      </div>
      {hasPrint && (
        <input value={printLabel} onChange={e => setPrintLabel(e.target.value)}
          placeholder='Print label description, e.g. "Print color label for paint shop"'
          className="w-full bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500" />
      )}
      <div className="flex gap-2">
        <button type="submit" disabled={saving || !taskName.trim()}
          className="text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold px-3 py-1.5 rounded-lg">
          {saving ? 'Saving...' : 'Save'}
        </button>
        <button type="button" onClick={onCancel} className="text-xs text-gray-500 hover:text-gray-900 px-2">Cancel</button>
      </div>
    </form>
  )
}

// ── Workflow Settings Page ──────────────────────────────────────────────────

export default function WorkflowSettingsPage() {
  const [statuses, setStatuses] = useState<WorkflowStatus[]>([])
  const [taskCounts, setTaskCounts] = useState<Record<string, number>>({})
  const [selectedStatusId, setSelectedStatusId] = useState<string | null>(null)
  const [tasks, setTasks] = useState<WorkflowTask[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingTasks, setLoadingTasks] = useState(false)

  const [editingStatusId, setEditingStatusId] = useState<string | null>(null)
  const [showAddStatus, setShowAddStatus] = useState(false)
  const [deletingStatus, setDeletingStatus] = useState<WorkflowStatus | null>(null)

  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
  const [showAddTask, setShowAddTask] = useState(false)

  // Drag state
  const dragStatusId = useRef<string | null>(null)
  const dragTaskId = useRef<string | null>(null)
  const [dragOverStatusId, setDragOverStatusId] = useState<string | null>(null)
  const [dragOverTaskId, setDragOverTaskId] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([getAllWorkflowStatuses(), getWorkflowTaskCounts().catch(() => ({}))])
      .then(([sts, counts]) => {
        setStatuses(sts)
        setTaskCounts(counts)
        if (sts.length > 0) setSelectedStatusId(sts[0].id)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!selectedStatusId) { setTasks([]); return }
    setLoadingTasks(true)
    getAllWorkflowTasksByStatusId(selectedStatusId)
      .then(setTasks)
      .catch(console.error)
      .finally(() => setLoadingTasks(false))
  }, [selectedStatusId])

  const selectedStatus = statuses.find(s => s.id === selectedStatusId) ?? null

  // ── Status handlers ──────────────────────────────────────────────────────

  async function handleStatusDrop(toId: string) {
    const fromId = dragStatusId.current
    setDragOverStatusId(null)
    if (!fromId || fromId === toId) return
    const fromIdx = statuses.findIndex(s => s.id === fromId)
    const toIdx = statuses.findIndex(s => s.id === toId)
    if (fromIdx === -1 || toIdx === -1) return
    const reordered = [...statuses]
    const [moved] = reordered.splice(fromIdx, 1)
    reordered.splice(toIdx, 0, moved)
    setStatuses(reordered.map((s, i) => ({ ...s, sequence_order: i + 1 })))
    await reorderWorkflowStatuses(reordered.map(s => s.id)).catch(console.error)
  }

  async function handleToggleStatusActive(s: WorkflowStatus) {
    const updated = await updateWorkflowStatus(s.id, { is_active: !s.is_active })
    setStatuses(prev => prev.map(x => x.id === s.id ? updated : x))
  }

  async function handleDeleteStatus(s: WorkflowStatus) {
    await deleteWorkflowStatus(s.id)
    setStatuses(prev => prev.filter(x => x.id !== s.id))
    if (selectedStatusId === s.id) setSelectedStatusId(null)
    setDeletingStatus(null)
  }

  // ── Task handlers ────────────────────────────────────────────────────────

  async function handleTaskDrop(toId: string) {
    const fromId = dragTaskId.current
    setDragOverTaskId(null)
    if (!fromId || fromId === toId) return
    const fromIdx = tasks.findIndex(t => t.id === fromId)
    const toIdx = tasks.findIndex(t => t.id === toId)
    if (fromIdx === -1 || toIdx === -1) return
    const reordered = [...tasks]
    const [moved] = reordered.splice(fromIdx, 1)
    reordered.splice(toIdx, 0, moved)
    setTasks(reordered.map((t, i) => ({ ...t, sequence_order: i + 1 })))
    await reorderWorkflowTasks(reordered.map(t => t.id)).catch(console.error)
  }

  async function handleToggleMandatory(t: WorkflowTask) {
    const updated = await updateWorkflowTask(t.id, { is_mandatory: !t.is_mandatory })
    setTasks(prev => prev.map(x => x.id === t.id ? updated : x))
  }

  async function handleDeleteTask(t: WorkflowTask) {
    await deleteWorkflowTask(t.id)
    setTasks(prev => prev.filter(x => x.id !== t.id))
    setTaskCounts(prev => ({ ...prev, [t.status_id]: Math.max(0, (prev[t.status_id] ?? 1) - 1) }))
  }

  if (loading) return <div className="text-center py-8 text-gray-500">Loading workflow config...</div>

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/dashboard/settings" className="text-gray-500 hover:text-gray-700 text-sm">← Settings</Link>
        <h1 className="text-xl font-bold">⚙️ Workflow</h1>
        <span className="text-sm text-gray-500">Define project statuses and tasks</span>
      </div>

      <div className="flex gap-5 items-start">
        {/* ── LEFT PANEL: Status Pipeline (35%) ── */}
        <div className="w-[35%] shrink-0 space-y-3">
          <p className="text-xs text-gray-500 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
            Drag to reorder. Changes apply to new projects only.
          </p>

          <div className="space-y-1.5">
            {statuses.map(s => (
              <div key={s.id}>
                <div
                  draggable
                  onDragStart={() => { dragStatusId.current = s.id }}
                  onDragOver={e => { e.preventDefault(); setDragOverStatusId(s.id) }}
                  onDrop={e => { e.preventDefault(); handleStatusDrop(s.id) }}
                  onDragEnd={() => { dragStatusId.current = null; setDragOverStatusId(null) }}
                  onClick={() => setSelectedStatusId(s.id)}
                  className={`flex items-center gap-2 bg-white shadow-sm border rounded-lg px-3 py-2.5 cursor-pointer transition-colors ${
                    dragOverStatusId === s.id ? 'border-blue-400 ring-1 ring-blue-500/50' :
                    selectedStatusId === s.id ? 'border-blue-400' : 'border-gray-200 hover:border-gray-300'
                  } ${!s.is_active ? 'opacity-50' : ''}`}
                >
                  <span className="text-gray-400 cursor-grab active:cursor-grabbing shrink-0" title="Drag to reorder">⋮⋮</span>
                  <span className="text-xs text-gray-400 w-4 shrink-0">{s.sequence_order}</span>
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: s.color ?? '#6B7280' }} />
                  <span className="text-sm font-medium text-gray-900 flex-1 min-w-0 truncate">{s.name}</span>
                  <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-full shrink-0">
                    {taskCounts[s.id] ?? 0} tasks
                  </span>
                  <button
                    onClick={e => { e.stopPropagation(); handleToggleStatusActive(s) }}
                    title={s.is_active ? 'Active — click to deactivate' : 'Inactive — click to activate'}
                    className={`w-7 h-4 rounded-full relative transition-colors shrink-0 ${s.is_active ? 'bg-emerald-500' : 'bg-gray-300'}`}
                  >
                    <span className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${s.is_active ? 'left-3.5' : 'left-0.5'}`} />
                  </button>
                  <button onClick={e => { e.stopPropagation(); setEditingStatusId(editingStatusId === s.id ? null : s.id) }}
                    className="text-xs text-gray-500 hover:text-blue-600 shrink-0">Edit</button>
                  <button onClick={e => { e.stopPropagation(); setDeletingStatus(s) }}
                    className="text-xs text-red-500 hover:text-red-600 shrink-0">×</button>
                </div>
                {editingStatusId === s.id && (
                  <div className="mt-1.5">
                    <StatusForm
                      initial={s}
                      onSave={async values => {
                        const updated = await updateWorkflowStatus(s.id, values)
                        setStatuses(prev => prev.map(x => x.id === s.id ? updated : x))
                        setEditingStatusId(null)
                      }}
                      onCancel={() => setEditingStatusId(null)}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>

          {showAddStatus ? (
            <StatusForm
              onSave={async values => {
                const created = await addWorkflowStatus({
                  ...values,
                  sequence_order: (statuses.reduce((m, s) => Math.max(m, s.sequence_order), 0)) + 1,
                  is_active: true,
                })
                setStatuses(prev => [...prev, created])
                setShowAddStatus(false)
              }}
              onCancel={() => setShowAddStatus(false)}
            />
          ) : (
            <button onClick={() => setShowAddStatus(true)}
              className="w-full text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2 rounded-lg border border-dashed border-gray-300">
              + Add Status
            </button>
          )}
        </div>

        {/* ── RIGHT PANEL: Tasks for selected status (65%) ── */}
        <div className="flex-1 min-w-0">
          {!selectedStatus ? (
            <div className="bg-white shadow-sm border border-gray-200 rounded-xl p-8 text-center text-gray-500 text-sm">
              Select a status on the left to manage its tasks.
            </div>
          ) : (
            <div className="bg-white shadow-sm border border-gray-200 rounded-xl p-5 space-y-4">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: selectedStatus.color ?? '#6B7280' }} />
                <h2 className="font-bold text-gray-900">{selectedStatus.name} Tasks</h2>
              </div>

              {loadingTasks ? (
                <p className="text-sm text-gray-400">Loading tasks...</p>
              ) : tasks.length === 0 ? (
                <p className="text-sm text-gray-400">
                  No tasks for this status — projects sit here until manually advanced.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {tasks.map(t => (
                    <div key={t.id}>
                      <div
                        draggable
                        onDragStart={() => { dragTaskId.current = t.id }}
                        onDragOver={e => { e.preventDefault(); setDragOverTaskId(t.id) }}
                        onDrop={e => { e.preventDefault(); handleTaskDrop(t.id) }}
                        onDragEnd={() => { dragTaskId.current = null; setDragOverTaskId(null) }}
                        className={`flex items-center gap-2.5 border rounded-lg px-3 py-2.5 transition-colors ${
                          dragOverTaskId === t.id ? 'border-blue-400 ring-1 ring-blue-500/50' : 'border-gray-200'
                        } ${!t.is_active ? 'opacity-50' : ''}`}
                      >
                        <span className="text-gray-400 cursor-grab active:cursor-grabbing shrink-0" title="Drag to reorder">⋮⋮</span>
                        <span className="text-sm text-gray-900 flex-1 min-w-0 truncate">{t.task_name}</span>
                        <button
                          onClick={() => handleToggleMandatory(t)}
                          title="Click to toggle mandatory / optional"
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded uppercase shrink-0 transition-colors ${
                            t.is_mandatory
                              ? 'bg-red-100 text-red-700 hover:bg-red-200'
                              : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                          }`}
                        >
                          {t.is_mandatory ? 'Mandatory' : 'Optional'}
                        </button>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded uppercase shrink-0 ${
                          t.owned_by === 'sales' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
                        }`}>{t.owned_by}</span>
                        {t.has_print_action && <span title={t.print_label ?? 'Print action'} className="shrink-0">🖨</span>}
                        <button onClick={() => setEditingTaskId(editingTaskId === t.id ? null : t.id)}
                          className="text-xs text-gray-500 hover:text-blue-600 shrink-0">Edit</button>
                        <button onClick={() => handleDeleteTask(t)}
                          className="text-xs text-red-500 hover:text-red-600 shrink-0">Delete</button>
                      </div>
                      {editingTaskId === t.id && (
                        <div className="mt-1.5">
                          <TaskForm
                            initial={t}
                            onSave={async values => {
                              const updated = await updateWorkflowTask(t.id, values)
                              setTasks(prev => prev.map(x => x.id === t.id ? updated : x))
                              setEditingTaskId(null)
                            }}
                            onCancel={() => setEditingTaskId(null)}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {showAddTask ? (
                <TaskForm
                  onSave={async values => {
                    const created = await addWorkflowTask({
                      ...values,
                      status_id: selectedStatus.id,
                      sequence_order: (tasks.reduce((m, t) => Math.max(m, t.sequence_order), 0)) + 1,
                      is_active: true,
                    })
                    setTasks(prev => [...prev, created])
                    setTaskCounts(prev => ({ ...prev, [selectedStatus.id]: (prev[selectedStatus.id] ?? 0) + 1 }))
                    setShowAddTask(false)
                  }}
                  onCancel={() => setShowAddTask(false)}
                />
              ) : (
                <button onClick={() => setShowAddTask(true)}
                  className="text-sm bg-blue-600 hover:bg-blue-500 text-white font-semibold px-4 py-2 rounded-lg">
                  + Add Task
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Delete status confirmation */}
      {deletingStatus && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) setDeletingStatus(null) }}>
          <div className="bg-white border border-gray-200 rounded-xl w-full max-w-sm p-5 space-y-4 shadow-2xl">
            <h3 className="font-semibold text-gray-900">Delete &ldquo;{deletingStatus.name}&rdquo;?</h3>
            <p className="text-sm text-red-600">
              This will affect all projects using this status. Its tasks will also be deleted.
            </p>
            <div className="flex gap-3">
              <button onClick={() => handleDeleteStatus(deletingStatus)}
                className="flex-1 bg-red-700 hover:bg-red-600 text-white font-semibold py-2 rounded-lg text-sm">
                Delete Status
              </button>
              <button onClick={() => setDeletingStatus(null)}
                className="px-4 py-2 text-sm text-gray-500 hover:text-gray-900">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
