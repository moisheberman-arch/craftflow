'use client'

import { useEffect, useState } from 'react'
import {
  getSuppliers, createSupplier, updateSupplier, deleteSupplier,
  getSupplierMaterials, addSupplierMaterial, updateSupplierMaterial, deleteSupplierMaterial,
} from '@/lib/api/supabase-client'
import type { Supplier, SupplierMaterial, SupplierCategory } from '@/lib/core/types'

const CATEGORIES: SupplierCategory[] = ['wood', 'hardware', 'finish', 'trim', 'lighting', 'other']

interface SupplierFormValue {
  name: string
  contact_name: string
  phone: string
  email: string
  address: string
  website: string
  what_they_supply: string
  categories: SupplierCategory[]
  notes: string
}

function toFormValue(s?: Supplier | null): SupplierFormValue {
  return {
    name: s?.name ?? '',
    contact_name: s?.contact_name ?? '',
    phone: s?.phone ?? '',
    email: s?.email ?? '',
    address: s?.address ?? '',
    website: s?.website ?? '',
    what_they_supply: s?.what_they_supply ?? '',
    categories: Array.isArray(s?.categories) ? s!.categories : [],
    notes: s?.notes ?? '',
  }
}

function toPayload(v: SupplierFormValue) {
  return {
    name: v.name.trim(),
    contact_name: v.contact_name || null,
    phone: v.phone || null,
    email: v.email || null,
    address: v.address || null,
    website: v.website || null,
    what_they_supply: v.what_they_supply || null,
    categories: v.categories,
    notes: v.notes || null,
  }
}

function SupplierFields({ v, setV }: { v: SupplierFormValue; setV: React.Dispatch<React.SetStateAction<SupplierFormValue>> }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div className="sm:col-span-2">
        <label className="block text-xs text-gray-500 mb-1">Name *</label>
        <input required value={v.name} onChange={e => setV(p => ({ ...p, name: e.target.value }))}
          className="w-full bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500" />
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">Contact Name</label>
        <input value={v.contact_name} onChange={e => setV(p => ({ ...p, contact_name: e.target.value }))}
          className="w-full bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500" />
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">Phone</label>
        <input value={v.phone} onChange={e => setV(p => ({ ...p, phone: e.target.value }))}
          className="w-full bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500" />
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">Email</label>
        <input type="email" value={v.email} onChange={e => setV(p => ({ ...p, email: e.target.value }))}
          className="w-full bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500" />
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">Website</label>
        <input value={v.website} onChange={e => setV(p => ({ ...p, website: e.target.value }))}
          className="w-full bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500" />
      </div>
      <div className="sm:col-span-2">
        <label className="block text-xs text-gray-500 mb-1">Address</label>
        <input value={v.address} onChange={e => setV(p => ({ ...p, address: e.target.value }))}
          className="w-full bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500" />
      </div>
      <div className="sm:col-span-2">
        <label className="block text-xs text-gray-500 mb-1">What They Supply</label>
        <textarea rows={2} value={v.what_they_supply} onChange={e => setV(p => ({ ...p, what_they_supply: e.target.value }))}
          placeholder="e.g. Hardwood lumber, plywood sheets"
          className="w-full bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none" />
      </div>
      <div className="sm:col-span-2">
        <label className="block text-xs text-gray-500 mb-1.5">Categories</label>
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map(cat => {
            const active = v.categories.includes(cat)
            return (
              <button key={cat} type="button"
                onClick={() => setV(p => ({
                  ...p,
                  categories: active ? p.categories.filter(c => c !== cat) : [...p.categories, cat],
                }))}
                className={`text-xs px-2.5 py-1 rounded-full font-medium capitalize transition-colors ${
                  active ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:text-gray-900 border border-gray-300'
                }`}>
                {cat}
              </button>
            )
          })}
        </div>
      </div>
      <div className="sm:col-span-2">
        <label className="block text-xs text-gray-500 mb-1">Notes</label>
        <textarea rows={2} value={v.notes} onChange={e => setV(p => ({ ...p, notes: e.target.value }))}
          className="w-full bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none" />
      </div>
    </div>
  )
}

function NewSupplierModal({ onCreated, onClose }: {
  onCreated: (s: Supplier) => void
  onClose: () => void
}) {
  const [v, setV] = useState<SupplierFormValue>(toFormValue())
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!v.name.trim()) return
    setSaving(true)
    try {
      const created = await createSupplier(toPayload(v))
      onCreated(created)
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white shadow-sm border border-gray-200 rounded-xl w-full max-w-lg max-h-[85vh] overflow-y-auto p-5 space-y-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">New Supplier</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-900 text-xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <SupplierFields v={v} setV={setV} />
          <div className="flex gap-3">
            <button type="submit" disabled={saving || !v.name.trim()}
              className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold py-2 rounded-lg text-sm">
              {saving ? 'Saving...' : 'Create Supplier'}
            </button>
            <button type="button" onClick={onClose} className="px-3 py-2 text-sm text-gray-500 hover:text-gray-900">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)

  // Detail form
  const [form, setForm] = useState<SupplierFormValue>(toFormValue())
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Materials
  const [materials, setMaterials] = useState<SupplierMaterial[]>([])
  const [newMat, setNewMat] = useState({ material_name: '', unit: '', unit_price: '', notes: '' })
  const [addingMat, setAddingMat] = useState(false)
  const [showAddMat, setShowAddMat] = useState(false)

  const selected = suppliers.find(s => s.id === selectedId) ?? null

  useEffect(() => {
    getSuppliers()
      .then(setSuppliers)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!selectedId) return
    const s = suppliers.find(x => x.id === selectedId)
    setForm(toFormValue(s))
    setConfirmDelete(false)
    setShowAddMat(false)
    getSupplierMaterials(selectedId).then(setMaterials).catch(() => setMaterials([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  const filtered = suppliers.filter(s => {
    if (!search) return true
    const q = search.toLowerCase()
    return s.name.toLowerCase().includes(q) ||
      (s.what_they_supply ?? '').toLowerCase().includes(q) ||
      (s.contact_name ?? '').toLowerCase().includes(q)
  })

  async function handleSave() {
    if (!selectedId || !form.name.trim()) return
    setSaving(true)
    try {
      const updated = await updateSupplier(selectedId, toPayload(form))
      setSuppliers(prev => prev.map(s => s.id === selectedId ? updated : s).sort((a, b) => a.name.localeCompare(b.name)))
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally { setSaving(false) }
  }

  async function handleDelete() {
    if (!selectedId) return
    setDeleting(true)
    try {
      await deleteSupplier(selectedId)
      setSuppliers(prev => prev.filter(s => s.id !== selectedId))
      setSelectedId(null)
    } finally {
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  async function handleAddMaterial() {
    if (!selectedId || !newMat.material_name.trim()) return
    setAddingMat(true)
    try {
      const created = await addSupplierMaterial(selectedId, {
        material_name: newMat.material_name.trim(),
        unit: newMat.unit || null,
        unit_price: newMat.unit_price ? parseFloat(newMat.unit_price) : null,
        notes: newMat.notes || null,
      })
      setMaterials(prev => [...prev, created])
      setNewMat({ material_name: '', unit: '', unit_price: '', notes: '' })
      setShowAddMat(false)
    } finally { setAddingMat(false) }
  }

  async function handleDeleteMaterial(id: string) {
    await deleteSupplierMaterial(id).catch(console.error)
    setMaterials(prev => prev.filter(m => m.id !== id))
  }

  return (
    <div className="flex gap-5 items-start">
      {/* LEFT — Supplier list */}
      <div className="w-[35%] shrink-0 bg-white shadow-sm border border-gray-200 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-gray-900">Suppliers</h1>
          <button onClick={() => setShowNew(true)}
            className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-3 py-1.5 rounded-lg text-xs">
            + New Supplier
          </button>
        </div>
        <input placeholder="Search suppliers..." value={search} onChange={e => setSearch(e.target.value)}
          className="w-full bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500" />

        {loading ? (
          <p className="text-sm text-gray-500 py-4 text-center">Loading...</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-gray-500 py-4 text-center">No suppliers yet.</p>
        ) : (
          <div className="space-y-1">
            {filtered.map(s => (
              <button key={s.id} onClick={() => setSelectedId(s.id)}
                className={`w-full text-left rounded-lg px-3 py-2.5 transition-colors ${
                  selectedId === s.id ? 'bg-gray-100 border border-blue-400' : 'hover:bg-blue-50 border border-transparent'
                }`}>
                <p className="text-sm font-semibold text-gray-900 truncate">{s.name}</p>
                {s.what_they_supply && <p className="text-xs text-gray-500 truncate">{s.what_they_supply}</p>}
                {s.phone && <p className="text-[10px] text-gray-500">{s.phone}</p>}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* RIGHT — Detail */}
      <div className="flex-1 min-w-0">
        {!selected ? (
          <div className="bg-white shadow-sm border border-gray-200 rounded-xl p-10 text-center text-gray-500 text-sm">
            Select a supplier from the list, or create a new one.
          </div>
        ) : (
          <div className="space-y-5">
            <div className="bg-white shadow-sm border border-gray-200 rounded-xl p-5 space-y-4">
              <SupplierFields v={form} setV={setForm} />
              <div className="flex items-center justify-between">
                <button onClick={handleSave} disabled={saving || !form.name.trim()}
                  className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold px-5 py-2 rounded-lg text-sm">
                  {saving ? 'Saving...' : saved ? '✓ Saved' : 'Save Changes'}
                </button>
                <button onClick={() => setConfirmDelete(true)}
                  className="text-xs text-red-500 hover:text-red-600">Delete Supplier</button>
              </div>
            </div>

            {/* Materials & Pricing */}
            <div className="bg-white shadow-sm border border-gray-200 rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm text-gray-900">Materials &amp; Pricing</h3>
                <button onClick={() => setShowAddMat(v => !v)}
                  className="text-xs text-blue-600 hover:text-blue-500">+ Add Material</button>
              </div>

              {materials.length === 0 && !showAddMat ? (
                <p className="text-xs text-gray-500">No materials recorded for this supplier yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      {['Material', 'Unit', 'Unit Price', 'Notes', ''].map((h, i) => (
                        <th key={i} className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {materials.map(m => (
                      <tr key={m.id} className="border-b border-gray-200 last:border-0">
                        <td className="px-2 py-2 text-gray-900">{m.material_name}</td>
                        <td className="px-2 py-2 text-gray-500">{m.unit ?? '—'}</td>
                        <td className="px-2 py-2 text-gray-700">{m.unit_price != null ? `$${m.unit_price}` : '—'}</td>
                        <td className="px-2 py-2 text-gray-500">{m.notes ?? '—'}</td>
                        <td className="px-2 py-2 text-right">
                          <button onClick={() => handleDeleteMaterial(m.id)}
                            className="text-xs text-red-600 hover:text-red-600">Delete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {showAddMat && (
                <div className="grid grid-cols-[1fr_80px_100px_1fr_auto] gap-2 items-center">
                  <input placeholder="Material name *" value={newMat.material_name}
                    onChange={e => setNewMat(p => ({ ...p, material_name: e.target.value }))}
                    className="bg-gray-100 border border-gray-300 rounded-lg px-2 py-1.5 text-xs text-gray-900 focus:outline-none" />
                  <input placeholder="Unit" value={newMat.unit}
                    onChange={e => setNewMat(p => ({ ...p, unit: e.target.value }))}
                    className="bg-gray-100 border border-gray-300 rounded-lg px-2 py-1.5 text-xs text-gray-900 focus:outline-none" />
                  <input placeholder="$ Price" type="number" value={newMat.unit_price}
                    onChange={e => setNewMat(p => ({ ...p, unit_price: e.target.value }))}
                    className="bg-gray-100 border border-gray-300 rounded-lg px-2 py-1.5 text-xs text-gray-900 focus:outline-none" />
                  <input placeholder="Notes" value={newMat.notes}
                    onChange={e => setNewMat(p => ({ ...p, notes: e.target.value }))}
                    className="bg-gray-100 border border-gray-300 rounded-lg px-2 py-1.5 text-xs text-gray-900 focus:outline-none" />
                  <button onClick={handleAddMaterial} disabled={addingMat || !newMat.material_name.trim()}
                    className="text-xs bg-blue-600 hover:bg-blue-600 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg">
                    {addingMat ? '...' : 'Add'}
                  </button>
                </div>
              )}
            </div>

            {/* Projects Ordered From */}
            <div className="bg-white shadow-sm border border-gray-200 rounded-xl p-5">
              <h3 className="font-semibold text-sm text-gray-900 mb-2">Projects Ordered From</h3>
              <p className="text-xs text-gray-500">Supplier order history coming soon.</p>
            </div>
          </div>
        )}
      </div>

      {/* New Supplier Modal */}
      {showNew && (
        <NewSupplierModal
          onCreated={s => {
            setSuppliers(prev => [...prev, s].sort((a, b) => a.name.localeCompare(b.name)))
            setSelectedId(s.id)
            setShowNew(false)
          }}
          onClose={() => setShowNew(false)}
        />
      )}

      {/* Delete confirmation */}
      {confirmDelete && selected && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-white shadow-sm border border-gray-200 rounded-xl w-full max-w-sm p-6 space-y-4 shadow-2xl">
            <h3 className="font-semibold text-gray-900">Delete Supplier?</h3>
            <p className="text-sm text-gray-500">&ldquo;{selected.name}&rdquo; and all their material pricing will be deleted. This cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={handleDelete} disabled={deleting}
                className="flex-1 bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white font-semibold py-2 rounded-lg text-sm">
                {deleting ? 'Deleting...' : 'Delete Supplier'}
              </button>
              <button onClick={() => setConfirmDelete(false)}
                className="px-4 py-2 text-sm text-gray-500 hover:text-gray-900">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
