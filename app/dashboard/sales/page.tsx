'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { getProjects, createProject, getCustomers, createCustomer } from '@/lib/api/supabase-client'
import type { Project, ProjectStatus, Customer } from '@/lib/core/types'

const STATUS_LABELS: Record<ProjectStatus, string> = {
  lead: 'Lead',
  design_meeting_scheduled: 'Design Meeting Scheduled',
  rendering: 'Rendering',
  quote_issued: 'Quote Issued',
  deposit_received: 'Deposit Received',
  in_production: 'In Production',
  completed: 'Completed',
}

const STATUS_COLORS: Record<ProjectStatus, string> = {
  lead: 'bg-gray-700 text-gray-200',
  design_meeting_scheduled: 'bg-blue-900 text-blue-200',
  rendering: 'bg-purple-900 text-purple-200',
  quote_issued: 'bg-yellow-900 text-yellow-200',
  deposit_received: 'bg-green-900 text-green-200',
  in_production: 'bg-orange-900 text-orange-200',
  completed: 'bg-emerald-900 text-emerald-200',
}

// Bug 4: sections shown in this order, completed/in_production excluded from sales
const SALES_SECTIONS: ProjectStatus[] = [
  'lead',
  'design_meeting_scheduled',
  'rendering',
  'quote_issued',
  'deposit_received',
]

export default function SalesDashboard() {
  const [projects, setProjects] = useState<Project[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [creating, setCreating] = useState(false)

  // Modal form state
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

  function resetModal() {
    setMode('existing')
    setSelectedCustomerId('')
    setNewName(''); setNewPhone(''); setNewEmail(''); setNewAddress('')
  }

  async function handleCreateProject(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    try {
      let customerId: string | null = null

      if (mode === 'existing') {
        customerId = selectedCustomerId || null
      } else {
        // Bug 1: create customer inline first
        const customer = await createCustomer({
          name: newName,
          phone: newPhone || null,
          email: newEmail || null,
          address: newAddress || null,
        })
        customerId = customer.id
        setCustomers(prev => [...prev, customer])
      }

      const p = await createProject({
        customer_id: customerId,
        project_type: null,
        status: 'lead',
        address: null,
        notes: null,
        required_fields_completed: {
          customer_info: !!customerId,
          project_type: false,
          color_finish: false,
          quote_issued: false,
        },
      })

      setShowModal(false)
      resetModal()
      router.push(`/dashboard/projects/${p.id}?view=sales`)
    } finally {
      setCreating(false)
    }
  }

  // Bug 4: group projects by status section
  const byStatus = (status: ProjectStatus) =>
    projects.filter(p => p.status === status).sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    )

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Sales Dashboard</h1>
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/customers"
            className="text-sm text-gray-400 hover:text-white transition-colors"
          >
            Customers
          </Link>
          <button
            onClick={() => setShowModal(true)}
            className="bg-amber-500 hover:bg-amber-400 text-gray-950 font-semibold px-4 py-2 rounded-lg transition-colors text-sm"
          >
            + New Project
          </button>
        </div>
      </div>

      {/* Bug 1: New Project Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
              <h2 className="font-semibold text-white">New Project</h2>
              <button
                onClick={() => { setShowModal(false); resetModal() }}
                className="text-gray-500 hover:text-white text-xl leading-none"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleCreateProject} className="p-5 space-y-4">
              {/* Customer mode toggle */}
              <div>
                <label className="block text-sm text-gray-400 mb-2">Customer</label>
                <div className="flex gap-1 bg-gray-800 rounded-lg p-1 mb-3">
                  <button
                    type="button"
                    onClick={() => setMode('existing')}
                    className={`flex-1 py-1.5 text-sm rounded-md transition-colors ${
                      mode === 'existing' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    Select Existing
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('new')}
                    className={`flex-1 py-1.5 text-sm rounded-md transition-colors ${
                      mode === 'new' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    Create New
                  </button>
                </div>

                {mode === 'existing' ? (
                  <select
                    value={selectedCustomerId}
                    onChange={e => setSelectedCustomerId(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="">— No customer yet —</option>
                    {customers.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                ) : (
                  <div className="space-y-2">
                    <input
                      required
                      placeholder="Full name *"
                      value={newName}
                      onChange={e => setNewName(e.target.value)}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                    <input
                      placeholder="Phone"
                      value={newPhone}
                      onChange={e => setNewPhone(e.target.value)}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                    <input
                      placeholder="Email"
                      type="email"
                      value={newEmail}
                      onChange={e => setNewEmail(e.target.value)}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                    <input
                      placeholder="Address"
                      value={newAddress}
                      onChange={e => setNewAddress(e.target.value)}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                )}
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  disabled={creating || (mode === 'new' && !newName)}
                  className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-gray-950 font-semibold py-2 rounded-lg text-sm"
                >
                  {creating ? 'Creating...' : 'Create Project'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowModal(false); resetModal() }}
                  className="px-4 py-2 text-sm text-gray-400 hover:text-white"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bug 4: Grouped by status */}
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
                  <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full">
                    {group.length}
                  </span>
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
                        <tr
                          key={project.id}
                          className="border-b border-gray-800 last:border-0 hover:bg-gray-800/50"
                        >
                          <td className="px-4 py-3 text-sm font-medium">
                            {project.customer?.name ?? (
                              <span className="text-gray-500 italic">No customer</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-300 capitalize">
                            {project.project_type?.replace(/_/g, ' ') ?? (
                              <span className="text-gray-500 italic">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-400">
                            {new Date(project.updated_at).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3">
                            {/* Bug 3: pass view=sales */}
                            <Link
                              href={`/dashboard/projects/${project.id}?view=sales`}
                              className="text-sm text-amber-400 hover:text-amber-300"
                            >
                              View
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}

          {projects.filter(p => SALES_SECTIONS.includes(p.status as ProjectStatus)).length === 0 && (
            <div className="text-center text-gray-500 py-12">
              No active projects. Click &ldquo;+ New Project&rdquo; to get started.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
