'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  getProjectWorkflow,
  getProjectTasks,
  getProjectStatusHistory,
  getWorkflowStatuses,
  completeTask,
  uncompleteTask,
  advanceProjectStatus,
  rejectSketch,
  addAdhocTask,
} from '@/lib/api/supabase-client'
import type {
  ProjectWorkflow, ProjectTask, ProjectStatusHistory, WorkflowStatus, TaskOwner,
} from '@/lib/core/types'

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function daysIn(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
}

export default function WorkflowPanel({ projectId }: { projectId: string }) {
  const [workflow, setWorkflow] = useState<ProjectWorkflow | null>(null)
  const [tasks, setTasks] = useState<ProjectTask[]>([])
  const [history, setHistory] = useState<ProjectStatusHistory[]>([])
  const [statuses, setStatuses] = useState<WorkflowStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  // Advance / override
  const [advancing, setAdvancing] = useState(false)
  const [overrideTasks, setOverrideTasks] = useState<ProjectTask[] | null>(null)
  const [overrideReason, setOverrideReason] = useState('')

  // Adhoc task form
  const [showAddTask, setShowAddTask] = useState(false)
  const [newTaskName, setNewTaskName] = useState('')
  const [newTaskOwner, setNewTaskOwner] = useState<TaskOwner>('shop')
  const [newTaskMandatory, setNewTaskMandatory] = useState(false)
  const [addingTask, setAddingTask] = useState(false)

  // Rejection flow
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [rejecting, setRejecting] = useState(false)

  const load = useCallback(async () => {
    const [wf, hist, sts] = await Promise.all([
      getProjectWorkflow(projectId),
      getProjectStatusHistory(projectId).catch(() => [] as ProjectStatusHistory[]),
      getWorkflowStatuses().catch(() => [] as WorkflowStatus[]),
    ])
    setWorkflow(wf)
    setHistory(hist)
    setStatuses(sts)
    if (wf) {
      const t = await getProjectTasks(projectId, wf.current_status_id).catch(() => [] as ProjectTask[])
      setTasks(t)
    } else {
      setTasks([])
    }
  }, [projectId])

  useEffect(() => {
    load().catch(console.error).finally(() => setLoading(false))
  }, [load])

  if (loading) return null
  if (!workflow) {
    return (
      <div className="bg-white shadow-sm border border-gray-200 rounded-xl p-5">
        <h3 className="font-semibold text-sm text-gray-900 mb-1">Workflow</h3>
        <p className="text-xs text-gray-500">
          Workflow starts when the deposit is received. Set the project status to
          &ldquo;Deposit Received&rdquo; to begin tracking statuses and tasks.
        </p>
      </div>
    )
  }

  const status = workflow.current_status
  const days = daysIn(workflow.entered_current_status_at)
  const currentIdx = statuses.findIndex(s => s.id === workflow.current_status_id)
  const nextStatus = currentIdx >= 0 ? statuses[currentIdx + 1] : undefined
  const openMandatory = tasks.filter(t => !t.completed && t.is_mandatory)
  const salesTasks = tasks.filter(t => t.owned_by === 'sales')
  const shopTasks = tasks.filter(t => t.owned_by === 'shop')
  const latestRejection = history.find(h => h.rejection)
  const isAwaitingSketchApproval = status?.name === 'Waiting for Sketch Approval'

  async function handleToggle(task: ProjectTask) {
    setTogglingId(task.id)
    try {
      const updated = task.completed ? await uncompleteTask(task.id) : await completeTask(task.id)
      setTasks(prev => prev.map(t => t.id === task.id ? updated : t))
    } finally {
      setTogglingId(null)
    }
  }

  async function handleAdvance(reason?: string) {
    setAdvancing(true)
    try {
      const result = await advanceProjectStatus(projectId, reason)
      if (result.blocked && result.incompleteMandatoryTasks.length > 0) {
        setOverrideTasks(result.incompleteMandatoryTasks)
        return
      }
      setOverrideTasks(null)
      setOverrideReason('')
      await load()
    } finally {
      setAdvancing(false)
    }
  }

  async function handleAddAdhoc(e: React.FormEvent) {
    e.preventDefault()
    if (!newTaskName.trim() || !workflow) return
    setAddingTask(true)
    try {
      const created = await addAdhocTask(projectId, workflow.current_status_id, newTaskName.trim(), newTaskOwner, newTaskMandatory)
      setTasks(prev => [...prev, created])
      setShowAddTask(false)
      setNewTaskName(''); setNewTaskMandatory(false)
    } finally {
      setAddingTask(false)
    }
  }

  async function handleReject() {
    if (!rejectReason.trim()) return
    setRejecting(true)
    try {
      await rejectSketch(projectId, rejectReason.trim())
      setShowRejectModal(false)
      setRejectReason('')
      await load()
    } finally {
      setRejecting(false)
    }
  }

  function TaskRow({ task }: { task: ProjectTask }) {
    return (
      <div className="flex items-center gap-2 py-1">
        <input
          type="checkbox"
          checked={task.completed}
          disabled={togglingId === task.id}
          onChange={() => handleToggle(task)}
          className="w-4 h-4 rounded border-gray-300 bg-gray-100 accent-blue-600 cursor-pointer shrink-0"
        />
        <span className={`text-sm flex-1 min-w-0 ${task.completed ? 'line-through text-gray-400' : 'text-gray-900'} ${togglingId === task.id ? 'opacity-50' : ''}`}>
          {task.task_name}
          {task.is_adhoc && <span className="text-[9px] text-gray-400 ml-1">(adhoc)</span>}
        </span>
        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded uppercase shrink-0 ${
          task.is_mandatory ? 'bg-red-100 text-red-700' : 'bg-gray-200 text-gray-600'
        }`}>{task.is_mandatory ? 'Required' : 'Optional'}</span>
        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded uppercase shrink-0 ${
          task.owned_by === 'sales' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
        }`}>{task.owned_by}</span>
        {task.has_print_action && (
          <Link href={`/dashboard/projects/${projectId}/print-label`} target="_blank"
            title={task.print_label ?? 'Print'}
            className="text-sm shrink-0 hover:scale-110 transition-transform">🖨</Link>
        )}
      </div>
    )
  }

  return (
    <div className="bg-white shadow-sm border border-gray-200 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="font-semibold text-sm text-gray-900">Workflow</h3>
        {isAwaitingSketchApproval && (
          <button onClick={() => setShowRejectModal(true)}
            className="text-xs text-red-500 hover:text-red-600 transition-colors">
            Customer Rejected Sketch
          </button>
        )}
      </div>

      {/* Rejection banner */}
      {latestRejection && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600">
          ⚠ Sketch was rejected on {fmtDate(latestRejection.advanced_at)}. Delivery timeline has been affected.
          {latestRejection.rejection_reason && (
            <span className="block text-xs text-red-500 mt-0.5">Reason: {latestRejection.rejection_reason}</span>
          )}
        </div>
      )}

      {/* Current status */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-base font-bold text-white px-4 py-1.5 rounded-lg"
          style={{ backgroundColor: status?.color ?? '#6B7280' }}>
          {status?.name ?? 'Unknown'}
        </span>
        <span className="text-xs text-gray-500">
          {days === 0 ? 'Entered today' : `${days} ${days === 1 ? 'day' : 'days'} in this status`}
        </span>
      </div>

      {/* Tasks */}
      {tasks.length === 0 ? (
        <p className="text-xs text-gray-400">No tasks for this status.</p>
      ) : (
        <div className="space-y-3">
          {salesTasks.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-blue-600 uppercase tracking-wide mb-1">Sales Tasks</p>
              <div className="divide-y divide-gray-100">
                {salesTasks.map(t => <TaskRow key={t.id} task={t} />)}
              </div>
            </div>
          )}
          {shopTasks.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-amber-600 uppercase tracking-wide mb-1">Shop Tasks</p>
              <div className="divide-y divide-gray-100">
                {shopTasks.map(t => <TaskRow key={t.id} task={t} />)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add adhoc task */}
      {!showAddTask ? (
        <button onClick={() => setShowAddTask(true)} className="text-xs text-blue-600 hover:text-blue-500">
          + Add Task
        </button>
      ) : (
        <form onSubmit={handleAddAdhoc} className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2">
          <input value={newTaskName} onChange={e => setNewTaskName(e.target.value)} required autoFocus
            placeholder="Task name"
            className="w-full bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          <div className="flex items-center gap-3 flex-wrap">
            <select value={newTaskOwner} onChange={e => setNewTaskOwner(e.target.value as TaskOwner)}
              className="bg-gray-100 border border-gray-300 rounded-lg px-2 py-1.5 text-xs text-gray-900 focus:outline-none">
              <option value="sales">Sales</option>
              <option value="shop">Shop</option>
            </select>
            <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
              <input type="checkbox" checked={newTaskMandatory} onChange={e => setNewTaskMandatory(e.target.checked)}
                className="w-3.5 h-3.5 accent-blue-600" />
              Mandatory
            </label>
            <span className="flex-1" />
            <button type="submit" disabled={addingTask || !newTaskName.trim()}
              className="text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold px-3 py-1.5 rounded-lg">
              {addingTask ? 'Saving...' : 'Save Task'}
            </button>
            <button type="button" onClick={() => setShowAddTask(false)}
              className="text-xs text-gray-500 hover:text-gray-900">Cancel</button>
          </div>
        </form>
      )}

      {/* Advance */}
      {nextStatus && (
        <button
          onClick={() => handleAdvance()}
          disabled={advancing}
          className={`w-full text-sm font-semibold py-2 rounded-lg transition-colors disabled:opacity-50 ${
            openMandatory.length === 0
              ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
              : 'bg-gray-200 hover:bg-gray-300 text-gray-600'
          }`}
        >
          {advancing ? 'Advancing...' : `Advance to Next Status → ${nextStatus.name}`}
        </button>
      )}

      {/* Status history timeline */}
      {history.length > 0 && (
        <div className="pt-2 border-t border-gray-200">
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Status History</p>
          <div className="space-y-1">
            {history.map(h => (
              <div key={h.id} className="text-xs text-gray-600 flex items-start gap-2">
                <span className="text-gray-400 shrink-0 w-20">{fmtDate(h.advanced_at)}</span>
                <span className="min-w-0">
                  {h.from_status?.name ? `${h.from_status.name} → ` : ''}
                  <span className="font-medium text-gray-800">{h.to_status?.name ?? 'Unknown'}</span>
                  {h.rejection && (
                    <span className="text-red-600"> · Rejected{h.rejection_reason ? `: ${h.rejection_reason}` : ''}</span>
                  )}
                  {h.override_used && (
                    <span className="text-orange-600"> · Override{h.override_reason ? `: ${h.override_reason}` : ''}</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Override modal */}
      {overrideTasks && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) setOverrideTasks(null) }}>
          <div className="bg-white border border-gray-200 rounded-xl w-full max-w-md p-5 space-y-4 shadow-2xl">
            <h3 className="font-semibold text-gray-900">Advance with Override?</h3>
            <p className="text-sm text-orange-600">
              {overrideTasks.length} mandatory {overrideTasks.length === 1 ? 'task is' : 'tasks are'} still
              incomplete. Are you sure you want to advance? This will be logged as an override.
            </p>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-1">
              {overrideTasks.map(t => (
                <p key={t.id} className="text-xs text-gray-700">· {t.task_name} <span className="text-gray-400">({t.owned_by})</span></p>
              ))}
            </div>
            <textarea value={overrideReason} onChange={e => setOverrideReason(e.target.value)} rows={2} required
              placeholder="Reason for override *"
              className="w-full bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none" />
            <div className="flex gap-3">
              <button onClick={() => handleAdvance(overrideReason.trim())} disabled={advancing || !overrideReason.trim()}
                className="flex-1 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-semibold py-2 rounded-lg text-sm">
                {advancing ? 'Advancing...' : 'Confirm Override'}
              </button>
              <button onClick={() => { setOverrideTasks(null); setOverrideReason('') }}
                className="px-4 py-2 text-sm text-gray-500 hover:text-gray-900">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Rejection modal */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) setShowRejectModal(false) }}>
          <div className="bg-white border border-gray-200 rounded-xl w-full max-w-md p-5 space-y-4 shadow-2xl">
            <h3 className="font-semibold text-gray-900">Customer Rejected Sketch</h3>
            <p className="text-sm text-red-600">
              This will reset the project back to Active Project status. The delivery timeline will be affected.
            </p>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Reason for rejection *</label>
              <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} rows={3} required
                placeholder="What did the customer reject and why?"
                className="w-full bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-red-500 resize-none" />
            </div>
            <div className="flex gap-3">
              <button onClick={handleReject} disabled={rejecting || !rejectReason.trim()}
                className="flex-1 bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white font-semibold py-2 rounded-lg text-sm">
                {rejecting ? 'Resetting...' : 'Confirm Rejection'}
              </button>
              <button onClick={() => setShowRejectModal(false)}
                className="px-4 py-2 text-sm text-gray-500 hover:text-gray-900">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
