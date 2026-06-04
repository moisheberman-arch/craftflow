'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { getCustomerById, updateCustomer, getProjectsByCustomerId } from '@/lib/api/supabase-client'
import type { Customer, Project, ProjectStatus } from '@/lib/core/types'

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

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    async function load() {
      const [c, p] = await Promise.all([getCustomerById(id), getProjectsByCustomerId(id)])
      if (c) {
        setCustomer(c)
        setName(c.name)
        setEmail(c.email ?? '')
        setPhone(c.phone ?? '')
        setAddress(c.address ?? '')
      }
      setProjects(p)
    }
    load().catch(console.error).finally(() => setLoading(false))
  }, [id])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const updated = await updateCustomer(id, { name, email: email || null, phone: phone || null, address: address || null })
      setCustomer(updated)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="text-center py-8 text-gray-500">Loading...</div>
  if (!customer) return <div className="text-center py-8 text-gray-500">Customer not found</div>

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <h1 className="text-2xl font-bold">{customer.name}</h1>

      <form onSubmit={handleSave} className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-medium text-gray-300">Customer Info</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Name *</label>
            <input required value={name} onChange={e => setName(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-amber-500" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Email</label>
            <input value={email} onChange={e => setEmail(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-amber-500" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Phone</label>
            <input value={phone} onChange={e => setPhone(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-amber-500" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Address</label>
            <input value={address} onChange={e => setAddress(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-amber-500" />
          </div>
        </div>
        <button type="submit" disabled={saving || !name}
          className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-gray-950 font-semibold px-4 py-2 rounded-lg text-sm">
          {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Changes'}
        </button>
      </form>

      <div>
        <h2 className="text-lg font-semibold mb-3">Projects</h2>
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          {projects.length === 0 ? (
            <div className="p-6 text-center text-gray-500 text-sm">No projects yet</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="px-4 py-3 text-left text-gray-400 font-medium">Type</th>
                  <th className="px-4 py-3 text-left text-gray-400 font-medium">Status</th>
                  <th className="px-4 py-3 text-left text-gray-400 font-medium">Updated</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {projects.map(p => (
                  <tr key={p.id} className="border-b border-gray-800 last:border-0">
                    <td className="px-4 py-3 capitalize">{p.project_type?.replace('_', ' ') ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-400">{p.status ? STATUS_LABELS[p.status] : '—'}</td>
                    <td className="px-4 py-3 text-gray-400">{new Date(p.updated_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <Link href={`/dashboard/projects/${p.id}`} className="text-amber-400 hover:text-amber-300 text-xs">
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
