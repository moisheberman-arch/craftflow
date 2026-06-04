'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  getProjects, createProject, getCustomers, createCustomer,
  updateCustomer, getProjectsByCustomerId,
} from '@/lib/api/supabase-client'
import { supabase } from '@/lib/supabase'
import type { Project, ProjectStatus, Customer } from '@/lib/core/types'

const STATUS_LABELS: Record<ProjectStatus, string> = {
  lead: 'Lead',
  tentative_quote_sent: 'Tentative Quote Sent',
  design_meeting_scheduled: 'Design Meeting Scheduled',
  post_design_meeting: 'Post Design Meeting',
  rendering_in_progress: 'Rendering In Progress',
  final_quote_issued: 'Final Quote Issued',
  deposit_received: 'Deposit Received',
  in_production: 'In Production',
  completed: 'Completed',
}

const SALES_SECTIONS: ProjectStatus[] = [
  'lead',
  'tentative_quote_sent',
  'design_meeting_scheduled',
  'post_design_meeting',
  'rendering_in_progress',
  'final_quote_issued',
  'deposit_received',
]

// ── Customer Modal ──────────────────────────────────────────────────────────

type CustModalState = 'list' | 'detail' | 'form'

function CustomersModal({
  onClose,
  onCustomersChanged,
}: {
  onClose: () => void
  onCustomersChanged: (customers: Customer[]) => void
}) {
  const router = useRouter()
  const [state, setState] = useState<CustModalState>('list')
  const [customers, setCustomers] = useState<Customer[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [customerProjects, setCustomerProjects] = useState<Project[]>([])
  const [loadingProjects, setLoadingProjects] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  // Form state
  const [formName, setFormName] = useState('')
  const [formPhone, setFormPhone] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formAddress, setFormAddress] = useState('')
  const [formSaving, setFormSaving] = useState(false)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    getCustomers()
      .then(c => { setCustomers(c); onCustomersChanged(c) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const filtered = customers.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.email ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (c.phone ?? '').includes(search)
  )

  async function openDetail(c: Customer) {
    setSelectedCustomer(c)
    setState('detail')
    setLoadingProjects(true)
    getProjectsByCustomerId(c.id)
      .then(setCustomerProjects)
      .catch(console.error)
      .finally(() => setLoadingProjects(false))
  }

  function openNew() {
    setEditingId(null)
    setFormName(''); setFormPhone(''); setFormEmail(''); setFormAddress('')
    setFormError('')
    setState('form')
  }

  function openEdit(c: Customer) {
    setEditingId(c.id)
    setFormName(c.name)
    setFormPhone(c.phone ?? '')
    setFormEmail(c.email ?? '')
    setFormAddress(c.address ?? '')
    setFormError('')
    setState('form')
  }

  async function handleDeleteCustomer(id: string) {
    if (!window.confirm('Delete this customer? This cannot be undone.')) return
    const { error } = await supabase.from('customers').delete().eq('id', id)
    if (error) { alert(error.message); return }
    const updated = customers.filter(c => c.id !== id)
    setCustomers(updated)
    onCustomersChanged(updated)
  }

  async function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormSaving(true)
    setFormError('')
    try {
      if (editingId) {
        const updated = await updateCustomer(editingId, {
          name: formName,
          phone: formPhone || null,
          email: formEmail || null,
          address: formAddress || null,
        })
        const next = customers.map(c => c.id === editingId ? updated : c)
        setCustomers(next)
        onCustomersChanged(next)
      } else {
        const newC = await createCustomer({
          name: formName,
          phone: formPhone || null,
          email: formEmail || null,
          address: formAddress || null,
        })
        const next = [...customers, newC].sort((a, b) => a.name.localeCompare(b.name))
        setCustomers(next)
        onCustomersChanged(next)
      }
      setState('list')
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setFormSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 shrink-0">
          <div className="flex items-center gap-3">
            {state !== 'list' && (
              <button
                onClick={() => setState('list')}
                className="text-gray-400 hover:text-white text-sm"
              >
                ← Back
              </button>
            )}
            <h2 className="font-semibold text-white">
              {state === 'list' && 'Customers'}
              {state === 'detail' && selectedCustomer?.name}
              {state === 'form' && (editingId ? 'Edit Customer' : 'New Customer')}
            </h2>
          </div>
          <div className="flex items-center gap-3">
            {state === 'list' && (
              <button
                onClick={openNew}
                className="bg-amber-500 hover:bg-amber-400 text-gray-950 font-semibold px-3 py-1.5 rounded-lg text-sm"
              >
                + New Customer
              </button>
            )}
            {state === 'detail' && (
              <button
                onClick={() => selectedCustomer && openEdit(selectedCustomer)}
                className="text-sm text-amber-400 hover:text-amber-300"
              >
                Edit
              </button>
            )}
            <button onClick={onClose} className="text-gray-500 hover:text-white text-xl leading-none">×</button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {/* ── State 1: Customer List ── */}
          {state === 'list' && (
            <div className="p-4">
              <input
                type="text"
                placeholder="Search customers..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white mb-4 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
              {loading ? (
                <div className="text-center py-8 text-gray-500">Loading...</div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-8 text-gray-500">No customers found</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800">
                      <th className="px-3 py-2 text-left text-gray-400 font-medium">Name</th>
                      <th className="px-3 py-2 text-left text-gray-400 font-medium">Phone</th>
                      <th className="px-3 py-2 text-left text-gray-400 font-medium">Email</th>
                      <th className="px-3 py-2 text-right text-gray-400 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(c => (
                      // Fix 1: entire row clickable — action buttons stop propagation
                      <tr
                        key={c.id}
                        onClick={() => openDetail(c)}
                        className="border-b border-gray-800 last:border-0 hover:bg-gray-800/40 cursor-pointer"
                      >
                        <td className="px-3 py-3 font-medium">{c.name}</td>
                        <td className="px-3 py-3 text-gray-400">{c.phone ?? '—'}</td>
                        <td className="px-3 py-3 text-gray-400">{c.email ?? '—'}</td>
                        <td className="px-3 py-3 text-right" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-3">
                            <button onClick={() => openEdit(c)} className="text-gray-400 hover:text-white text-xs">Edit</button>
                            <button onClick={() => handleDeleteCustomer(c.id)} className="text-red-400 hover:text-red-300 text-xs">Delete</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* ── State 2: Customer Detail ── */}
          {state === 'detail' && selectedCustomer && (
            <div className="p-6 space-y-5">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><p className="text-gray-500 mb-0.5">Phone</p><p>{selectedCustomer.phone ?? '—'}</p></div>
                <div><p className="text-gray-500 mb-0.5">Email</p><p>{selectedCustomer.email ?? '—'}</p></div>
                <div className="col-span-2"><p className="text-gray-500 mb-0.5">Address</p><p>{selectedCustomer.address ?? '—'}</p></div>
              </div>
              <div>
                <h3 className="font-semibold mb-3 text-sm text-gray-300">Projects</h3>
                {loadingProjects ? (
                  <p className="text-gray-500 text-sm">Loading...</p>
                ) : customerProjects.length === 0 ? (
                  <p className="text-gray-500 text-sm">No projects yet</p>
                ) : (
                  <div className="space-y-2">
                    {customerProjects.map(p => (
                      <button
                        key={p.id}
                        onClick={() => { onClose(); router.push(`/dashboard/projects/${p.id}?view=sales`) }}
                        className="w-full text-left bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg px-4 py-3 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium capitalize">
                            {p.project_type?.replace(/_/g, ' ') ?? 'New Project'}
                          </span>
                          <span className="text-xs text-gray-400">
                            {p.status ? STATUS_LABELS[p.status] : '—'}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">{new Date(p.updated_at).toLocaleDateString()}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── State 3: New / Edit Form ── */}
          {state === 'form' && (
            <form onSubmit={handleFormSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs text-gray-400 mb-1">Full Name *</label>
                  <input required value={formName} onChange={e => setFormName(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-amber-500" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Phone</label>
                  <input value={formPhone} onChange={e => setFormPhone(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-amber-500" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Email</label>
                  <input type="email" value={formEmail} onChange={e => setFormEmail(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-amber-500" />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs text-gray-400 mb-1">Address</label>
                  <input value={formAddress} onChange={e => setFormAddress(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-amber-500" />
                </div>
              </div>
              {formError && <p className="text-red-400 text-sm">{formError}</p>}
              <div className="flex gap-3">
                <button type="submit" disabled={formSaving || !formName}
                  className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-gray-950 font-semibold px-5 py-2 rounded-lg text-sm">
                  {formSaving ? 'Saving...' : 'Save Customer'}
                </button>
                <button type="button" onClick={() => setState('list')} className="text-gray-400 hover:text-white text-sm">Cancel</button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Sales Dashboard ─────────────────────────────────────────────────────────

export default function SalesDashboard() {
  const [projects, setProjects] = useState<Project[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [showNewProject, setShowNewProject] = useState(false)
  const [showCustomers, setShowCustomers] = useState(false)
  const [creating, setCreating] = useState(false)

  const [mode, setMode] = useState<'existing' | 'new'>('existing')
  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [newName, setNewName] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newAddress, setNewAddress] = useState('')

  const router = useRouter()

  useEffect(() => {
    Promise.all([getProjects(), getCustomers()])
      .then(([p, c]) => { setProjects(p); setCustomers(c) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  function resetNewProject() {
    setMode('existing')
    setSelectedCustomerId('')
    setNewName(''); setNewPhone(''); setNewEmail(''); setNewAddress('')
  }

  async function handleCreateProject(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    try {
      let customerId: string | null = null
      let projectAddress: string | null = null

      if (mode === 'existing') {
        customerId = selectedCustomerId || null
        // Pull address from selected customer
        const found = customers.find(c => c.id === customerId)
        projectAddress = found?.address ?? null
      } else {
        // Fix 1: create customer, then copy address to project
        const customer = await createCustomer({
          name: newName,
          phone: newPhone || null,
          email: newEmail || null,
          address: newAddress || null,
        })
        customerId = customer.id
        projectAddress = newAddress || null
        setCustomers(prev => [...prev, customer].sort((a, b) => a.name.localeCompare(b.name)))
      }

      const p = await createProject({
        customer_id: customerId,
        project_type: null,
        status: 'lead',
        address: projectAddress,          // Fix 1: address flows through
        notes: null,
        required_fields_completed: {
          customer_info: !!customerId,
          project_type: false,
          color_finish: false,
          quote_issued: false,
        },
      })

      setProjects(prev => [p, ...prev])
      setShowNewProject(false)
      resetNewProject()
      router.push(`/dashboard/projects/${p.id}?view=sales`)
    } finally {
      setCreating(false)
    }
  }

  const byStatus = (status: ProjectStatus) =>
    projects.filter(p => p.status === status).sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    )

  const salesProjects = projects.filter(p => SALES_SECTIONS.includes(p.status as ProjectStatus))

  return (
    <div>
      {/* Fix 2: Customers modal */}
      {showCustomers && (
        <CustomersModal
          onClose={() => setShowCustomers(false)}
          onCustomersChanged={setCustomers}
        />
      )}

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Sales Dashboard</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowCustomers(true)}
            className="text-sm text-gray-400 hover:text-white transition-colors"
          >
            Customers
          </button>
          <button
            onClick={() => setShowNewProject(true)}
            className="bg-amber-500 hover:bg-amber-400 text-gray-950 font-semibold px-4 py-2 rounded-lg transition-colors text-sm"
          >
            + New Project
          </button>
        </div>
      </div>

      {/* New Project modal */}
      {showNewProject && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          onClick={e => { if (e.target === e.currentTarget) { setShowNewProject(false); resetNewProject() } }}
        >
          <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
              <h2 className="font-semibold text-white">New Project</h2>
              <button onClick={() => { setShowNewProject(false); resetNewProject() }}
                className="text-gray-500 hover:text-white text-xl leading-none">×</button>
            </div>
            <form onSubmit={handleCreateProject} className="p-5 space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">Customer</label>
                <div className="flex gap-1 bg-gray-800 rounded-lg p-1 mb-3">
                  <button type="button" onClick={() => setMode('existing')}
                    className={`flex-1 py-1.5 text-sm rounded-md transition-colors ${mode === 'existing' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'}`}>
                    Select Existing
                  </button>
                  <button type="button" onClick={() => setMode('new')}
                    className={`flex-1 py-1.5 text-sm rounded-md transition-colors ${mode === 'new' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'}`}>
                    Create New
                  </button>
                </div>
                {mode === 'existing' ? (
                  <select value={selectedCustomerId} onChange={e => setSelectedCustomerId(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500">
                    <option value="">— No customer yet —</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                ) : (
                  <div className="space-y-2">
                    <input required placeholder="Full name *" value={newName} onChange={e => setNewName(e.target.value)}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500" />
                    <input placeholder="Phone" value={newPhone} onChange={e => setNewPhone(e.target.value)}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500" />
                    <input placeholder="Email" type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500" />
                    <input placeholder="Address" value={newAddress} onChange={e => setNewAddress(e.target.value)}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500" />
                  </div>
                )}
              </div>
              <div className="flex gap-2 pt-1">
                <button type="submit" disabled={creating || (mode === 'new' && !newName)}
                  className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-gray-950 font-semibold py-2 rounded-lg text-sm">
                  {creating ? 'Creating...' : 'Create Project'}
                </button>
                <button type="button" onClick={() => { setShowNewProject(false); resetNewProject() }}
                  className="px-4 py-2 text-sm text-gray-400 hover:text-white">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center text-gray-500 py-8">Loading...</div>
      ) : (
        <div className="space-y-8">
          {SALES_SECTIONS.map(status => {
            const group = byStatus(status)
            if (group.length === 0) return null
            return (
              <div key={status}>
                <div className="flex items-center gap-2 mb-3">
                  <h2 className="font-bold text-white">{STATUS_LABELS[status]}</h2>
                  <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full">{group.length}</span>
                </div>
                <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-800 text-left">
                        <th className="px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">Customer</th>
                        <th className="px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">Project Type</th>
                        <th className="px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">Last Updated</th>
                        <th className="px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.map(project => (
                        <tr key={project.id} className="border-b border-gray-800 last:border-0 hover:bg-gray-800/50">
                          <td className="px-4 py-3 text-sm font-medium">
                            {project.customer?.name ?? <span className="text-gray-500 italic">No customer</span>}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-300 capitalize">
                            {project.project_type?.replace(/_/g, ' ') ?? <span className="text-gray-500 italic">—</span>}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-400">
                            {new Date(project.updated_at).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3">
                            <Link href={`/dashboard/projects/${project.id}?view=sales`}
                              className="text-sm text-amber-400 hover:text-amber-300">View</Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}
          {salesProjects.length === 0 && (
            <div className="text-center text-gray-500 py-12">
              No active projects. Click &ldquo;+ New Project&rdquo; to get started.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
