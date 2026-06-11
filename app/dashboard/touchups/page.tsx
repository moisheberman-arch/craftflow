'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  getTouchups, createTouchup, updateTouchup, deleteTouchup,
} from '@/lib/api/supabase-client'
import { getProjects, getCustomers } from '@/lib/api/supabase-client'
import type { Touchup, TouchupStatus, TouchupPriority } from '@/lib/core/types'
import type { Project, Customer } from '@/lib/core/types'

function formatAge(createdAt: string): string {
  const hours = (Date.now() - new Date(createdAt).getTime()) / 3600000
  if (hours < 1) return 'Just now'
  if (hours < 24) return `${Math.round(hours)}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function StatusBadge({ status }: { status: TouchupStatus }) {
  const map: Record<TouchupStatus, string> = {
    open: 'bg-gray-200 text-gray-800',
    in_progress: 'bg-blue-100 text-blue-700',
    done: 'bg-emerald-100 text-emerald-700',
  }
  const labels: Record<TouchupStatus, string> = {
    open: 'Open',
    in_progress: 'In Progress',
    done: 'Done',
  }
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide ${map[status]}`}>
      {labels[status]}
    </span>
  )
}

// ── Touch-up card ─────────────────────────────────────────────────────────

function TouchupCard({
  touchup,
  onUpdate,
  onDelete,
  onEdit,
}: {
  touchup: Touchup
  onUpdate: (t: Touchup) => void
  onDelete: (id: string) => void
  onEdit: (t: Touchup) => void
}) {
  const [updating, setUpdating] = useState(false)

  async function handleStatusChange(newStatus: TouchupStatus) {
    setUpdating(true)
    try {
      const patch: Partial<Touchup> = { status: newStatus }
      if (newStatus === 'done') patch.completed_at = new Date().toISOString()
      const updated = await updateTouchup(touchup.id, patch)
      onUpdate(updated)
    } finally {
      setUpdating(false)
    }
  }

  const linkedName =
    touchup.customer?.name ??
    (touchup.project?.customer as Customer | undefined)?.name ??
    null

  const projectLabel = touchup.project
    ? `${linkedName ?? 'Unknown'} — ${touchup.project.project_type?.replace(/_/g, ' ') ?? 'Project'}`
    : linkedName

  return (
    <div className={`bg-white shadow-sm border rounded-xl p-4 space-y-2 ${touchup.priority === 'urgent' ? 'border-red-300' : 'border-gray-200'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 text-sm leading-snug">{touchup.description}</p>
          {touchup.assigned_to && (
            <p className="text-xs text-gray-500 mt-0.5">Assigned: {touchup.assigned_to}</p>
          )}
          {touchup.address && (
            <p className="text-xs text-gray-500 mt-0.5">📍 {touchup.address}</p>
          )}
          {projectLabel && (
            <p className="text-xs text-blue-600/80 mt-0.5 truncate">{projectLabel}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          {touchup.priority === 'urgent' && (
            <span className="text-[10px] font-semibold bg-red-100 text-red-700 px-1.5 py-0.5 rounded uppercase">Urgent</span>
          )}
          <StatusBadge status={touchup.status} />
        </div>
      </div>

      {touchup.notes && (
        <p className="text-xs text-gray-500 bg-gray-100 rounded px-2 py-1">{touchup.notes}</p>
      )}

      <div className="flex items-center justify-between pt-1">
        <span className="text-xs text-gray-400">{formatAge(touchup.created_at)}</span>
        <div className="flex items-center gap-2">
          <Link
            href={`/dashboard/touchups/${touchup.id}/print`}
            target="_blank"
            className="text-xs text-gray-500 hover:text-gray-700 border border-gray-300 px-2 py-0.5 rounded"
          >
            🖨
          </Link>
          <button onClick={() => onEdit(touchup)} className="text-xs text-gray-500 hover:text-gray-900">Edit</button>
          {touchup.status === 'open' && (
            <button
              onClick={() => handleStatusChange('in_progress')}
              disabled={updating}
              className="text-xs bg-blue-100 hover:bg-blue-200 text-blue-700 px-2 py-0.5 rounded disabled:opacity-50"
            >
              Mark In Progress
            </button>
          )}
          {touchup.status !== 'done' && (
            <button
              onClick={() => handleStatusChange('done')}
              disabled={updating}
              className="text-xs bg-emerald-100 hover:bg-emerald-200 text-emerald-700 px-2 py-0.5 rounded disabled:opacity-50"
            >
              Mark Done
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── New / Edit modal ───────────────────────────────────────────────────────

function TouchupModal({
  initial,
  projects,
  customers,
  onSave,
  onClose,
}: {
  initial?: Touchup | null
  projects: Project[]
  customers: Customer[]
  onSave: (t: Touchup) => void
  onClose: () => void
}) {
  const [description, setDescription] = useState(initial?.description ?? '')
  const [assignedTo, setAssignedTo] = useState(initial?.assigned_to ?? '')
  const [address, setAddress] = useState(initial?.address ?? '')
  const [priority, setPriority] = useState<TouchupPriority>(initial?.priority ?? 'normal')
  const [status, setStatus] = useState<TouchupStatus>(initial?.status ?? 'open')
  const [projectId, setProjectId] = useState(initial?.project_id ?? '')
  const [customerId, setCustomerId] = useState(initial?.customer_id ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!description.trim()) return
    setSaving(true)
    try {
      const payload = {
        description: description.trim(),
        assigned_to: assignedTo || null,
        address: address || null,
        priority,
        status,
        project_id: projectId || null,
        customer_id: customerId || null,
        notes: notes || null,
        completed_at: status === 'done' ? new Date().toISOString() : null,
      }
      let result: Touchup
      if (initial) {
        result = await updateTouchup(initial.id, payload)
      } else {
        result = await createTouchup(payload)
      }
      onSave(result)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white shadow-sm border border-gray-200 rounded-xl w-full max-w-lg p-5 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">{initial ? 'Edit Touch-Up' : 'New Touch-Up'}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-900 text-xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Description *</label>
            <textarea
              required
              rows={3}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What needs to be done..."
              className="w-full bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Assigned To</label>
              <input
                value={assignedTo}
                onChange={e => setAssignedTo(e.target.value)}
                placeholder="Person responsible"
                className="w-full bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Address</label>
              <input
                value={address}
                onChange={e => setAddress(e.target.value)}
                placeholder="Job site address"
                className="w-full bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Priority</label>
              <div className="flex rounded-lg overflow-hidden border border-gray-300">
                <button
                  type="button"
                  onClick={() => setPriority('normal')}
                  className={`px-3 py-1.5 text-sm transition-colors ${priority === 'normal' ? 'bg-gray-300 text-gray-900' : 'bg-gray-100 text-gray-500 hover:text-gray-900'}`}
                >
                  Normal
                </button>
                <button
                  type="button"
                  onClick={() => setPriority('urgent')}
                  className={`px-3 py-1.5 text-sm transition-colors ${priority === 'urgent' ? 'bg-red-700 text-white' : 'bg-gray-100 text-gray-500 hover:text-gray-900'}`}
                >
                  Urgent
                </button>
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Status</label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value as TouchupStatus)}
                className="bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none"
              >
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="done">Done</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-500 block mb-1">Link to Project (optional)</label>
            <select
              value={projectId}
              onChange={e => setProjectId(e.target.value)}
              className="w-full bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none"
            >
              <option value="">— None —</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>
                  {(p.customer as Customer | undefined)?.name ?? 'Unknown'} — {p.project_type?.replace(/_/g, ' ') ?? 'Project'}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-gray-500 block mb-1">Link to Customer (optional)</label>
            <select
              value={customerId}
              onChange={e => setCustomerId(e.target.value)}
              className="w-full bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none"
            >
              <option value="">— None —</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs text-gray-500 block mb-1">Notes</label>
            <textarea
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Any additional context..."
              className="w-full bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none resize-none"
            />
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={saving || !description.trim()}
              className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold py-2 rounded-lg text-sm"
            >
              {saving ? 'Saving...' : initial ? 'Save Changes' : 'Create Touch-Up'}
            </button>
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-900">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function TouchupsPage() {
  const [touchups, setTouchups] = useState<Touchup[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editTarget, setEditTarget] = useState<Touchup | null>(null)
  const [showAllCompleted, setShowAllCompleted] = useState(false)

  useEffect(() => {
    Promise.all([
      getTouchups().catch(() => [] as Touchup[]),
      getProjects().catch(() => [] as Project[]),
      getCustomers().catch(() => [] as Customer[]),
    ]).then(([t, p, c]) => {
      setTouchups(t)
      setProjects(p)
      setCustomers(c)
    }).finally(() => setLoading(false))
  }, [])

  function handleSave(saved: Touchup) {
    setTouchups(prev => {
      const exists = prev.find(t => t.id === saved.id)
      return exists ? prev.map(t => t.id === saved.id ? saved : t) : [saved, ...prev]
    })
    setShowModal(false)
    setEditTarget(null)
  }

  function handleUpdate(updated: Touchup) {
    setTouchups(prev => prev.map(t => t.id === updated.id ? updated : t))
  }

  async function handleDelete(id: string) {
    await deleteTouchup(id).catch(console.error)
    setTouchups(prev => prev.filter(t => t.id !== id))
  }

  function openEdit(t: Touchup) {
    setEditTarget(t)
    setShowModal(true)
  }

  const open = touchups.filter(t => t.status !== 'done')
  const urgentOpen = open.filter(t => t.priority === 'urgent')
  const normalOpen = open.filter(t => t.priority === 'normal')

  const completed = touchups.filter(t => t.status === 'done')
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString()
  const recentDone = completed.filter(t => t.updated_at > thirtyDaysAgo)
  const shownDone = showAllCompleted ? completed : recentDone

  if (loading) return <div className="text-center py-8 text-gray-500">Loading...</div>

  return (
    <div className="flex gap-6 flex-col md:flex-row">
      {/* LEFT — Open & In Progress */}
      <div className="flex-1 min-w-0 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-gray-900">Touch-Ups &amp; Field Jobs</h1>
            {urgentOpen.length > 0 && (
              <span className="bg-red-700 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                {urgentOpen.length} urgent
              </span>
            )}
          </div>
          <button
            onClick={() => { setEditTarget(null); setShowModal(true) }}
            className="bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm px-4 py-2 rounded-lg"
          >
            + New Touch-Up
          </button>
        </div>

        {open.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <p className="text-lg mb-1">All clear!</p>
            <p className="text-sm">No open touch-ups or field jobs.</p>
          </div>
        )}

        {urgentOpen.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-red-500" />
              <h2 className="font-semibold text-red-600 text-sm">Urgent</h2>
              <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">{urgentOpen.length}</span>
            </div>
            <div className="space-y-3">
              {urgentOpen.map(t => (
                <TouchupCard key={t.id} touchup={t} onUpdate={handleUpdate} onDelete={handleDelete} onEdit={openEdit} />
              ))}
            </div>
          </div>
        )}

        {normalOpen.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-gray-400" />
              <h2 className="font-semibold text-gray-700 text-sm">Normal</h2>
              <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{normalOpen.length}</span>
            </div>
            <div className="space-y-3">
              {normalOpen.map(t => (
                <TouchupCard key={t.id} touchup={t} onUpdate={handleUpdate} onDelete={handleDelete} onEdit={openEdit} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* RIGHT — Completed */}
      <div className="w-full md:w-72 shrink-0 space-y-3">
        <h2 className="font-semibold text-gray-700 text-sm">
          Completed
          <span className="ml-2 text-xs text-gray-400">({completed.length} total)</span>
        </h2>

        {shownDone.length === 0 ? (
          <p className="text-xs text-gray-400">None recently.</p>
        ) : (
          <div className="space-y-2">
            {shownDone.map(t => (
              <div key={t.id} className="bg-white shadow-sm border border-gray-200 rounded-lg px-3 py-2.5 flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-700 line-through leading-snug truncate">{t.description}</p>
                  {t.assigned_to && <p className="text-[10px] text-gray-400">{t.assigned_to}</p>}
                  {t.completed_at && (
                    <p className="text-[10px] text-gray-400">{new Date(t.completed_at).toLocaleDateString()}</p>
                  )}
                </div>
                <button
                  onClick={() => handleDelete(t.id)}
                  className="text-red-500 hover:text-red-600 text-xs shrink-0"
                >×</button>
              </div>
            ))}
          </div>
        )}

        {completed.length > recentDone.length && (
          <button
            onClick={() => setShowAllCompleted(v => !v)}
            className="text-xs text-gray-500 hover:text-gray-500"
          >
            {showAllCompleted ? 'Show recent only' : `Show all completed (${completed.length})`}
          </button>
        )}
      </div>

      {showModal && (
        <TouchupModal
          initial={editTarget}
          projects={projects}
          customers={customers}
          onSave={handleSave}
          onClose={() => { setShowModal(false); setEditTarget(null) }}
        />
      )}
    </div>
  )
}
