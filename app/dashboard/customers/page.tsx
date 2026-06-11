'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getCustomers, createCustomer } from '@/lib/api/supabase-client'
import type { Customer } from '@/lib/core/types'

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getCustomers().then(setCustomers).catch(console.error).finally(() => setLoading(false))
  }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const c = await createCustomer({ name, email: email || null, phone: phone || null, address: address || null })
      setCustomers(prev => [...prev, c])
      setShowForm(false)
      setName(''); setEmail(''); setPhone(''); setAddress('')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Customers</h1>
        <button
          onClick={() => setShowForm(true)}
          className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-4 py-2 rounded-lg text-sm"
        >
          + New Customer
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white shadow-sm border border-gray-200 rounded-xl p-5 mb-6 space-y-3">
          <h3 className="text-sm font-medium text-gray-700">New Customer</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input required placeholder="Name *" value={name} onChange={e => setName(e.target.value)}
              className="bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500" />
            <input placeholder="Email" value={email} onChange={e => setEmail(e.target.value)}
              className="bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500" />
            <input placeholder="Phone" value={phone} onChange={e => setPhone(e.target.value)}
              className="bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500" />
            <input placeholder="Address" value={address} onChange={e => setAddress(e.target.value)}
              className="bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving || !name}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold px-4 py-2 rounded-lg text-sm">
              {saving ? 'Creating...' : 'Create Customer'}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="text-gray-500 hover:text-gray-900 text-sm px-3">
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="bg-white shadow-sm rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading...</div>
        ) : customers.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No customers yet</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="px-4 py-3 text-left text-gray-500 font-medium">Name</th>
                <th className="px-4 py-3 text-left text-gray-500 font-medium">Email</th>
                <th className="px-4 py-3 text-left text-gray-500 font-medium">Phone</th>
                <th className="px-4 py-3 text-gray-500 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {customers.map(c => (
                <tr key={c.id} className="border-b border-gray-200 last:border-0 hover:bg-blue-50">
                  <td className="px-4 py-3 font-medium">{c.name}</td>
                  <td className="px-4 py-3 text-gray-500">{c.email ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{c.phone ?? '—'}</td>
                  <td className="px-4 py-3 text-center">
                    <Link href={`/dashboard/customers/${c.id}`} className="text-blue-600 hover:text-blue-500">
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
  )
}
