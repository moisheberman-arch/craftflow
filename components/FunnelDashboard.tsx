'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  getAllOpenProjectTasks,
  backfillProjectWorkflows,
  completeTask,
  advanceProjectStatus,
  addAdhocTask,
} from '@/lib/api/supabase-client'
import type { ProjectFunnelEntry, ProjectTask, TaskOwner } from '@/lib/core/types'

const STUCK_DAYS = 3

function statusBadgeStyle(color: string | null | undefined) {
  return { backgroundColor: color ?? '#6B7280' }
}

function projectLabel(e: ProjectFunnelEntry): string {
  const name = e.project?.customer?.name ?? 'No customer'
  const type = e.project?.project_type?.replace(/_/g, ' ')
  return type ? `${name} — ${type}` : name
}

// ── Override warning modal ──────────────────────────────────────────────────

function OverrideModal({
  entry, incompleteTasks, onConfirm, onClose,
}: {
  entry: ProjectFunnelEntry
  incompleteTasks: ProjectTask[]
  onConfirm: (reason: string) => Promise<void>
  onClose: () => void
}) {
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleConfirm() {
    if (!reason.trim()) return
    setSaving(true)
    try {
      await onConfirm(reason.trim())
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white border border-gray-200 rounded-xl w-full max-w-md p-5 space-y-4 shadow-2xl">
        <h3 className="font-semibold text-gray-900">Advance with Override?</h3>
        <p className="text-sm text-orange-600">
          {incompleteTasks.length} mandatory {incompleteTasks.length === 1 ? 'task is' : 'tasks are'} still
          incomplete. Are you sure you want to advance? This will be logged as an override.
        </p>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-1">
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">{projectLabel(entry)}</p>
          {incompleteTasks.map(t => (
            <p key={t.id} className="text-xs text-gray-700">· {t.task_name} <span className="text-gray-400">({t.owned_by})</span></p>
          ))}
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Reason for override *</label>
          <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} required
            placeholder="Why is this advancing despite incomplete tasks?"
            className="w-full bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none" />
        </div>
        <div className="flex gap-3">
          <button onClick={handleConfirm} disabled={saving || !reason.trim()}
            className="flex-1 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-semibold py-2 rounded-lg text-sm">
            {saving ? 'Advancing...' : 'Confirm Override'}
          </button>
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-900">Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ── Single funnel project card ──────────────────────────────────────────────

function FunnelCard({
  entry, ownedBy, stuck, onTaskCompleted, onAdvance, onAdhocAdded,
}: {
  entry: ProjectFunnelEntry
  ownedBy: TaskOwner
  stuck: boolean
  onTaskCompleted: (entry: ProjectFunnelEntry, task: ProjectTask) => void
  onAdvance: (entry: ProjectFunnelEntry) => void
  onAdhocAdded: () => void
}) {
  const [completingId, setCompletingId] = useState<string | null>(null)
  const [showAddTask, setShowAddTask] = useState(false)
  const [newTaskName, setNewTaskName] = useState('')
  const [newTaskOwner, setNewTaskOwner] = useState<TaskOwner>(ownedBy)
  const [newTaskMandatory, setNewTaskMandatory] = useState(false)
  const [addingTask, setAddingTask] = useState(false)
  const [advancing, setAdvancing] = useState(false)

  const status = entry.workflow.current_status
  const allMandatoryDone = entry.openMandatoryAll === 0
  const view = ownedBy === 'shop' ? 'shop' : 'sales'

  async function handleComplete(task: ProjectTask) {
    setCompletingId(task.id)
    try {
      await completeTask(task.id)
      onTaskCompleted(entry, task)
    } finally {
      setCompletingId(null)
    }
  }

  async function handleAddAdhoc(e: React.FormEvent) {
    e.preventDefault()
    if (!newTaskName.trim()) return
    setAddingTask(true)
    try {
      await addAdhocTask(entry.project.id, entry.workflow.current_status_id, newTaskName.trim(), newTaskOwner, newTaskMandatory)
      setShowAddTask(false)
      setNewTaskName(''); setNewTaskOwner(ownedBy); setNewTaskMandatory(false)
      onAdhocAdded()
    } finally {
      setAddingTask(false)
    }
  }

  async function handleAdvanceClick() {
    setAdvancing(true)
    try {
      await onAdvance(entry)
    } finally {
      setAdvancing(false)
    }
  }

  return (
    <div className={`bg-white shadow-sm border rounded-xl p-4 space-y-3 ${stuck ? 'border-orange-300' : 'border-gray-200'}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <Link href={`/dashboard/projects/${entry.project.id}?view=${view}`}
          className="font-bold text-sm text-gray-900 hover:text-blue-600 capitalize min-w-0 truncate">
          {projectLabel(entry)}
        </Link>
        <span className="text-[10px] font-semibold text-white px-2 py-0.5 rounded-full shrink-0"
          style={statusBadgeStyle(status?.color)}>
          {status?.name ?? 'Unknown'}
        </span>
      </div>

      {stuck ? (
        <p className="text-xs font-semibold text-orange-600">⏱ Stuck {entry.daysInStatus} days</p>
      ) : (
        <p className="text-xs text-gray-400">{entry.daysInStatus}d in status</p>
      )}

      {/* Open tasks */}
      {entry.tasks.length > 0 && (
        <div className="space-y-1">
          {entry.tasks.map(task => (
            <div key={task.id} className="flex items-center gap-2 group">
              <input
                type="checkbox"
                checked={false}
                disabled={completingId === task.id}
                onChange={() => handleComplete(task)}
                className="w-3.5 h-3.5 rounded border-gray-300 bg-gray-100 accent-blue-600 cursor-pointer shrink-0"
              />
              <span className={`text-xs flex-1 min-w-0 ${completingId === task.id ? 'opacity-50' : ''} ${task.is_mandatory ? 'text-gray-900' : 'text-gray-500'}`}>
                {task.task_name}
              </span>
              {task.is_mandatory && (
                <span className="text-[9px] font-semibold bg-red-100 text-red-700 px-1 py-0.5 rounded uppercase shrink-0">Req</span>
              )}
              {task.has_print_action && (
                <Link href={`/dashboard/projects/${entry.project.id}/print-label`} target="_blank"
                  title={task.print_label ?? 'Print'}
                  className="text-xs shrink-0 hover:scale-110 transition-transform">🖨</Link>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Advance + add task */}
      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={handleAdvanceClick}
          disabled={advancing}
          className={`flex-1 text-xs font-semibold py-1.5 rounded-lg transition-colors disabled:opacity-50 ${
            allMandatoryDone
              ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
              : 'bg-gray-200 hover:bg-gray-300 text-gray-600'
          }`}
        >
          {advancing ? 'Advancing...' : 'Advance to Next Status →'}
        </button>
        <button onClick={() => setShowAddTask(v => !v)}
          className="text-xs text-blue-600 hover:text-blue-500 shrink-0 px-1.5">+ Add Task</button>
      </div>

      {showAddTask && (
        <form onSubmit={handleAddAdhoc} className="bg-gray-50 border border-gray-200 rounded-lg p-2.5 space-y-2">
          <input value={newTaskName} onChange={e => setNewTaskName(e.target.value)} required autoFocus
            placeholder="Task name"
            className="w-full bg-gray-100 border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          <div className="flex items-center gap-3">
            <select value={newTaskOwner} onChange={e => setNewTaskOwner(e.target.value as TaskOwner)}
              className="bg-gray-100 border border-gray-300 rounded-lg px-2 py-1 text-xs text-gray-900 focus:outline-none">
              <option value="sales">Sales</option>
              <option value="shop">Shop</option>
            </select>
            <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
              <input type="checkbox" checked={newTaskMandatory} onChange={e => setNewTaskMandatory(e.target.checked)}
                className="w-3 h-3 accent-blue-600" />
              Mandatory
            </label>
            <span className="flex-1" />
            <button type="submit" disabled={addingTask || !newTaskName.trim()}
              className="text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold px-3 py-1 rounded-lg">
              {addingTask ? '...' : 'Save'}
            </button>
            <button type="button" onClick={() => setShowAddTask(false)}
              className="text-xs text-gray-500 hover:text-gray-900">Cancel</button>
          </div>
        </form>
      )}
    </div>
  )
}

// ── Funnel Dashboard ────────────────────────────────────────────────────────

export default function FunnelDashboard({ ownedBy, columns = 1 }: { ownedBy: TaskOwner; columns?: 1 | 2 }) {
  const [entries, setEntries] = useState<ProjectFunnelEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [overrideState, setOverrideState] = useState<{ entry: ProjectFunnelEntry; tasks: ProjectTask[] } | null>(null)

  const load = useCallback(async () => {
    // Backfill is idempotent — ensures pre-existing projects have workflow records
    await backfillProjectWorkflows().catch(() => {})
    const data = await getAllOpenProjectTasks(ownedBy)
    setEntries(data.filter(e => !!e.project))
  }, [ownedBy])

  useEffect(() => {
    load().catch(console.error).finally(() => setLoading(false))
  }, [load])

  async function handleAdvance(entry: ProjectFunnelEntry, reason?: string) {
    const result = await advanceProjectStatus(entry.project.id, reason)
    if (result.blocked && result.incompleteMandatoryTasks.length > 0) {
      setOverrideState({ entry, tasks: result.incompleteMandatoryTasks })
      return
    }
    setOverrideState(null)
    await load().catch(console.error)
  }

  function handleTaskCompleted(entry: ProjectFunnelEntry, task: ProjectTask) {
    setEntries(prev => prev.map(e =>
      e.workflow.id === entry.workflow.id
        ? {
            ...e,
            tasks: e.tasks.filter(t => t.id !== task.id),
            openMandatoryAll: task.is_mandatory ? Math.max(0, e.openMandatoryAll - 1) : e.openMandatoryAll,
          }
        : e
    ))
  }

  if (loading) {
    return <p className="text-xs text-gray-400 py-2">Loading funnel...</p>
  }

  const seq = (e: ProjectFunnelEntry) => e.workflow.current_status?.sequence_order ?? 0
  // Delivered projects never appear in the funnel
  const active = entries.filter(e => seq(e) !== 8)
  // Passive holding statuses with nothing to do → simple indicator cards
  const indicators = active.filter(e => (seq(e) === 4 || seq(e) === 6) && e.tasks.length === 0)
  const actionable = active.filter(e => !indicators.includes(e))
  const needsAttention = actionable.filter(
    e => e.daysInStatus > STUCK_DAYS && e.tasks.some(t => t.is_mandatory)
  )
  const inProgress = actionable.filter(e => !needsAttention.includes(e) && e.tasks.length > 0)

  const gridClass = columns === 2 ? 'grid grid-cols-1 md:grid-cols-2 gap-3' : 'space-y-3'
  const view = ownedBy === 'shop' ? 'shop' : 'sales'

  return (
    <div className="space-y-5">
      {needsAttention.length === 0 && inProgress.length === 0 && indicators.length === 0 && (
        <p className="text-xs text-gray-400 py-2">No open {ownedBy} tasks — funnel is clear.</p>
      )}

      {/* Section 1 — Needs Attention */}
      {needsAttention.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <h3 className="text-sm font-bold text-red-600">🚩 Needs Attention</h3>
            <span className="text-xs bg-red-100 text-red-700 font-bold px-1.5 py-0.5 rounded-full">{needsAttention.length}</span>
          </div>
          <div className={gridClass}>
            {needsAttention.map(e => (
              <FunnelCard key={e.workflow.id} entry={e} ownedBy={ownedBy} stuck
                onTaskCompleted={handleTaskCompleted}
                onAdvance={entry => handleAdvance(entry)}
                onAdhocAdded={() => load().catch(console.error)} />
            ))}
          </div>
        </div>
      )}

      {/* Section 2 — In Progress */}
      {inProgress.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <h3 className="text-sm font-bold text-gray-800">In Progress</h3>
            <span className="text-xs bg-gray-100 text-gray-600 font-bold px-1.5 py-0.5 rounded-full">{inProgress.length}</span>
          </div>
          <div className={gridClass}>
            {inProgress.map(e => (
              <FunnelCard key={e.workflow.id} entry={e} ownedBy={ownedBy} stuck={false}
                onTaskCompleted={handleTaskCompleted}
                onAdvance={entry => handleAdvance(entry)}
                onAdhocAdded={() => load().catch(console.error)} />
            ))}
          </div>
        </div>
      )}

      {/* Passive statuses — simple indicators */}
      {indicators.length > 0 && (
        <div className="space-y-1.5">
          {indicators.map(e => (
            <Link key={e.workflow.id} href={`/dashboard/projects/${e.project.id}?view=${view}`}
              className="flex items-center gap-2 bg-white shadow-sm border border-gray-200 rounded-lg px-3 py-2 hover:border-blue-300 transition-colors">
              <span className="w-2 h-2 rounded-full shrink-0" style={statusBadgeStyle(e.workflow.current_status?.color)} />
              <span className="text-xs font-medium text-gray-900 truncate flex-1 capitalize">{projectLabel(e)}</span>
              <span className="text-[10px] text-gray-500 shrink-0">
                {e.workflow.current_status?.name} — Day {e.daysInStatus + 1}
              </span>
            </Link>
          ))}
        </div>
      )}

      {overrideState && (
        <OverrideModal
          entry={overrideState.entry}
          incompleteTasks={overrideState.tasks}
          onConfirm={reason => handleAdvance(overrideState.entry, reason)}
          onClose={() => setOverrideState(null)}
        />
      )}
    </div>
  )
}
