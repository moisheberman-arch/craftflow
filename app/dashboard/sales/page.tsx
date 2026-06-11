'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  getProjects, createProject, getCustomers, createCustomer,
  updateCustomer, getProjectsByCustomerId, updateProject,
  getPricingAddons, seedDefaultStepsIfEmpty, getCustomProjectTypes,
} from '@/lib/api/supabase-client'
import { supabase } from '@/lib/supabase'
import type { Project, ProjectStatus, Customer, ProjectType, PricingAddon, ContactPreferences, CustomProjectType } from '@/lib/core/types'

// ── Status config ──────────────────────────────────────────────────────────

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

// Sales-visible pipeline stages (not shop/completed)
const SALES_SECTIONS: ProjectStatus[] = [
  'lead',
  'tentative_quote_sent',
  'design_meeting_scheduled',
  'post_design_meeting',
  'rendering_in_progress',
  'final_quote_issued',
  'deposit_received',
]

// Full pipeline in canonical order — used for the inline status dropdown so the
// current status is always present and pre-selected even after auto-updates.
const ALL_STATUSES: ProjectStatus[] = [
  'lead',
  'tentative_quote_sent',
  'design_meeting_scheduled',
  'post_design_meeting',
  'rendering_in_progress',
  'final_quote_issued',
  'deposit_received',
  'in_production',
  'ready_for_delivery',
  'completed',
]

const PROJECT_TYPES: ProjectType[] = ['dining_table', 'built_in', 'bookcase', 'buffet', 'other']

// Badge colours per status (used in dropdown styling)
const STATUS_COLORS: Record<ProjectStatus, string> = {
  lead:                     'bg-gray-200 text-gray-800',
  tentative_quote_sent:     'bg-slate-700 text-slate-700',
  design_meeting_scheduled: 'bg-blue-100 text-blue-700',
  post_design_meeting:      'bg-indigo-100 text-indigo-700',
  rendering_in_progress:    'bg-purple-100 text-purple-700',
  final_quote_issued:       'bg-yellow-100 text-yellow-700',
  deposit_received:         'bg-green-100 text-green-700',
  in_production:            'bg-orange-100 text-orange-700',
  ready_for_delivery:       'bg-teal-100 text-teal-700',
  completed:                'bg-emerald-100 text-emerald-700',
}

// ── Customers Modal ────────────────────────────────────────────────────────

type CustModalState = 'list' | 'detail' | 'form'

function CustomersModal({
  onClose,
  onCustomersChanged,
  onNavigate,
}: {
  onClose: () => void
  onCustomersChanged: (customers: Customer[]) => void
  onNavigate: (path: string) => void
}) {
  const [state, setState] = useState<CustModalState>('list')
  const [customers, setCustomers] = useState<Customer[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [customerProjects, setCustomerProjects] = useState<Project[]>([])
  const [loadingProjects, setLoadingProjects] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formName, setFormName] = useState('')
  const [formPhone, setFormPhone] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formAddress, setFormAddress] = useState('')
  const [formPrefs, setFormPrefs] = useState<ContactPreferences>({})
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

  function openDetail(c: Customer) {
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
    setFormPrefs({})
    setFormError('')
    setState('form')
  }

  function openEdit(c: Customer) {
    setEditingId(c.id)
    setFormName(c.name); setFormPhone(c.phone ?? '')
    setFormEmail(c.email ?? ''); setFormAddress(c.address ?? '')
    setFormPrefs(c.contact_preferences ?? {})
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
          name: formName, phone: formPhone || null,
          email: formEmail || null, address: formAddress || null,
          contact_preferences: formPrefs,
        })
        const next = customers.map(c => c.id === editingId ? updated : c)
        setCustomers(next); onCustomersChanged(next)
      } else {
        const newC = await createCustomer({
          name: formName, phone: formPhone || null,
          email: formEmail || null, address: formAddress || null,
          contact_preferences: formPrefs,
        })
        const next = [...customers, newC].sort((a, b) => a.name.localeCompare(b.name))
        setCustomers(next); onCustomersChanged(next)
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
      <div className="bg-white shadow-sm border border-gray-200 rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
          <div className="flex items-center gap-3">
            {state !== 'list' && (
              <button onClick={() => setState('list')} className="text-gray-500 hover:text-gray-900 text-sm">← Back</button>
            )}
            <h2 className="font-semibold text-gray-900">
              {state === 'list' && 'Customers'}
              {state === 'detail' && selectedCustomer?.name}
              {state === 'form' && (editingId ? 'Edit Customer' : 'New Customer')}
            </h2>
          </div>
          <div className="flex items-center gap-3">
            {state === 'list' && (
              <button onClick={openNew}
                className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-3 py-1.5 rounded-lg text-sm">
                + New Customer
              </button>
            )}
            {state === 'detail' && (
              <button onClick={() => selectedCustomer && openEdit(selectedCustomer)}
                className="text-sm text-blue-600 hover:text-blue-500">Edit</button>
            )}
            <button onClick={onClose} className="text-gray-500 hover:text-gray-900 text-xl leading-none">×</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* ── List ── */}
          {state === 'list' && (
            <div className="p-4">
              <input placeholder="Search customers..." value={search} onChange={e => setSearch(e.target.value)}
                className="w-full bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 mb-4 focus:outline-none focus:ring-1 focus:ring-blue-500" />
              {loading ? (
                <div className="text-center py-8 text-gray-500">Loading...</div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-8 text-gray-500">No customers found</div>
              ) : (
                /* Fix 2: Use divs instead of table so row clicks are completely reliable */
                <div className="space-y-0.5">
                  {/* Header row */}
                  <div className="grid grid-cols-[1fr_120px_160px_80px] px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wide border-b border-gray-200">
                    <span>Name</span><span>Phone</span><span>Email</span><span className="text-right">Actions</span>
                  </div>
                  {filtered.map(c => (
                    <div
                      key={c.id}
                      className="grid grid-cols-[1fr_120px_160px_80px] items-center px-3 py-3 rounded-lg hover:bg-blue-50 cursor-pointer border-b border-gray-200/50 last:border-0 group"
                      onClick={() => openDetail(c)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') openDetail(c) }}
                    >
                      <span className="text-sm font-medium text-gray-900">{c.name}</span>
                      <span className="text-sm text-gray-500">{c.phone ?? '—'}</span>
                      <span className="text-sm text-gray-500 truncate">{c.email ?? '—'}</span>
                      {/* Fix 2: action buttons stop propagation */}
                      <div
                        className="flex items-center justify-end gap-3"
                        onClick={e => e.stopPropagation()}
                      >
                        <button onClick={() => openEdit(c)} className="text-gray-500 hover:text-gray-900 text-xs">Edit</button>
                        <button onClick={() => handleDeleteCustomer(c.id)} className="text-red-600 hover:text-red-600 text-xs">Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Detail ── */}
          {state === 'detail' && selectedCustomer && (
            <div className="p-6 space-y-5">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><p className="text-gray-500 mb-0.5">Phone</p><p>{selectedCustomer.phone ?? '—'}</p></div>
                <div><p className="text-gray-500 mb-0.5">Email</p><p>{selectedCustomer.email ?? '—'}</p></div>
                <div className="col-span-2"><p className="text-gray-500 mb-0.5">Address</p><p>{selectedCustomer.address ?? '—'}</p></div>
                {selectedCustomer.contact_preferences && Object.values(selectedCustomer.contact_preferences).some(Boolean) && (
                  <div className="col-span-2">
                    <p className="text-gray-500 mb-1">Contact Preference</p>
                    <div className="flex gap-1.5">
                      {selectedCustomer.contact_preferences.call && <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">📞 Call</span>}
                      {selectedCustomer.contact_preferences.text && <span className="text-[10px] font-semibold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">💬 Text</span>}
                      {selectedCustomer.contact_preferences.whatsapp && <span className="text-[10px] font-semibold bg-green-100 text-green-700 px-1.5 py-0.5 rounded">📱 WhatsApp</span>}
                    </div>
                  </div>
                )}
              </div>
              <div>
                <h3 className="font-semibold mb-3 text-sm text-gray-700">Projects</h3>
                {loadingProjects ? (
                  <p className="text-gray-500 text-sm">Loading...</p>
                ) : customerProjects.length === 0 ? (
                  <p className="text-gray-500 text-sm">No projects yet</p>
                ) : (
                  <div className="space-y-2">
                    {customerProjects.map(p => (
                      <button key={p.id}
                        onClick={() => { onClose(); onNavigate(`/dashboard/projects/${p.id}?view=sales`) }}
                        className="w-full text-left bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded-lg px-4 py-3 transition-colors">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium capitalize">{p.project_type?.replace(/_/g, ' ') ?? 'New Project'}</span>
                          <span className="text-xs text-gray-500">{p.status ? STATUS_LABELS[p.status] : '—'}</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">{new Date(p.updated_at).toLocaleDateString()}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Form ── */}
          {state === 'form' && (
            <form onSubmit={handleFormSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs text-gray-500 mb-1">Full Name *</label>
                  <input required value={formName} onChange={e => setFormName(e.target.value)}
                    className="w-full bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Phone</label>
                  <input value={formPhone} onChange={e => setFormPhone(e.target.value)}
                    className="w-full bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Email</label>
                  <input type="email" value={formEmail} onChange={e => setFormEmail(e.target.value)}
                    className="w-full bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs text-gray-500 mb-1">Address</label>
                  <input value={formAddress} onChange={e => setFormAddress(e.target.value)}
                    className="w-full bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs text-gray-500 mb-1">Preferred Contact</label>
                  <div className="flex gap-3">
                    {(['call', 'text', 'whatsapp'] as const).map(pref => (
                      <label key={pref} className="flex items-center gap-1.5 cursor-pointer">
                        <input type="checkbox" checked={!!formPrefs[pref]}
                          onChange={e => setFormPrefs(p => ({ ...p, [pref]: e.target.checked }))}
                          className="accent-blue-600 w-3.5 h-3.5" />
                        <span className="text-sm text-gray-700 capitalize">{pref === 'whatsapp' ? 'WhatsApp' : pref.charAt(0).toUpperCase() + pref.slice(1)}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              {formError && <p className="text-red-600 text-sm">{formError}</p>}
              <div className="flex gap-3">
                <button type="submit" disabled={formSaving || !formName}
                  className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold px-5 py-2 rounded-lg text-sm">
                  {formSaving ? 'Saving...' : 'Save Customer'}
                </button>
                <button type="button" onClick={() => setState('list')} className="text-gray-500 hover:text-gray-900 text-sm">Cancel</button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

// ── New Project Modal (multi-step, no navigation) ──────────────────────────

type NewProjectStep = 'customer' | 'details'

function NewProjectModal({
  customers,
  customTypes,
  onClose,
  onCreated,
}: {
  customers: Customer[]
  customTypes: CustomProjectType[]
  onClose: () => void
  onCreated: (project: Project, newCustomer?: Customer) => void
}) {
  const [step, setStep] = useState<NewProjectStep>('customer')
  const [mode, setMode] = useState<'existing' | 'new'>('new')

  // Step 1 — customer
  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [newName, setNewName] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newAddress, setNewAddress] = useState('')

  // Step 2 — project details
  const [projectType, setProjectType] = useState<ProjectType | ''>('')
  const [address, setAddress] = useState('')
  const [notes, setNotes] = useState('')
  const [primaryMaterial, setPrimaryMaterial] = useState('')

  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  function canProceedStep1() {
    if (mode === 'existing') return true // customer optional
    return !!newName.trim()
  }

  function handleNext(e: React.FormEvent) {
    e.preventDefault()
    if (!canProceedStep1()) return
    // Pre-fill address from customer if selecting existing
    if (mode === 'existing' && selectedCustomerId) {
      const found = customers.find(c => c.id === selectedCustomerId)
      if (found?.address) setAddress(found.address)
    } else if (mode === 'new' && newAddress) {
      setAddress(newAddress)
    }
    setStep('details')
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    setError('')
    try {
      let customerId: string | null = null
      let newCustomer: Customer | undefined

      if (mode === 'existing') {
        customerId = selectedCustomerId || null
      } else {
        newCustomer = await createCustomer({
          name: newName,
          phone: newPhone || null,
          email: newEmail || null,
          address: newAddress || null,
        })
        customerId = newCustomer.id
      }

      const project = await createProject({
        customer_id: customerId,
        project_type: (projectType as ProjectType) || null,
        status: 'lead',
        address: address || null,
        notes: notes || null,
        primary_material: primaryMaterial || null,
        requested_addons: [],
        required_fields_completed: {
          customer_info: !!customerId,
          project_type: !!projectType,
          color_finish: false,
          quote_issued: false,
        },
      })

      onCreated(project, newCustomer)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white shadow-sm border border-gray-200 rounded-xl w-full max-w-md shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            {step === 'details' && (
              <button onClick={() => setStep('customer')} className="text-gray-500 hover:text-gray-900 text-sm">← Back</button>
            )}
            <h2 className="font-semibold text-gray-900">
              {step === 'customer' ? 'New Project — Customer' : 'New Project — Details'}
            </h2>
          </div>
          <div className="flex items-center gap-3">
            {/* Step indicator */}
            <div className="flex items-center gap-1">
              <span className={`w-2 h-2 rounded-full ${step === 'customer' ? 'bg-blue-600' : 'bg-gray-300'}`} />
              <span className={`w-2 h-2 rounded-full ${step === 'details' ? 'bg-blue-600' : 'bg-gray-300'}`} />
            </div>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-900 text-xl leading-none">×</button>
          </div>
        </div>

        {/* Step 1: Customer */}
        {step === 'customer' && (
          <form onSubmit={handleNext} className="p-5 space-y-4">
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
              <button type="button" onClick={() => setMode('existing')}
                className={`flex-1 py-1.5 text-sm rounded-md transition-colors ${mode === 'existing' ? 'bg-gray-200 text-gray-900' : 'text-gray-500 hover:text-gray-900'}`}>
                Select Existing
              </button>
              <button type="button" onClick={() => setMode('new')}
                className={`flex-1 py-1.5 text-sm rounded-md transition-colors ${mode === 'new' ? 'bg-gray-200 text-gray-900' : 'text-gray-500 hover:text-gray-900'}`}>
                Create New
              </button>
            </div>

            {mode === 'existing' ? (
              <select value={selectedCustomerId} onChange={e => setSelectedCustomerId(e.target.value)}
                className="w-full bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">— No customer yet —</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            ) : (
              <div className="space-y-2">
                <input required placeholder="Full name *" value={newName} onChange={e => setNewName(e.target.value)}
                  className="w-full bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <input placeholder="Phone" value={newPhone} onChange={e => setNewPhone(e.target.value)}
                  className="w-full bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <input placeholder="Email" type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)}
                  className="w-full bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <input placeholder="Address" value={newAddress} onChange={e => setNewAddress(e.target.value)}
                  className="w-full bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button type="submit" disabled={mode === 'new' && !newName.trim()}
                className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold py-2 rounded-lg text-sm">
                Next →
              </button>
              <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-900">Cancel</button>
            </div>
          </form>
        )}

        {/* Step 2: Project Details */}
        {step === 'details' && (
          <form onSubmit={handleCreate} className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-xs text-gray-500 mb-1">Project Type</label>
                <select value={projectType} onChange={e => setProjectType(e.target.value as ProjectType)}
                  className="w-full bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">— Select type —</option>
                  {PROJECT_TYPES.map(t => <option key={t} value={t} className="capitalize">{t.replace(/_/g, ' ')}</option>)}
                  {customTypes.filter(ct => ct.is_active).map(ct => <option key={ct.key} value={ct.key}>{ct.name}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-gray-500 mb-1">Primary Material</label>
                <select value={primaryMaterial} onChange={e => setPrimaryMaterial(e.target.value)}
                  className="w-full bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">— Select material —</option>
                  {['Maple', 'Walnut', 'Oak', 'Cherry', 'Painted MDF', 'Other'].map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-gray-500 mb-1">Address</label>
                <input value={address} onChange={e => setAddress(e.target.value)} placeholder="Job site address"
                  className="w-full bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-gray-500 mb-1">Notes</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Any initial notes..."
                  className="w-full bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              </div>
            </div>
            {error && <p className="text-red-600 text-sm">{error}</p>}
            <div className="flex gap-2 pt-1">
              <button type="submit" disabled={creating}
                className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold py-2 rounded-lg text-sm">
                {creating ? 'Creating...' : 'Create Project'}
              </button>
              <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-900">Cancel</button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

// ── Inline Status Badge Dropdown ───────────────────────────────────────────

function StatusBadgeSelect({
  projectId,
  currentStatus,
  onStatusChanged,
}: {
  projectId: string
  currentStatus: ProjectStatus | null
  onStatusChanged: (id: string, newStatus: ProjectStatus) => void
}) {
  const [saving, setSaving] = useState(false)

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    e.stopPropagation()
    const newStatus = e.target.value as ProjectStatus
    if (!newStatus || newStatus === currentStatus) return
    setSaving(true)
    try {
      await updateProject(projectId, { status: newStatus })
      onStatusChanged(projectId, newStatus)
      if (newStatus === 'deposit_received') {
        seedDefaultStepsIfEmpty(projectId).catch(console.error)
      }
    } catch (err) {
      console.error('Status update failed', err)
    } finally {
      setSaving(false)
    }
  }

  const colorClass = currentStatus ? STATUS_COLORS[currentStatus] : 'bg-gray-200 text-gray-700'

  return (
    <div className="relative inline-block" onClick={e => e.stopPropagation()}>
      <select
        value={currentStatus ?? ''}
        onChange={handleChange}
        disabled={saving}
        className={`appearance-none text-xs font-semibold px-2.5 py-1 rounded-full pr-6 cursor-pointer border-0 focus:outline-none focus:ring-1 focus:ring-white/30 disabled:opacity-60 ${colorClass}`}
        style={{ backgroundImage: 'none' }}
        title="Change status"
      >
        {ALL_STATUSES.map(s => (
          <option key={s} value={s}>{STATUS_LABELS[s]}</option>
        ))}
      </select>
      {/* Caret icon */}
      <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] opacity-70">▾</span>
    </div>
  )
}

// ── Sales Dashboard ────────────────────────────────────────────────────────

export default function SalesDashboard() {
  const router = useRouter()
  const [projects, setProjects] = useState<Project[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [customTypes, setCustomTypes] = useState<CustomProjectType[]>([])
  const [loading, setLoading] = useState(true)
  const [showNewProject, setShowNewProject] = useState(false)
  const [showCustomers, setShowCustomers] = useState(false)
  const [navigateTo, setNavigateTo] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([getProjects(), getCustomers(), getCustomProjectTypes().catch(() => [] as CustomProjectType[])])
      .then(([p, c, ct]) => { setProjects(p); setCustomers(c); setCustomTypes(ct) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  // Customer modal navigates by setting state, then we use Link or window
  useEffect(() => {
    if (navigateTo) {
      window.location.href = navigateTo
    }
  }, [navigateTo])

  // Project created — navigate directly to project overview
  function handleProjectCreated(project: Project, newCustomer?: Customer) {
    const withCustomer: Project = {
      ...project,
      customer: newCustomer ?? customers.find(c => c.id === project.customer_id),
    }
    setProjects(prev => [withCustomer, ...prev])
    if (newCustomer) {
      setCustomers(prev => [...prev, newCustomer].sort((a, b) => a.name.localeCompare(b.name)))
    }
    setShowNewProject(false)
    router.push(`/dashboard/projects/${project.id}?view=sales`)
  }

  // Fix 3: inline status change — update state so project re-groups instantly
  function handleStatusChanged(projectId: string, newStatus: ProjectStatus) {
    setProjects(prev => prev.map(p => p.id === projectId ? { ...p, status: newStatus } : p))
  }

  const byStatus = (status: ProjectStatus) =>
    projects.filter(p => p.status === status)
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())

  const salesProjects = projects.filter(p => SALES_SECTIONS.includes(p.status as ProjectStatus))

  return (
    <div>
      {showCustomers && (
        <CustomersModal
          onClose={() => setShowCustomers(false)}
          onCustomersChanged={setCustomers}
          onNavigate={path => { setShowCustomers(false); setNavigateTo(path) }}
        />
      )}

      {showNewProject && (
        <NewProjectModal
          customers={customers}
          customTypes={customTypes}
          onClose={() => setShowNewProject(false)}
          onCreated={handleProjectCreated}
        />
      )}

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Sales Dashboard</h1>
        <div className="flex items-center gap-3">
          <button onClick={() => setShowCustomers(true)}
            className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
            Customers
          </button>
          <button onClick={() => setShowNewProject(true)}
            className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-4 py-2 rounded-lg transition-colors text-sm">
            + New Project
          </button>
        </div>
      </div>

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
                  <h2 className="font-bold text-gray-900">{STATUS_LABELS[status]}</h2>
                  <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{group.length}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {group.map(project => (
                    <div
                      key={project.id}
                      onClick={() => router.push(`/dashboard/projects/${project.id}?view=sales`)}
                      className="bg-white shadow-sm border border-gray-200 rounded-xl p-4 flex flex-col gap-2.5 hover:border-gray-300 transition-colors cursor-pointer"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-900 text-sm truncate">
                            {project.customer?.name ?? <span className="text-gray-500 italic">No customer</span>}
                          </p>
                          <p className="text-xs text-gray-500 capitalize mt-0.5">
                            {project.project_type?.replace(/_/g, ' ') ?? '—'}
                          </p>
                        </div>
                        <StatusBadgeSelect
                          projectId={project.id}
                          currentStatus={project.status}
                          onStatusChanged={handleStatusChanged}
                        />
                      </div>
                      <div className="flex items-center justify-between mt-auto">
                        <span className="text-xs text-gray-400">
                          {new Date(project.updated_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  ))}
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
