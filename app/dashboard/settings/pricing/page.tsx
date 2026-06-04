'use client'

import { useEffect, useState } from 'react'
import {
  getPricingMaterials, addPricingMaterial, updatePricingMaterial, deletePricingMaterial,
  getPricingAddons, addPricingAddon, updatePricingAddon, deletePricingAddon,
} from '@/lib/api/supabase-client'
import type { PricingMaterial, PricingAddon, MaterialCategory } from '@/lib/core/types'

const MATERIAL_CATEGORIES: MaterialCategory[] = ['wood', 'hardware', 'finish', 'trim', 'lighting', 'other']
const UNITS = ['per sheet', 'per linear foot', 'per board foot', 'per unit', 'per pair', 'per gallon', 'per door', 'per opening', 'flat rate']

type Tab = 'materials' | 'addons'

function InlineEditCell({
  value,
  onSave,
  type = 'text',
  className = '',
}: {
  value: string
  onSave: (v: string) => void
  type?: string
  className?: string
}) {
  const [editing, setEditing] = useState(false)
  const [local, setLocal] = useState(value)

  function commit() {
    setEditing(false)
    if (local !== value) onSave(local)
  }

  if (!editing) {
    return (
      <span
        className={`cursor-pointer hover:text-amber-400 transition-colors ${className}`}
        onClick={() => { setLocal(value); setEditing(true) }}
      >
        {value || <span className="text-gray-600 italic">—</span>}
      </span>
    )
  }
  return (
    <input
      autoFocus
      type={type}
      value={local}
      onChange={e => setLocal(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
      className="bg-gray-800 border border-amber-500 rounded px-2 py-0.5 text-sm text-white w-full focus:outline-none"
    />
  )
}

function InlineSelectCell({
  value,
  options,
  onSave,
}: {
  value: string
  options: string[]
  onSave: (v: string) => void
}) {
  return (
    <select
      value={value}
      onChange={e => onSave(e.target.value)}
      className="bg-gray-800 border border-gray-700 rounded px-2 py-0.5 text-sm text-white focus:outline-none focus:border-amber-500"
    >
      <option value="">—</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}

export default function PricingConfigPage() {
  const [tab, setTab] = useState<Tab>('materials')
  const [materials, setMaterials] = useState<PricingMaterial[]>([])
  const [addons, setAddons] = useState<PricingAddon[]>([])
  const [loading, setLoading] = useState(true)

  // Add material form
  const [showAddMat, setShowAddMat] = useState(false)
  const [matName, setMatName] = useState('')
  const [matCategory, setMatCategory] = useState<MaterialCategory | ''>('')
  const [matUnit, setMatUnit] = useState('')
  const [matUnitPrice, setMatUnitPrice] = useState('')
  const [matFlat, setMatFlat] = useState('')
  const [matNotes, setMatNotes] = useState('')
  const [savingMat, setSavingMat] = useState(false)
  const [matError, setMatError] = useState('')

  // Add addon form
  const [showAddAddon, setShowAddAddon] = useState(false)
  const [addonName, setAddonName] = useState('')
  const [addonUnit, setAddonUnit] = useState('')
  const [addonUnitPrice, setAddonUnitPrice] = useState('')
  const [addonFlat, setAddonFlat] = useState('')
  const [addonNotes, setAddonNotes] = useState('')
  const [savingAddon, setSavingAddon] = useState(false)
  const [addonError, setAddonError] = useState('')

  useEffect(() => {
    Promise.all([getPricingMaterials(), getPricingAddons()])
      .then(([m, a]) => { setMaterials(m); setAddons(a) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  // Material mutations
  async function saveMat(id: string, patch: Partial<Omit<PricingMaterial, 'id' | 'created_at'>>) {
    const updated = await updatePricingMaterial(id, patch)
    setMaterials(prev => prev.map(m => m.id === id ? updated : m))
  }

  async function handleAddMat(e: React.FormEvent) {
    e.preventDefault()
    setSavingMat(true)
    setMatError('')
    try {
      const m = await addPricingMaterial({
        name: matName,
        category: (matCategory as MaterialCategory) || null,
        unit: matUnit || null,
        unit_price: matUnitPrice ? parseFloat(matUnitPrice) : null,
        typical_flat_rate: matFlat ? parseFloat(matFlat) : null,
        notes: matNotes || null,
      })
      setMaterials(prev => [...prev, m])
      setShowAddMat(false)
      setMatName(''); setMatCategory(''); setMatUnit(''); setMatUnitPrice(''); setMatFlat(''); setMatNotes('')
    } catch (err) {
      setMatError(err instanceof Error ? err.message : 'Failed to save. Run migration 002 in Supabase if tables are missing.')
    } finally {
      setSavingMat(false)
    }
  }

  async function handleDeleteMat(id: string) {
    await deletePricingMaterial(id)
    setMaterials(prev => prev.filter(m => m.id !== id))
  }

  // Addon mutations
  async function saveAddon(id: string, patch: Partial<Omit<PricingAddon, 'id' | 'created_at'>>) {
    const updated = await updatePricingAddon(id, patch)
    setAddons(prev => prev.map(a => a.id === id ? updated : a))
  }

  async function handleAddAddon(e: React.FormEvent) {
    e.preventDefault()
    setSavingAddon(true)
    setAddonError('')
    try {
      const a = await addPricingAddon({
        name: addonName,
        unit: addonUnit || null,
        unit_price: addonUnitPrice ? parseFloat(addonUnitPrice) : null,
        typical_flat_rate: addonFlat ? parseFloat(addonFlat) : null,
        notes: addonNotes || null,
      })
      setAddons(prev => [...prev, a])
      setShowAddAddon(false)
      setAddonName(''); setAddonUnit(''); setAddonUnitPrice(''); setAddonFlat(''); setAddonNotes('')
    } catch (err) {
      setAddonError(err instanceof Error ? err.message : 'Failed to save. Run migration 002 in Supabase if tables are missing.')
    } finally {
      setSavingAddon(false)
    }
  }

  async function handleDeleteAddon(id: string) {
    await deletePricingAddon(id)
    setAddons(prev => prev.filter(a => a.id !== id))
  }

  if (loading) return <div className="text-center py-8 text-gray-500">Loading...</div>

  return (
    <div className="max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Pricing Configuration</h1>

      <div className="flex gap-1 mb-6 border-b border-gray-800">
        {(['materials', 'addons'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
              tab === t ? 'border-amber-500 text-amber-400' : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            {t === 'materials' ? 'Materials' : 'Add-Ons & Features'}
          </button>
        ))}
      </div>

      {/* ── Materials Tab ── */}
      {tab === 'materials' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-gray-400">Click any cell to edit inline. Changes save immediately.</p>
            <button
              onClick={() => setShowAddMat(true)}
              className="bg-amber-500 hover:bg-amber-400 text-gray-950 font-semibold px-4 py-2 rounded-lg text-sm"
            >
              + Add Material
            </button>
          </div>

          {showAddMat && (
            <form onSubmit={handleAddMat} className="bg-gray-900 border border-amber-500/40 rounded-xl p-4 space-y-3">
              <h3 className="text-sm font-medium text-gray-300">New Material</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <input required placeholder="Name *" value={matName} onChange={e => setMatName(e.target.value)}
                  className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-amber-500" />
                <select value={matCategory} onChange={e => setMatCategory(e.target.value as MaterialCategory)}
                  className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-amber-500">
                  <option value="">Category</option>
                  {MATERIAL_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <select value={matUnit} onChange={e => setMatUnit(e.target.value)}
                  className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-amber-500">
                  <option value="">Unit</option>
                  {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
                <input type="number" placeholder="Unit Price" value={matUnitPrice} onChange={e => setMatUnitPrice(e.target.value)}
                  className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-amber-500" />
                <input type="number" placeholder="Typical Flat Rate" value={matFlat} onChange={e => setMatFlat(e.target.value)}
                  className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-amber-500" />
                <input placeholder="Notes" value={matNotes} onChange={e => setMatNotes(e.target.value)}
                  className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-amber-500" />
              </div>
              {matError && <p className="text-red-400 text-xs">{matError}</p>}
              <div className="flex gap-2">
                <button type="submit" disabled={savingMat || !matName}
                  className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-gray-950 font-semibold px-4 py-2 rounded-lg text-sm">
                  {savingMat ? 'Saving...' : 'Add Material'}
                </button>
                <button type="button" onClick={() => { setShowAddMat(false); setMatError('') }} className="text-gray-400 hover:text-white text-sm px-3">Cancel</button>
              </div>
            </form>
          )}

          <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-left">
                  <th className="px-4 py-3 text-gray-400 font-medium">Name</th>
                  <th className="px-4 py-3 text-gray-400 font-medium">Category</th>
                  <th className="px-4 py-3 text-gray-400 font-medium">Unit</th>
                  <th className="px-4 py-3 text-gray-400 font-medium">Unit Price</th>
                  <th className="px-4 py-3 text-gray-400 font-medium">Flat Rate</th>
                  <th className="px-4 py-3 text-gray-400 font-medium">Notes</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {materials.map(m => (
                  <tr key={m.id} className="border-b border-gray-800 last:border-0 hover:bg-gray-800/30">
                    <td className="px-4 py-3">
                      <InlineEditCell value={m.name} onSave={v => saveMat(m.id, { name: v })} />
                    </td>
                    <td className="px-4 py-3">
                      <InlineSelectCell
                        value={m.category ?? ''}
                        options={MATERIAL_CATEGORIES}
                        onSave={v => saveMat(m.id, { category: v as MaterialCategory || null })}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <InlineSelectCell
                        value={m.unit ?? ''}
                        options={UNITS}
                        onSave={v => saveMat(m.id, { unit: v || null })}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <InlineEditCell
                        value={m.unit_price != null ? String(m.unit_price) : ''}
                        type="number"
                        onSave={v => saveMat(m.id, { unit_price: v ? parseFloat(v) : null })}
                        className="font-mono"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <InlineEditCell
                        value={m.typical_flat_rate != null ? String(m.typical_flat_rate) : ''}
                        type="number"
                        onSave={v => saveMat(m.id, { typical_flat_rate: v ? parseFloat(v) : null })}
                        className="font-mono"
                      />
                    </td>
                    <td className="px-4 py-3 text-gray-400">
                      <InlineEditCell value={m.notes ?? ''} onSave={v => saveMat(m.id, { notes: v || null })} />
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => handleDeleteMat(m.id)} className="text-red-400 hover:text-red-300 text-xs">Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Add-Ons Tab ── */}
      {tab === 'addons' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-gray-400">Click any cell to edit inline. Changes save immediately.</p>
            <button
              onClick={() => setShowAddAddon(true)}
              className="bg-amber-500 hover:bg-amber-400 text-gray-950 font-semibold px-4 py-2 rounded-lg text-sm"
            >
              + Add Feature
            </button>
          </div>

          {showAddAddon && (
            <form onSubmit={handleAddAddon} className="bg-gray-900 border border-amber-500/40 rounded-xl p-4 space-y-3">
              <h3 className="text-sm font-medium text-gray-300">New Add-On / Feature</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <input required placeholder="Name *" value={addonName} onChange={e => setAddonName(e.target.value)}
                  className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-amber-500" />
                <select value={addonUnit} onChange={e => setAddonUnit(e.target.value)}
                  className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-amber-500">
                  <option value="">Unit</option>
                  {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
                <input type="number" placeholder="Unit Price" value={addonUnitPrice} onChange={e => setAddonUnitPrice(e.target.value)}
                  className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-amber-500" />
                <input type="number" placeholder="Typical Flat Rate" value={addonFlat} onChange={e => setAddonFlat(e.target.value)}
                  className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-amber-500" />
                <input placeholder="Notes" value={addonNotes} onChange={e => setAddonNotes(e.target.value)}
                  className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-amber-500 col-span-2" />
              </div>
              {addonError && <p className="text-red-400 text-xs">{addonError}</p>}
              <div className="flex gap-2">
                <button type="submit" disabled={savingAddon || !addonName}
                  className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-gray-950 font-semibold px-4 py-2 rounded-lg text-sm">
                  {savingAddon ? 'Saving...' : 'Add Feature'}
                </button>
                <button type="button" onClick={() => { setShowAddAddon(false); setAddonError('') }} className="text-gray-400 hover:text-white text-sm px-3">Cancel</button>
              </div>
            </form>
          )}

          <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-left">
                  <th className="px-4 py-3 text-gray-400 font-medium">Name</th>
                  <th className="px-4 py-3 text-gray-400 font-medium">Unit</th>
                  <th className="px-4 py-3 text-gray-400 font-medium">Unit Price</th>
                  <th className="px-4 py-3 text-gray-400 font-medium">Typical Flat Rate</th>
                  <th className="px-4 py-3 text-gray-400 font-medium">Notes</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {addons.map(a => (
                  <tr key={a.id} className="border-b border-gray-800 last:border-0 hover:bg-gray-800/30">
                    <td className="px-4 py-3">
                      <InlineEditCell value={a.name} onSave={v => saveAddon(a.id, { name: v })} />
                    </td>
                    <td className="px-4 py-3">
                      <InlineSelectCell value={a.unit ?? ''} options={UNITS} onSave={v => saveAddon(a.id, { unit: v || null })} />
                    </td>
                    <td className="px-4 py-3">
                      <InlineEditCell
                        value={a.unit_price != null ? String(a.unit_price) : ''}
                        type="number"
                        onSave={v => saveAddon(a.id, { unit_price: v ? parseFloat(v) : null })}
                        className="font-mono"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <InlineEditCell
                        value={a.typical_flat_rate != null ? String(a.typical_flat_rate) : ''}
                        type="number"
                        onSave={v => saveAddon(a.id, { typical_flat_rate: v ? parseFloat(v) : null })}
                        className="font-mono"
                      />
                    </td>
                    <td className="px-4 py-3 text-gray-400">
                      <InlineEditCell value={a.notes ?? ''} onSave={v => saveAddon(a.id, { notes: v || null })} />
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => handleDeleteAddon(a.id)} className="text-red-400 hover:text-red-300 text-xs">Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
