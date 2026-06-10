'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { getProjects, deleteProject } from '@/lib/api/supabase-client'
import type { Project, ProjectStatus } from '@/lib/core/types'

const STATUS_LABELS: Record<ProjectStatus, string> = {
  lead: 'Lead',
  tentative_quote_sent: 'Tentative Quote Sent',
  design_meeting_scheduled: 'Design Meeting Scheduled',
  post_design_meeting: 'Post Design Meeting',
  rendering_in_progress: 'Rendering In Progress',
  final_quote_issued: 'Final Quote Issued',
  deposit_received: 'Deposit Received',
  in_production: 'In Production',
  ready_for_delivery: 'Ready for Delivery',
  completed: 'Completed',
}

const STATUS_COLORS: Record<ProjectStatus, string> = {
  lead:                     'bg-gray-700 text-gray-200',
  tentative_quote_sent:     'bg-slate-700 text-slate-200',
  design_meeting_scheduled: 'bg-blue-900 text-blue-200',
  post_design_meeting:      'bg-indigo-900 text-indigo-200',
  rendering_in_progress:    'bg-purple-900 text-purple-200',
  final_quote_issued:       'bg-yellow-900 text-yellow-200',
  deposit_received:         'bg-green-900 text-green-200',
  in_production:            'bg-orange-900 text-orange-200',
  ready_for_delivery:       'bg-teal-900 text-teal-200',
  completed:                'bg-emerald-900 text-emerald-200',
}

export default function ManageProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirmIds, setConfirmIds] = useState<string[] | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    getProjects()
      .then(setProjects)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const projectTypes = useMemo(
    () => Array.from(new Set(projects.map(p => p.project_type).filter((t): t is NonNullable<typeof t> => !!t))),
    [projects]
  )

  const filtered = projects.filter(p => {
    if (search && !(p.customer?.name ?? '').toLowerCase().includes(search.toLowerCase())) return false
    if (typeFilter && p.project_type !== typeFilter) return false
    if (statusFilter && p.status !== statusFilter) return false
    return true
  })

  const allFilteredSelected = filtered.length > 0 && filtered.every(p => selected.has(p.id))

  function toggleSelectAll() {
    setSelected(prev => {
      const next = new Set(prev)
      if (allFilteredSelected) {
        filtered.forEach(p => next.delete(p.id))
      } else {
        filtered.forEach(p => next.add(p.id))
      }
      return next
    })
  }

  function toggleOne(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  async function handleConfirmedDelete() {
    if (!confirmIds || deleting) return
    setDeleting(true)
    try {
      for (const id of confirmIds) {
        await deleteProject(id)
      }
      setProjects(prev => prev.filter(p => !confirmIds.includes(p.id)))
      setSelected(prev => {
        const next = new Set(prev)
        confirmIds.forEach(id => next.delete(id))
        return next
      })
      setConfirmIds(null)
    } catch (err) {
      alert(`Delete failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setDeleting(false)
    }
  }

  const selectedCount = selected.size

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/sales" className="text-gray-500 hover:text-gray-300 text-sm">← Back</Link>
          <h1 className="text-xl font-bold text-white">Manage Projects</h1>
        </div>
        {selectedCount > 0 && (
          <button
            onClick={() => setConfirmIds(Array.from(selected))}
            className="bg-red-700 hover:bg-red-600 text-white font-semibold px-4 py-2 rounded-lg text-sm"
          >
            Delete Selected ({selectedCount})
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          placeholder="Search by customer name..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-[200px] bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
        />
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none">
          <option value="">All types</option>
          {projectTypes.map(t => <option key={t} value={t} className="capitalize">{t.replace(/_/g, ' ')}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none">
          <option value="">All statuses</option>
          {(Object.keys(STATUS_LABELS) as ProjectStatus[]).map(s => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-8 text-gray-500">Loading...</div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="px-3 py-2.5 w-10">
                  <input type="checkbox" checked={allFilteredSelected} onChange={toggleSelectAll}
                    className="accent-amber-500 w-4 h-4 cursor-pointer" />
                </th>
                {['Customer', 'Type', 'Status', 'Created', ''].map((h, i) => (
                  <th key={i} className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={6} className="px-3 py-8 text-center text-gray-500">No projects match.</td></tr>
              ) : filtered.map(p => (
                <tr key={p.id} className={`border-b border-gray-800 last:border-0 ${selected.has(p.id) ? 'bg-red-950/10' : ''}`}>
                  <td className="px-3 py-3">
                    <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleOne(p.id)}
                      className="accent-amber-500 w-4 h-4 cursor-pointer" />
                  </td>
                  <td className="px-3 py-3 text-white font-medium">{p.customer?.name ?? <span className="text-gray-500 italic">No customer</span>}</td>
                  <td className="px-3 py-3 text-gray-300 capitalize">{p.project_type?.replace(/_/g, ' ') ?? '—'}</td>
                  <td className="px-3 py-3">
                    {p.status ? (
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[p.status]}`}>
                        {STATUS_LABELS[p.status]}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-3 py-3 text-gray-400">{new Date(p.created_at).toLocaleDateString()}</td>
                  <td className="px-3 py-3 text-right">
                    <button onClick={() => setConfirmIds([p.id])}
                      className="text-xs text-red-400 hover:text-red-300">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Confirmation modal */}
      {confirmIds && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <h3 className="font-semibold text-white">Delete {confirmIds.length} project{confirmIds.length === 1 ? '' : 's'}?</h3>
            <p className="text-sm text-gray-400">
              You are about to delete {confirmIds.length} project{confirmIds.length === 1 ? '' : 's'}. This cannot be undone.
              All related materials, steps, quotes, and files will also be deleted.
            </p>
            <div className="flex gap-3">
              <button onClick={handleConfirmedDelete} disabled={deleting}
                className="flex-1 bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white font-semibold py-2 rounded-lg text-sm">
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
              <button onClick={() => setConfirmIds(null)} disabled={deleting}
                className="px-4 py-2 text-sm text-gray-400 hover:text-white">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
