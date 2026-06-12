'use client'

import { useEffect, useState } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import ShopView from './ShopView'
import WorkflowPanel from '@/components/WorkflowPanel'
import { seedDefaultStepsIfEmpty, initializeProjectWorkflow } from '@/lib/api/supabase-client'
import {
  getProjectById, updateProject, getCustomers,
  getMaterialsByProjectId, addMaterial, updateMaterial, deleteMaterial,
  getStepsByProjectId, addStep, updateStep, deleteStep,
  getStepLibrary, addStepToLibrary,
  getQuoteByProjectId, createQuote, updateQuote,
  getNotesByProjectId, addDesignMeetingNote, deleteNote,
  getPricingAddons, deleteProject, getProjectCountByCustomerId, deleteCustomer,
  getFieldsByProjectType, getAnswersByProjectId, saveAllAnswers,
  getFilesByProjectId, uploadProjectFile, getProjectFileUrl, deleteProjectFile,
  getCustomProjectTypes,
  createApprovalRequest, getApprovalsByProjectId,
  getSamplesByProjectId, createSample, updateSample, deleteSample,
} from '@/lib/api/supabase-client'
import type {
  Project, Customer, MaterialItem, ProductionStep, StepLibraryItem,
  Quote, ProjectStatus, ProjectType, DesignMeetingNote, PricingAddon,
  ProjectTypeField, ProjectTypeAnswer, ProjectFile, CustomProjectType,
  CustomerApproval, ApprovalType, Sample, SampleType,
} from '@/lib/core/types'

const APPROVAL_BASE_URL = 'https://craftflow-six.vercel.app/approve'

function approvalStatus(a: CustomerApproval): 'Approved' | 'Expired' | 'Pending' {
  if (a.approved) return 'Approved'
  if (a.expires_at && new Date(a.expires_at).getTime() < Date.now()) return 'Expired'
  return 'Pending'
}

const PROJECT_TYPES: ProjectType[] = ['dining_table', 'built_in', 'bookcase', 'buffet', 'bar', 'desk', 'other']
const STATUSES: ProjectStatus[] = [
  'lead', 'tentative_quote_sent', 'design_meeting_scheduled',
  'post_design_meeting', 'rendering_in_progress', 'final_quote_issued',
  'deposit_received', 'in_production', 'ready_for_delivery', 'completed',
]

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

const QUOTE_STATUS_COLORS = {
  initial: 'bg-gray-200 text-gray-800',
  revised: 'bg-blue-100 text-blue-700',
  final: 'bg-emerald-100 text-emerald-700',
}

// Fix 2: sample type config
const SAMPLE_TYPES: { value: SampleType; label: string }[] = [
  { value: 'wood_species', label: 'Wood Species' },
  { value: 'stain_color', label: 'Stain Color' },
  { value: 'paint_color', label: 'Paint Color' },
  { value: 'hardware', label: 'Hardware' },
  { value: 'other', label: 'Other' },
]

const SAMPLE_TYPE_COLORS: Record<SampleType, string> = {
  wood_species: 'bg-amber-100 text-amber-700',
  stain_color: 'bg-purple-100 text-purple-700',
  paint_color: 'bg-blue-100 text-blue-700',
  hardware: 'bg-gray-200 text-gray-700',
  other: 'bg-teal-100 text-teal-700',
}

function sampleTypeLabel(t: SampleType): string {
  return SAMPLE_TYPES.find(s => s.value === t)?.label ?? t
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

// Fix 3: stage-aware alert logic (new pipeline)
function getStageAlerts(project: Project): string[] {
  const status = project.status
  const rf = project.required_fields_completed
  const hasCustomer = !!project.customer_id
  const hasContactInfo = hasCustomer && rf.customer_info
  const hasPrimaryMaterial = !!project.primary_material

  if (!status || status === 'lead' || status === 'tentative_quote_sent' || status === 'completed') return []

  if (status === 'design_meeting_scheduled') {
    return hasContactInfo ? [] : ['Customer contact info is missing']
  }
  if (status === 'post_design_meeting') {
    const alerts = []
    if (!hasContactInfo) alerts.push('Customer contact info is missing')
    if (!hasPrimaryMaterial) alerts.push('Primary material has not been selected')
    return alerts
  }
  if (status === 'rendering_in_progress' || status === 'final_quote_issued' || status === 'deposit_received') {
    return hasPrimaryMaterial ? [] : ['Primary material has not been selected']
  }
  return []
}

type Tab = 'overview' | 'materials' | 'steps' | 'quote' | 'files'

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  // Bug 3: determine which tabs to show based on ?view param
  const view = searchParams.get('view') ?? 'sales'
  const isShopView = view === 'shop'
  const visibleTabs: Tab[] = isShopView
    ? ['overview', 'materials', 'steps', 'quote', 'files']
    : ['overview', 'materials', 'quote', 'files']

  const router = useRouter()
  const [tab, setTab] = useState<Tab>('overview')
  const [project, setProject] = useState<Project | null>(null)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [materials, setMaterials] = useState<MaterialItem[]>([])
  const [steps, setSteps] = useState<ProductionStep[]>([])
  const [stepLibrary, setStepLibrary] = useState<StepLibraryItem[]>([])
  const [quote, setQuote] = useState<Quote | null>(null)
  const [designNotes, setDesignNotes] = useState<DesignMeetingNote[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showDeleteCustomer, setShowDeleteCustomer] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Pricing addons (for preferences checklist)
  const [pricingAddons, setPricingAddons] = useState<PricingAddon[]>([])
  // Project type fields
  const [typeFields, setTypeFields] = useState<ProjectTypeField[]>([])
  const [typeAnswers, setTypeAnswers] = useState<Record<string, string>>({})
  const [savingAnswers, setSavingAnswers] = useState(false)
  const [answersSaved, setAnswersSaved] = useState(false)

  // Files
  const [files, setFiles] = useState<ProjectFile[]>([])
  const [uploadingFile, setUploadingFile] = useState(false)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)

  // Custom project types
  const [customTypes, setCustomTypes] = useState<CustomProjectType[]>([])

  // Fix 2: Samples
  const [samples, setSamples] = useState<Sample[]>([])
  const [showSampleForm, setShowSampleForm] = useState(false)
  const [sampleType, setSampleType] = useState<SampleType>('wood_species')
  const [sampleDesc, setSampleDesc] = useState('')
  const [sampleDate, setSampleDate] = useState(todayStr())
  const [sampleNotes, setSampleNotes] = useState('')
  const [savingSample, setSavingSample] = useState(false)

  // Manual quote state
  const [showManualQuote, setShowManualQuote] = useState(false)
  const [manualLineItems, setManualLineItems] = useState<{ desc: string; amount: string }[]>([{ desc: '', amount: '' }])
  const [manualMarkup, setManualMarkup] = useState('65')
  const [savingManual, setSavingManual] = useState(false)

  // Overview form state
  const [customerId, setCustomerId] = useState('')
  const [projectType, setProjectType] = useState<ProjectType | ''>('')
  const [status, setStatus] = useState<ProjectStatus | ''>('')
  const [address, setAddress] = useState('')
  const [notes, setNotes] = useState('')

  // Customer Preferences state
  const [primaryMaterial, setPrimaryMaterial] = useState('')
  const [requestedAddons, setRequestedAddons] = useState<string[]>([])
  const [prefNotes, setPrefNotes] = useState('')

  // Material form state
  const [newItemName, setNewItemName] = useState('')
  const [newItemCost, setNewItemCost] = useState('')
  const [newItemNotes, setNewItemNotes] = useState('')
  const [addingMaterial, setAddingMaterial] = useState(false)

  // Step form state
  const [showAddStep, setShowAddStep] = useState(false)
  const [newStepName, setNewStepName] = useState('')
  const [useLibrary, setUseLibrary] = useState(false)
  const [selectedLibraryStep, setSelectedLibraryStep] = useState('')
  const [addingStep, setAddingStep] = useState(false)
  const [saveToLibraryPrompt, setSaveToLibraryPrompt] = useState<string | null>(null)

  // Design note form state
  const [newNote, setNewNote] = useState('')
  const [addingNote, setAddingNote] = useState(false)

  // Customer approval state
  const [approvals, setApprovals] = useState<CustomerApproval[]>([])
  const [showRequestApproval, setShowRequestApproval] = useState(false)
  const [approvalType, setApprovalType] = useState<ApprovalType>('sketch')
  const [approvalFileId, setApprovalFileId] = useState('')
  const [generatingApproval, setGeneratingApproval] = useState(false)
  const [generatedApproval, setGeneratedApproval] = useState<CustomerApproval | null>(null)
  const [linkCopied, setLinkCopied] = useState(false)
  const [uploadingApprovalFile, setUploadingApprovalFile] = useState(false)

  async function handleGenerateApproval() {
    setGeneratingApproval(true)
    try {
      const file = files.find(f => f.id === approvalFileId)
      const fileUrl = file ? getProjectFileUrl(file.file_path) : null
      const created = await createApprovalRequest(id, approvalType, fileUrl)
      setApprovals(prev => [created, ...prev])
      setGeneratedApproval(created)
    } finally {
      setGeneratingApproval(false)
    }
  }

  async function handleResendApproval(a: CustomerApproval) {
    const created = await createApprovalRequest(id, a.approval_type, a.file_url)
    setApprovals(prev => [created, ...prev])
    setApprovalType(a.approval_type)
    setGeneratedApproval(created)
    setShowRequestApproval(true)
  }

  // Design meeting request state
  const [meetingRequested, setMeetingRequested] = useState(false)
  const [requestingMeeting, setRequestingMeeting] = useState(false)

  async function handleRequestDesignMeeting() {
    setRequestingMeeting(true)
    try {
      await updateProject(id, { design_meeting_requested: true })
      setMeetingRequested(true)
    } finally {
      setRequestingMeeting(false)
    }
  }

  useEffect(() => {
    // Bug 5: each fetch is independent — one failing won't kill the others
    async function load() {
      const p = await getProjectById(id)
      if (!p) { setError('Project not found'); return }
      setProject(p)
      setCustomerId(p.customer_id ?? '')
      setProjectType(p.project_type ?? '')
      setStatus(p.status ?? '')
      setAddress(p.address ?? '')
      setNotes(p.notes ?? '')
      setMeetingRequested(!!p.design_meeting_requested)

      // Load secondary data independently — failures are non-fatal
      const [c, m, s, sl, q, dn, addons, f, ct] = await Promise.all([
        getCustomers().catch(() => [] as Customer[]),
        getMaterialsByProjectId(id).catch(() => [] as MaterialItem[]),
        getStepsByProjectId(id).catch(() => [] as ProductionStep[]),
        getStepLibrary().catch(() => [] as StepLibraryItem[]),
        getQuoteByProjectId(id).catch(() => null),
        getNotesByProjectId(id).catch(() => [] as DesignMeetingNote[]),
        getPricingAddons().catch(() => [] as PricingAddon[]),
        getFilesByProjectId(id).catch(() => [] as ProjectFile[]),
        getCustomProjectTypes().catch(() => [] as CustomProjectType[]),
      ])
      setCustomers(c)
      setMaterials(m)
      setSteps(s)
      setStepLibrary(sl)
      setQuote(q)
      setDesignNotes(dn)
      setPricingAddons(addons)
      setFiles(f)
      setCustomTypes(ct)
      getSamplesByProjectId(id).then(setSamples).catch(() => {})
      getApprovalsByProjectId(id).then(setApprovals).catch(() => {})
      setPrimaryMaterial(p.primary_material ?? '')
      setRequestedAddons((p.requested_addons as string[] | undefined) ?? [])
      // Load project type fields + answers, then apply smart defaults for empty fields
      if (p.project_type) {
        const [fields, answers] = await Promise.all([
          getFieldsByProjectType(p.project_type).catch(() => [] as ProjectTypeField[]),
          getAnswersByProjectId(p.id).catch(() => [] as ProjectTypeAnswer[]),
        ])
        setTypeFields(fields)
        const answerMap: Record<string, string> = {}
        for (const a of answers) answerMap[a.field_id] = a.answer ?? ''

        // Apply smart defaults for fields that have no saved answer yet
        const setIfEmpty = (labelPattern: string, value: string) => {
          const field = fields.find(f => f.field_label.toLowerCase().includes(labelPattern.toLowerCase()))
          if (field && !answerMap[field.id]) answerMap[field.id] = value
        }
        if (p.project_type === 'bookcase') {
          if (p.width_inches) {
            const count = Math.floor((p.width_inches as number) / 32)
            if (count > 0) setIfEmpty('number of bookcase', String(count))
          }
          setIfEmpty('floor to ceiling', 'Yes')
          setIfEmpty('door type', 'With Doors')
        } else if (p.project_type === 'built_in') {
          setIfEmpty('floor to ceiling', 'Yes')
          setIfEmpty('tv recess', 'No')
          setIfEmpty('arched opening', 'No')
        } else if (p.project_type === 'dining_table') {
          setIfEmpty('wants leaves', 'No')
          setIfEmpty('table width type', 'Standard 42"')
        }

        setTypeAnswers(answerMap)
      }
    }
    load().catch(err => setError(String(err))).finally(() => setLoading(false))
  }, [id])

  async function saveOverview() {
    setSaving(true)
    try {
      const updated = await updateProject(id, {
        customer_id: customerId || null,
        project_type: (projectType as ProjectType) || null,
        status: (status as ProjectStatus) || null,
        address: address || null,
        notes: notes || null,
        primary_material: primaryMaterial || null,
        requested_addons: requestedAddons,
        required_fields_completed: {
          ...(project?.required_fields_completed ?? { customer_info: false, project_type: false, color_finish: false, quote_issued: false }),
          customer_info: !!customerId,
          project_type: !!projectType,
        },
      })
      setProject(updated)
      // Auto-seed default steps + workflow when status moves to deposit_received
      if (status === 'deposit_received') {
        await seedDefaultStepsIfEmpty(id).catch(console.error)
        await initializeProjectWorkflow(id).catch(console.error)
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  async function handleAddMaterial(e: React.FormEvent) {
    e.preventDefault()
    setAddingMaterial(true)
    try {
      const m = await addMaterial({
        project_id: id,
        item_name: newItemName,
        cost_estimate: newItemCost ? parseFloat(newItemCost) : null,
        ordered: false,
        received: false,
        notes: newItemNotes || null,
      })
      setMaterials(prev => [...prev, m])
      setNewItemName(''); setNewItemCost(''); setNewItemNotes('')
    } finally {
      setAddingMaterial(false)
    }
  }

  async function toggleMaterial(mat: MaterialItem, field: 'ordered' | 'received') {
    const updated = await updateMaterial(mat.id, { [field]: !mat[field] })
    setMaterials(prev => prev.map(m => m.id === mat.id ? updated : m))
  }

  async function handleDeleteMaterial(matId: string) {
    await deleteMaterial(matId)
    setMaterials(prev => prev.filter(m => m.id !== matId))
  }

  async function handleAddStep() {
    const name = useLibrary ? selectedLibraryStep : newStepName
    if (!name) return
    setAddingStep(true)
    try {
      const maxOrder = steps.reduce((max, s) => Math.max(max, s.sequence_order ?? 0), 0)
      const s = await addStep({
        project_id: id,
        step_name: name,
        description: null,
        sequence_order: maxOrder + 1,
        completed: false,
        assigned_to: null,
        notes: null,
        step_type: 'action',
        waiting_on: null,
        is_current: false,
        is_optional: false,
      })
      setSteps(prev => [...prev, s])
      setShowAddStep(false)
      setNewStepName('')
      setSelectedLibraryStep('')
      if (!useLibrary) {
        const inLibrary = stepLibrary.some(l => l.step_name === name)
        if (!inLibrary) setSaveToLibraryPrompt(name)
      }
    } finally {
      setAddingStep(false)
    }
  }

  async function saveStepToLibrary(name: string) {
    const item = await addStepToLibrary({ step_name: name, description: null, category: null, step_type: 'action', waiting_on: null, is_optional: false, sequence_order: null })
    setStepLibrary(prev => [...prev, item])
    setSaveToLibraryPrompt(null)
  }

  async function toggleStep(step: ProductionStep) {
    const updated = await updateStep(step.id, { completed: !step.completed })
    setSteps(prev => prev.map(s => s.id === step.id ? updated : s))
  }

  async function updateStepField(step: ProductionStep, field: 'assigned_to' | 'notes', value: string) {
    const updated = await updateStep(step.id, { [field]: value || null })
    setSteps(prev => prev.map(s => s.id === step.id ? updated : s))
  }

  async function handleDeleteStep(stepId: string) {
    await deleteStep(stepId)
    setSteps(prev => prev.filter(s => s.id !== stepId))
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? [])
    if (selected.length === 0) return
    setUploadingFile(true)
    try {
      const uploaded = await Promise.all(selected.map(f => uploadProjectFile(id, f)))
      setFiles(prev => [...uploaded, ...prev])
    } catch (err) {
      console.error('File upload error:', err)
    } finally {
      setUploadingFile(false)
      e.target.value = ''
    }
  }

  async function handleDeleteFile(file: ProjectFile) {
    await deleteProjectFile(file.id, file.file_path).catch(console.error)
    setFiles(prev => prev.filter(f => f.id !== file.id))
  }

  async function handleSaveManualQuote() {
    const items = manualLineItems.filter(li => li.desc && li.amount)
    if (items.length === 0) return
    const subtotal = items.reduce((sum, li) => sum + parseFloat(li.amount || '0'), 0)
    const markup = parseFloat(manualMarkup || '0')
    const total = subtotal * (1 + markup / 100)
    const scopeText = items.map(li => `${li.desc}: $${parseFloat(li.amount).toFixed(2)}`).join('\n')
    setSavingManual(true)
    try {
      if (quote) {
        const updated = await updateQuote(quote.id, {
          base_price: subtotal,
          total_price: Math.round(total),
          markup_percentage: markup,
          scope_of_work: scopeText,
          source: 'manual',
          status: 'initial',
        })
        setQuote(updated)
      } else {
        const newQ = await createQuote({
          project_id: id,
          ai_conversation_history: [],
          base_price: subtotal,
          add_ons: [],
          total_price: Math.round(total),
          markup_percentage: markup,
          status: 'initial',
          scope_of_work: scopeText,
          complexity_assessment: null,
          version: 1,
          source: 'manual',
        })
        setQuote(newQ)
      }
      setShowManualQuote(false)
      setManualLineItems([{ desc: '', amount: '' }])
    } finally {
      setSavingManual(false)
    }
  }

  // Fix 2: Sample handlers
  async function handleGiveSample(e: React.FormEvent) {
    e.preventDefault()
    if (!sampleDesc.trim() || !sampleDate) return
    setSavingSample(true)
    try {
      const s = await createSample({
        project_id: id,
        customer_id: project?.customer_id ?? null,
        sample_type: sampleType,
        description: sampleDesc.trim(),
        date_given: sampleDate,
        checked_in: false,
        checked_in_date: null,
        notes: sampleNotes.trim() || null,
      })
      setSamples(prev => [s, ...prev])
      setShowSampleForm(false)
      setSampleType('wood_species'); setSampleDesc(''); setSampleDate(todayStr()); setSampleNotes('')
    } finally {
      setSavingSample(false)
    }
  }

  async function handleCheckInSample(sample: Sample) {
    const updated = await updateSample(sample.id, { checked_in: true, checked_in_date: todayStr() })
    setSamples(prev => prev.map(s => s.id === sample.id ? updated : s))
  }

  async function handleDeleteSample(sampleId: string) {
    await deleteSample(sampleId)
    setSamples(prev => prev.filter(s => s.id !== sampleId))
  }

  async function handleAddNote(e: React.FormEvent) {
    e.preventDefault()
    if (!newNote.trim()) return
    setAddingNote(true)
    try {
      const n = await addDesignMeetingNote(id, newNote.trim())
      setDesignNotes(prev => [n, ...prev])
      setNewNote('')
    } finally {
      setAddingNote(false)
    }
  }

  async function handleDeleteNote(noteId: string) {
    await deleteNote(noteId)
    setDesignNotes(prev => prev.filter(n => n.id !== noteId))
  }

  // Fix 3: Delete project handlers
  async function handleDeleteProject() {
    if (!project) return
    setDeleting(true)
    try {
      await deleteProject(project.id)
      if (project.customer_id) {
        const remaining = await getProjectCountByCustomerId(project.customer_id)
        if (remaining === 0) {
          setShowDeleteConfirm(false)
          setShowDeleteCustomer(true)
          return
        }
      }
      router.push(isShopView ? '/dashboard/shop' : '/dashboard/sales')
    } catch (err) {
      alert(`Delete failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  async function handleDeleteCustomerToo() {
    if (project?.customer_id) {
      await deleteCustomer(project.customer_id).catch(console.error)
    }
    router.push(isShopView ? '/dashboard/shop' : '/dashboard/sales')
  }

  if (loading) return <div className="text-center py-8 text-gray-500">Loading...</div>
  if (error || !project) return (
    <div className="text-center py-8">
      <p className="text-gray-500 mb-2">{error ?? 'Project not found'}</p>
      <Link href="/dashboard/sales" className="text-blue-600 hover:text-blue-500 text-sm">← Back to Sales</Link>
    </div>
  )

  // Fix 3: Shop view gets its own full-screen layout
  if (isShopView) {
    return <ShopView project={project} />
  }

  // Bug 2: stage-aware alerts
  const stageAlerts = getStageAlerts(project)

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link
          href={isShopView ? '/dashboard/shop' : '/dashboard/sales'}
          className="text-gray-500 hover:text-gray-700 text-sm"
        >
          ← {isShopView ? 'Shop' : 'Sales'}
        </Link>
        <button
          onClick={() => window.open(`/dashboard/projects/${id}/print`, '_blank')}
          className="text-xs text-gray-500 hover:text-gray-900 border border-gray-300 hover:border-gray-400 px-2.5 py-1 rounded transition-colors"
          title="Print Job Sheet"
        >
          🖨 Print
        </button>
        <h1 className="text-xl font-bold">
          {project.customer?.name ?? 'New Project'}
          {project.project_type && (
            <span className="text-gray-500 font-normal ml-2 text-base capitalize">
              — {project.project_type.replace(/_/g, ' ')}
            </span>
          )}
        </h1>
        {project.status && (
          <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
            {STATUS_LABELS[project.status]}
          </span>
        )}
      </div>

      {/* Bug 3: tabs determined by view param */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {visibleTabs.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
              tab === t
                ? 'border-blue-400 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            {t === 'steps' ? 'Production Steps' : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* ── Overview Tab ── */}
      {tab === 'overview' && (
        <div className="space-y-5">
          {/* Stage-aware yellow alert */}
          {stageAlerts.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3 text-sm text-yellow-600">
              <strong className="font-semibold">Action needed:</strong>{' '}
              {stageAlerts.join(' · ')}
            </div>
          )}

          {/* Request Shop Design Meeting */}
          {(project.status === 'design_meeting_scheduled' || project.status === 'post_design_meeting') && (
            <div className="bg-white shadow-sm border border-gray-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
              {meetingRequested ? (
                <p className="text-sm text-emerald-600">✓ Shop has been notified to schedule a design meeting.</p>
              ) : (
                <>
                  <p className="text-sm text-gray-700">Need the shop to meet on this design?</p>
                  <button
                    onClick={handleRequestDesignMeeting}
                    disabled={requestingMeeting}
                    className="text-sm bg-blue-100 hover:bg-blue-700 disabled:opacity-50 text-blue-700 font-semibold px-4 py-2 rounded-lg shrink-0"
                  >
                    {requestingMeeting ? 'Requesting...' : 'Request Shop Design Meeting'}
                  </button>
                </>
              )}
            </div>
          )}

          {/* Workflow status + tasks */}
          <WorkflowPanel projectId={id} />

          {/* Project fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-500 mb-1">Customer</label>
              <select value={customerId} onChange={e => setCustomerId(e.target.value)}
                className="w-full bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">— Select customer —</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-500 mb-1">Project Type</label>
              <select value={projectType} onChange={e => setProjectType(e.target.value as ProjectType)}
                className="w-full bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">— Select type —</option>
                {PROJECT_TYPES.map(t => <option key={t} value={t} className="capitalize">{t.replace(/_/g, ' ')}</option>)}
                {customTypes.filter(ct => ct.is_active).map(ct => <option key={ct.key} value={ct.key}>{ct.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-500 mb-1">Status</label>
              <select value={status} onChange={e => setStatus(e.target.value as ProjectStatus)}
                className="w-full bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">— Select status —</option>
                {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-500 mb-1">Address</label>
              <input type="text" value={address} onChange={e => setAddress(e.target.value)}
                placeholder="Job site address"
                className="w-full bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-500 mb-1">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
              placeholder="Project notes..."
              className="w-full bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          {/* Fix 2: Customer Preferences card */}
          <div className="bg-white shadow-sm border border-gray-200 rounded-xl p-5 space-y-4">
            <h3 className="font-semibold text-sm text-gray-900">Customer Preferences</h3>

            <div>
              <label className="block text-sm text-gray-500 mb-1">Primary Material</label>
              <select value={primaryMaterial} onChange={e => setPrimaryMaterial(e.target.value)}
                className="w-full bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">— Select material —</option>
                {['Maple', 'Walnut', 'Oak', 'Cherry', 'Painted MDF', 'Other'].map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>

            {pricingAddons.length > 0 && (
              <div>
                <label className="block text-sm text-gray-500 mb-2">Add-Ons Requested</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {pricingAddons.map(addon => (
                    <label key={addon.id} className="flex items-center gap-2 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={requestedAddons.includes(addon.id)}
                        onChange={e => {
                          if (e.target.checked) {
                            setRequestedAddons(prev => [...prev, addon.id])
                          } else {
                            setRequestedAddons(prev => prev.filter(id => id !== addon.id))
                          }
                        }}
                        className="accent-blue-600 w-4 h-4 shrink-0"
                      />
                      <span className="text-sm text-gray-700 group-hover:text-gray-900 transition-colors">{addon.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm text-gray-500 mb-1">Special Notes</label>
              <textarea value={prefNotes} onChange={e => setPrefNotes(e.target.value)} rows={2}
                placeholder="Anything else the customer mentioned..."
                className="w-full bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          {/* Fix 2: Samples card */}
          <div className="bg-white shadow-sm border border-gray-200 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-sm text-gray-900">Samples Given to Customer</h3>
                {samples.some(s => !s.checked_in) && (
                  <span className="text-xs font-semibold bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">
                    {samples.filter(s => !s.checked_in).length} out
                  </span>
                )}
              </div>
              {!showSampleForm && (
                <button onClick={() => setShowSampleForm(true)}
                  className="text-sm bg-blue-600 hover:bg-blue-500 text-white font-semibold px-3 py-1.5 rounded-lg">
                  + Give Sample
                </button>
              )}
            </div>

            {samples.length === 0 && !showSampleForm && (
              <p className="text-sm text-gray-500">No samples given yet.</p>
            )}

            {samples.length > 0 && (
              <div className="space-y-2">
                {samples.map(s => (
                  <div key={s.id} className="flex items-center gap-3 border-b border-gray-200 last:border-0 pb-2 last:pb-0 text-sm">
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${SAMPLE_TYPE_COLORS[s.sample_type] ?? SAMPLE_TYPE_COLORS.other}`}>
                      {sampleTypeLabel(s.sample_type)}
                    </span>
                    <span className="text-gray-900 flex-1 min-w-0 truncate" title={s.notes ?? undefined}>{s.description}</span>
                    <span className="text-xs text-gray-500 shrink-0">
                      Given {new Date(s.date_given + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                    {s.checked_in ? (
                      <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded shrink-0">
                        Returned{s.checked_in_date ? ` ${new Date(s.checked_in_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}
                      </span>
                    ) : (
                      <>
                        <span className="text-[10px] font-semibold bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded shrink-0">
                          Out with Customer
                        </span>
                        <button onClick={() => handleCheckInSample(s)}
                          className="text-xs text-emerald-600 hover:text-emerald-500 font-semibold shrink-0">
                          Check In
                        </button>
                      </>
                    )}
                    <button onClick={() => handleDeleteSample(s.id)} className="text-red-600 hover:text-red-500 text-xs shrink-0">Delete</button>
                  </div>
                ))}
              </div>
            )}

            {showSampleForm && (
              <form onSubmit={handleGiveSample} className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Sample Type</label>
                    <select value={sampleType} onChange={e => setSampleType(e.target.value as SampleType)}
                      className="w-full bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500">
                      {SAMPLE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Date Given</label>
                    <input type="date" value={sampleDate} onChange={e => setSampleDate(e.target.value)} required
                      className="w-full bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs text-gray-500 mb-1">Description *</label>
                    <input value={sampleDesc} onChange={e => setSampleDesc(e.target.value)} required
                      placeholder='e.g. "Walnut stain — medium brown"'
                      className="w-full bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs text-gray-500 mb-1">Notes (optional)</label>
                    <input value={sampleNotes} onChange={e => setSampleNotes(e.target.value)}
                      className="w-full bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button type="submit" disabled={savingSample || !sampleDesc.trim()}
                    className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold px-4 py-2 rounded-lg text-sm">
                    {savingSample ? 'Saving...' : 'Save'}
                  </button>
                  <button type="button" onClick={() => setShowSampleForm(false)}
                    className="text-gray-500 hover:text-gray-900 text-sm px-3">Cancel</button>
                </div>
              </form>
            )}
          </div>

          <div className="flex items-center justify-between">
            <button onClick={saveOverview} disabled={saving}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold px-5 py-2 rounded-lg transition-colors text-sm">
              {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Changes'}
            </button>
            <button onClick={() => setShowDeleteConfirm(true)}
              className="text-xs text-red-500 hover:text-red-600 transition-colors">
              Delete Project
            </button>
          </div>

          {/* Project Details — dynamic type-specific fields */}
          {typeFields.length > 0 && (
            <div className="bg-white shadow-sm border border-gray-200 rounded-xl p-5 space-y-4">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-sm text-gray-900">Project Details</h3>
                <span className="text-[10px] text-gray-500 capitalize">{project.project_type?.replace(/_/g, ' ')}</span>
              </div>
              <div className="space-y-3">
                {typeFields.map(field => (
                  <div key={field.id} className="flex items-center gap-3">
                    <label className="flex-1 text-sm text-gray-700 flex items-center gap-1.5">
                      {field.field_label}
                      {field.affects_price && <span className="text-[10px] text-blue-600" title="Affects price">$</span>}
                    </label>
                    <div className="w-40 shrink-0">
                      {field.field_type === 'yes_no' && (
                        <div className="flex rounded-lg overflow-hidden border border-gray-300">
                          {['Yes', 'No'].map(opt => (
                            <button key={opt} type="button"
                              onClick={() => setTypeAnswers(prev => ({ ...prev, [field.id]: opt }))}
                              className={`flex-1 px-2 py-1 text-xs font-medium transition-colors ${typeAnswers[field.id] === opt ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:text-gray-900'}`}
                            >{opt}</button>
                          ))}
                        </div>
                      )}
                      {field.field_type === 'number' && (
                        <input
                          type="number"
                          value={typeAnswers[field.id] ?? ''}
                          onChange={e => setTypeAnswers(prev => ({ ...prev, [field.id]: e.target.value }))}
                          placeholder={
                            field.field_label.toLowerCase().includes('number of bookcase') && !project?.width_inches
                              ? 'e.g. 4 units for 128" wall'
                              : undefined
                          }
                          className="w-full bg-gray-100 border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      )}
                      {field.field_type === 'dropdown' && (
                        <select value={typeAnswers[field.id] ?? ''} onChange={e => setTypeAnswers(prev => ({ ...prev, [field.id]: e.target.value }))}
                          className="w-full bg-gray-100 border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none">
                          <option value="">—</option>
                          {(field.field_options as string[]).map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                      )}
                      {field.field_type === 'text' && (
                        <input value={typeAnswers[field.id] ?? ''} onChange={e => setTypeAnswers(prev => ({ ...prev, [field.id]: e.target.value }))}
                          className="w-full bg-gray-100 border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <button
                onClick={async () => {
                  setSavingAnswers(true)
                  try {
                    await saveAllAnswers(id, Object.entries(typeAnswers).filter(([, v]) => v).map(([fieldId, answer]) => ({ fieldId, answer })))
                    setAnswersSaved(true)
                    setTimeout(() => setAnswersSaved(false), 2000)
                  } finally { setSavingAnswers(false) }
                }}
                disabled={savingAnswers}
                className="bg-gray-200 hover:bg-gray-300 disabled:opacity-50 text-gray-900 font-medium text-sm px-4 py-2 rounded-lg"
              >
                {savingAnswers ? 'Saving...' : answersSaved ? '✓ Saved' : 'Save Project Details'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Materials Tab ── */}
      {tab === 'materials' && (
        <div className="space-y-4">
          <div className="bg-white shadow-sm rounded-xl border border-gray-200 overflow-hidden">
            {materials.length === 0 ? (
              <div className="p-6 text-center text-gray-500 text-sm">No materials yet</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="px-4 py-2 text-left text-gray-500 font-medium">Item</th>
                    <th className="px-4 py-2 text-left text-gray-500 font-medium">Cost Est.</th>
                    <th className="px-4 py-2 text-center text-gray-500 font-medium">Ordered</th>
                    <th className="px-4 py-2 text-center text-gray-500 font-medium">Received</th>
                    <th className="px-4 py-2 text-left text-gray-500 font-medium">Notes</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {materials.map(mat => (
                    <tr key={mat.id} className="border-b border-gray-200 last:border-0">
                      <td className="px-4 py-3">{mat.item_name}</td>
                      <td className="px-4 py-3 text-gray-700">
                        {mat.cost_estimate != null ? `$${mat.cost_estimate.toFixed(2)}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <input type="checkbox" checked={mat.ordered} onChange={() => toggleMaterial(mat, 'ordered')} className="accent-blue-600 w-4 h-4" />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <input type="checkbox" checked={mat.received} onChange={() => toggleMaterial(mat, 'received')} className="accent-blue-600 w-4 h-4" />
                      </td>
                      <td className="px-4 py-3 text-gray-500">{mat.notes ?? '—'}</td>
                      <td className="px-4 py-3">
                        <button onClick={() => handleDeleteMaterial(mat.id)} className="text-red-600 hover:text-red-600 text-xs">Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <form onSubmit={handleAddMaterial} className="bg-white shadow-sm rounded-xl border border-gray-200 p-4">
            <h3 className="text-sm font-medium text-gray-700 mb-3">Add Material</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input type="text" placeholder="Item name *" value={newItemName} onChange={e => setNewItemName(e.target.value)} required
                className="bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500" />
              <input type="number" placeholder="Cost estimate" value={newItemCost} onChange={e => setNewItemCost(e.target.value)}
                className="bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500" />
              <input type="text" placeholder="Notes" value={newItemNotes} onChange={e => setNewItemNotes(e.target.value)}
                className="bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
            <button type="submit" disabled={addingMaterial || !newItemName}
              className="mt-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold px-4 py-2 rounded-lg text-sm">
              {addingMaterial ? 'Adding...' : 'Add Material'}
            </button>
          </form>
        </div>
      )}

      {/* ── Production Steps Tab (shop view only) ── */}
      {tab === 'steps' && (
        <div className="space-y-3">
          {saveToLibraryPrompt && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-700 flex items-center justify-between">
              <span>Save &ldquo;{saveToLibraryPrompt}&rdquo; to the step library?</span>
              <div className="flex gap-2">
                <button onClick={() => saveStepToLibrary(saveToLibraryPrompt)} className="text-blue-600 hover:text-gray-900 font-medium">Yes</button>
                <button onClick={() => setSaveToLibraryPrompt(null)} className="text-blue-600 hover:text-gray-900">No</button>
              </div>
            </div>
          )}

          {steps.length === 0 ? (
            <div className="text-center text-gray-500 text-sm py-4">No steps yet</div>
          ) : (
            <div className="space-y-2">
              {steps.map((step, idx) => (
                <div key={step.id} className="bg-white shadow-sm border border-gray-200 rounded-lg px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="text-gray-500 text-sm w-5 shrink-0">{idx + 1}</span>
                    <input type="checkbox" checked={step.completed} onChange={() => toggleStep(step)} className="accent-blue-600 w-4 h-4 shrink-0" />
                    <span className={`flex-1 text-sm ${step.completed ? 'line-through text-gray-500' : 'text-gray-900'}`}>{step.step_name}</span>
                    <input type="text" defaultValue={step.assigned_to ?? ''} onBlur={e => updateStepField(step, 'assigned_to', e.target.value)}
                      placeholder="Assigned to"
                      className="bg-gray-100 border border-gray-300 rounded px-2 py-1 text-xs text-gray-900 w-28 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    <button onClick={() => handleDeleteStep(step.id)} className="text-red-600 hover:text-red-600 text-xs shrink-0">Delete</button>
                  </div>
                  <div className="ml-8 mt-2">
                    <input type="text" defaultValue={step.notes ?? ''} onBlur={e => updateStepField(step, 'notes', e.target.value)}
                      placeholder="Notes..."
                      className="bg-gray-100 border border-gray-300 rounded px-2 py-1 text-xs text-gray-700 w-full focus:outline-none focus:ring-1 focus:ring-blue-500" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {!showAddStep ? (
            <button onClick={() => setShowAddStep(true)} className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-4 py-2 rounded-lg text-sm">
              + Add Step
            </button>
          ) : (
            <div className="bg-white shadow-sm border border-gray-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-4">
                <button onClick={() => setUseLibrary(false)} className={`text-sm px-3 py-1 rounded ${!useLibrary ? 'bg-gray-200 text-gray-900' : 'text-gray-500'}`}>Custom</button>
                <button onClick={() => setUseLibrary(true)} className={`text-sm px-3 py-1 rounded ${useLibrary ? 'bg-gray-200 text-gray-900' : 'text-gray-500'}`}>From Library</button>
              </div>
              {useLibrary ? (
                <select value={selectedLibraryStep} onChange={e => setSelectedLibraryStep(e.target.value)}
                  className="w-full bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500">
                  <option value="">— Pick from library —</option>
                  {stepLibrary.map(s => <option key={s.id} value={s.step_name}>{s.step_name}</option>)}
                </select>
              ) : (
                <input type="text" placeholder="Step name" value={newStepName} onChange={e => setNewStepName(e.target.value)}
                  className="w-full bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500" />
              )}
              <div className="flex gap-2">
                <button onClick={handleAddStep} disabled={addingStep || (useLibrary ? !selectedLibraryStep : !newStepName)}
                  className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold px-4 py-2 rounded-lg text-sm">
                  {addingStep ? 'Adding...' : 'Add'}
                </button>
                <button onClick={() => { setShowAddStep(false); setNewStepName(''); setSelectedLibraryStep('') }} className="text-gray-500 hover:text-gray-900 text-sm px-3">Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Quote Tab ── */}
      {tab === 'quote' && (
        <div className="space-y-6">
          {!quote ? (
            <div className="bg-white shadow-sm border border-gray-200 rounded-xl p-8 text-center space-y-3">
              <p className="text-gray-500">No quote yet for this project.</p>
              <div className="flex gap-3 justify-center">
                <Link
                  href={`/dashboard/projects/${id}/quote-agent?view=${view}`}
                  className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-5 py-2.5 rounded-lg text-sm inline-block"
                >
                  Start AI Quote
                </Link>
                <button
                  onClick={() => setShowManualQuote(v => !v)}
                  className="bg-gray-200 hover:bg-gray-300 text-gray-900 font-semibold px-5 py-2.5 rounded-lg text-sm"
                >
                  Create Manual Quote
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-white shadow-sm border border-gray-200 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h2 className="font-semibold">Quote</h2>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${QUOTE_STATUS_COLORS[quote.status ?? 'initial']}`}>
                    {(quote.status ?? 'initial').charAt(0).toUpperCase() + (quote.status ?? 'initial').slice(1)}
                    {(quote.version ?? 1) > 1 && ` v${quote.version}`}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setShowManualQuote(v => !v)}
                    className="text-sm text-gray-500 hover:text-gray-900"
                  >
                    Manual Quote
                  </button>
                  <Link
                    href={`/dashboard/projects/${id}/quote-agent?view=${view}`}
                    className="text-sm text-blue-600 hover:text-blue-500"
                  >
                    Open Quote Agent
                  </Link>
                </div>
              </div>

              {quote.total_price != null && (
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">Final Price</p>
                  <p className="text-3xl font-bold text-blue-600">${quote.total_price.toLocaleString()}</p>
                </div>
              )}
              {quote.scope_of_work && (
                <div>
                  <p className="text-xs text-gray-500 mb-1">Scope of Work</p>
                  <p className="text-sm text-gray-700 leading-relaxed">{quote.scope_of_work}</p>
                </div>
              )}
              {quote.complexity_assessment && (
                <div>
                  <p className="text-xs text-gray-500 mb-1">Complexity Assessment</p>
                  <p className="text-sm text-gray-700">{quote.complexity_assessment}</p>
                </div>
              )}
            </div>
          )}

          {/* Manual Quote Form */}
          {showManualQuote && (
            <div className="bg-white shadow-sm border border-amber-200 rounded-xl p-5 space-y-4">
              <h3 className="font-semibold text-gray-900 text-sm">Manual Quote</h3>
              <div className="space-y-2">
                {manualLineItems.map((item, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <input
                      placeholder="Description"
                      value={item.desc}
                      onChange={e => setManualLineItems(prev => prev.map((li, j) => j === i ? { ...li, desc: e.target.value } : li))}
                      className="flex-1 bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <input
                      type="number"
                      placeholder="$Amount"
                      value={item.amount}
                      onChange={e => setManualLineItems(prev => prev.map((li, j) => j === i ? { ...li, amount: e.target.value } : li))}
                      className="w-28 bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    {manualLineItems.length > 1 && (
                      <button onClick={() => setManualLineItems(prev => prev.filter((_, j) => j !== i))}
                        className="text-red-600 hover:text-red-600 text-sm">×</button>
                    )}
                  </div>
                ))}
                <button
                  onClick={() => setManualLineItems(prev => [...prev, { desc: '', amount: '' }])}
                  className="text-xs text-blue-600 hover:text-blue-500"
                >+ Add Line Item</button>
              </div>
              <div className="flex items-center gap-3">
                <label className="text-sm text-gray-500">Markup %</label>
                <input
                  type="number"
                  value={manualMarkup}
                  onChange={e => setManualMarkup(e.target.value)}
                  className="w-24 bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                {(() => {
                  const subtotal = manualLineItems.reduce((s, li) => s + parseFloat(li.amount || '0'), 0)
                  const total = subtotal * (1 + parseFloat(manualMarkup || '0') / 100)
                  return subtotal > 0 ? (
                    <span className="text-sm text-blue-600 font-semibold">Total: ${Math.round(total).toLocaleString()}</span>
                  ) : null
                })()}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleSaveManualQuote}
                  disabled={savingManual || !manualLineItems.some(li => li.desc && li.amount)}
                  className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold px-4 py-2 rounded-lg text-sm"
                >
                  {savingManual ? 'Saving...' : 'Save Quote'}
                </button>
                <button onClick={() => setShowManualQuote(false)} className="text-gray-500 hover:text-gray-900 text-sm px-3">Cancel</button>
              </div>
            </div>
          )}

          {/* Design Meeting Notes */}
          <div>
            <h2 className="text-base font-semibold mb-3">Design Meeting Notes</h2>
            <form onSubmit={handleAddNote} className="mb-4">
              <textarea
                value={newNote}
                onChange={e => setNewNote(e.target.value)}
                rows={3}
                placeholder="Add meeting notes, customer preferences, or observations..."
                className="w-full bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button type="submit" disabled={addingNote || !newNote.trim()}
                className="mt-2 bg-gray-200 hover:bg-gray-300 disabled:opacity-50 text-gray-900 px-4 py-2 rounded-lg text-sm">
                {addingNote ? 'Adding...' : 'Add Note'}
              </button>
            </form>
            {designNotes.length === 0 ? (
              <p className="text-sm text-gray-500">No notes yet.</p>
            ) : (
              <div className="space-y-3">
                {designNotes.map(n => (
                  <div key={n.id} className="bg-white shadow-sm border border-gray-200 rounded-lg p-4">
                    <div className="flex justify-between items-start">
                      <p className="text-xs text-gray-500">{new Date(n.created_at).toLocaleString()}</p>
                      <button onClick={() => handleDeleteNote(n.id)} className="text-red-600 hover:text-red-600 text-xs">Delete</button>
                    </div>
                    <p className="text-sm text-gray-800 mt-1 whitespace-pre-wrap">{n.notes}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Files Tab ── */}
      {tab === 'files' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Project Files</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setGeneratedApproval(null); setShowRequestApproval(true) }}
                className="text-sm font-semibold px-4 py-2 rounded-lg bg-emerald-100 hover:bg-emerald-700 text-emerald-700 transition-colors"
              >
                Request Approval
              </button>
              <label className={`cursor-pointer text-sm font-semibold px-4 py-2 rounded-lg transition-colors ${uploadingFile ? 'bg-gray-200 text-gray-500 cursor-wait' : 'bg-blue-600 hover:bg-blue-500 text-white'}`}>
                {uploadingFile ? 'Uploading...' : '+ Upload Files'}
                <input type="file" multiple className="hidden" onChange={handleFileUpload} disabled={uploadingFile} />
              </label>
            </div>
          </div>

          {/* Customer Approvals list */}
          {approvals.length > 0 && (
            <div className="bg-white shadow-sm border border-gray-200 rounded-xl p-4 space-y-2">
              <h3 className="text-sm font-semibold text-gray-900 mb-1">Customer Approvals</h3>
              {approvals.map(a => {
                const st = approvalStatus(a)
                return (
                  <div key={a.id} className="flex items-center gap-3 text-xs border-b border-gray-200 last:border-0 pb-2 last:pb-0">
                    <span className="font-semibold text-gray-900 capitalize w-20 shrink-0">{a.approval_type}</span>
                    <span className={`font-semibold px-1.5 py-0.5 rounded shrink-0 ${
                      st === 'Approved' ? 'bg-emerald-100 text-emerald-700' :
                      st === 'Expired' ? 'bg-red-100 text-red-700' :
                      'bg-yellow-100 text-yellow-700'
                    }`}>{st}</span>
                    <span className="text-gray-500">Sent {a.sent_at ? new Date(a.sent_at).toLocaleDateString() : '—'}</span>
                    {a.approved && a.approved_at && (
                      <span className="text-emerald-600">Approved {new Date(a.approved_at).toLocaleDateString()}</span>
                    )}
                    {a.customer_notes && (
                      <span className="text-gray-500 truncate flex-1" title={a.customer_notes}>&ldquo;{a.customer_notes}&rdquo;</span>
                    )}
                    <span className="flex-1" />
                    {st === 'Expired' && (
                      <button onClick={() => handleResendApproval(a)}
                        className="text-blue-600 hover:text-blue-500 shrink-0">Resend</button>
                    )}
                    {st === 'Pending' && (
                      <button
                        onClick={() => { navigator.clipboard.writeText(`${APPROVAL_BASE_URL}/${a.token}`).catch(() => {}) }}
                        className="text-gray-500 hover:text-gray-900 shrink-0">Copy Link</button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
          {files.length === 0 && !uploadingFile ? (
            <div className="bg-white shadow-sm border border-gray-200 rounded-xl p-8 text-center text-gray-500 text-sm">
              No files yet. Upload photos, drawings, or documents for this project.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {files.map(file => {
                const isImage = file.mime_type?.startsWith('image/')
                const url = getProjectFileUrl(file.file_path)
                return (
                  <div key={file.id} className="relative group rounded-xl overflow-hidden bg-white shadow-sm border border-gray-200">
                    {isImage ? (
                      <button onClick={() => setLightboxUrl(url)} className="w-full aspect-square block">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt={file.file_name} className="w-full h-full object-cover" />
                      </button>
                    ) : (
                      <a href={url} target="_blank" rel="noopener noreferrer" download={file.file_name}
                        className="w-full aspect-square flex flex-col items-center justify-center p-3 bg-white shadow-sm">
                        <span className="text-3xl mb-2">📄</span>
                        <span className="text-[10px] text-gray-500 truncate w-full text-center">{file.file_name}</span>
                      </a>
                    )}
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-end justify-between p-2 pointer-events-none group-hover:pointer-events-auto">
                      <button onClick={() => handleDeleteFile(file)}
                        className="text-xs text-red-600 bg-red-100/80 hover:bg-red-200 rounded-lg px-2 py-1 font-semibold self-end">Delete</button>
                      <div>
                        <p className="text-[9px] text-gray-700 truncate max-w-full text-right">{file.file_name}</p>
                        <a href={url} download={file.file_name} target="_blank" rel="noopener noreferrer"
                          className="text-[10px] text-gray-900 bg-gray-200 hover:bg-gray-300 rounded px-2 py-0.5 float-right mt-1">↓ Download</a>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Lightbox */}
      {lightboxUrl && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4" onClick={() => setLightboxUrl(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightboxUrl} alt="Preview" className="max-w-full max-h-full rounded-lg shadow-2xl" onClick={e => e.stopPropagation()} />
          <button onClick={() => setLightboxUrl(null)}
            className="absolute top-4 right-4 text-gray-900 bg-gray-100 hover:bg-gray-200 w-8 h-8 rounded-full flex items-center justify-center text-lg">×</button>
        </div>
      )}

      {/* Request Approval Modal */}
      {showRequestApproval && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) setShowRequestApproval(false) }}>
          <div className="bg-white shadow-sm border border-gray-200 rounded-xl w-full max-w-md max-h-[85vh] overflow-y-auto p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Request Customer Approval</h3>
              <button onClick={() => setShowRequestApproval(false)} className="text-gray-500 hover:text-gray-900 text-xl leading-none">×</button>
            </div>

            {!generatedApproval ? (
              <>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Approval Type</label>
                  <select value={approvalType} onChange={e => setApprovalType(e.target.value as ApprovalType)}
                    className="w-full bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none">
                    <option value="sketch">Sketch</option>
                    <option value="rendering">Rendering</option>
                    <option value="quote">Quote</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">File (optional)</label>
                  <select value={approvalFileId} onChange={e => setApprovalFileId(e.target.value)}
                    className="w-full bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none">
                    <option value="">— No file —</option>
                    {files.map(f => <option key={f.id} value={f.id}>{f.file_name}</option>)}
                  </select>
                  <label className={`mt-2 inline-block cursor-pointer text-xs px-3 py-1.5 rounded-lg ${uploadingApprovalFile ? 'bg-gray-200 text-gray-500' : 'bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300'}`}>
                    {uploadingApprovalFile ? 'Uploading...' : '⬆ Upload a new file'}
                    <input type="file" className="hidden" disabled={uploadingApprovalFile}
                      onChange={async e => {
                        const file = e.target.files?.[0]
                        if (!file) return
                        setUploadingApprovalFile(true)
                        try {
                          const uploaded = await uploadProjectFile(id, file)
                          setFiles(prev => [uploaded, ...prev])
                          setApprovalFileId(uploaded.id)
                        } finally {
                          setUploadingApprovalFile(false)
                          e.target.value = ''
                        }
                      }} />
                  </label>
                </div>
                {/* Preview */}
                {(() => {
                  const f = files.find(x => x.id === approvalFileId)
                  if (!f) return null
                  const url = getProjectFileUrl(f.file_path)
                  return f.mime_type?.startsWith('image/') ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={url} alt={f.file_name} className="w-full max-h-48 object-contain rounded-lg border border-gray-200" />
                  ) : (
                    <p className="text-xs text-gray-500">📄 {f.file_name}</p>
                  )
                })()}
                <button onClick={handleGenerateApproval} disabled={generatingApproval}
                  className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold py-2 rounded-lg text-sm">
                  {generatingApproval ? 'Generating...' : 'Generate Approval Link'}
                </button>
              </>
            ) : (
              (() => {
                const link = `${APPROVAL_BASE_URL}/${generatedApproval.token}`
                const message = `Hi, please review and approve your ${generatedApproval.approval_type}: ${link}`
                return (
                  <div className="space-y-3">
                    <p className="text-xs text-gray-500">Approval link (valid for 7 days):</p>
                    <p className="text-xs text-blue-600 break-all bg-gray-100 rounded-lg px-3 py-2">{link}</p>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        onClick={() => { navigator.clipboard.writeText(link).then(() => { setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000) }).catch(() => {}) }}
                        className="text-xs bg-gray-200 hover:bg-gray-300 text-gray-900 font-semibold py-2 rounded-lg">
                        {linkCopied ? '✓ Copied' : 'Copy Link'}
                      </button>
                      <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer"
                        className="text-xs bg-emerald-100 hover:bg-emerald-700 text-emerald-700 font-semibold py-2 rounded-lg text-center">
                        WhatsApp
                      </a>
                      <a href={`sms:?&body=${encodeURIComponent(message)}`}
                        className="text-xs bg-blue-100 hover:bg-blue-700 text-blue-700 font-semibold py-2 rounded-lg text-center">
                        SMS
                      </a>
                    </div>
                    <button onClick={() => setShowRequestApproval(false)}
                      className="w-full text-sm text-gray-500 hover:text-gray-900 py-1">Done</button>
                  </div>
                )
              })()
            )}
          </div>
        </div>
      )}

      {/* Fix 3: Delete confirmation modals */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-white shadow-sm border border-gray-200 rounded-xl w-full max-w-sm p-6 space-y-4 shadow-2xl">
            <h3 className="font-semibold text-gray-900">Delete Project?</h3>
            <p className="text-sm text-gray-500">Are you sure you want to delete this project? This cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={handleDeleteProject} disabled={deleting}
                className="flex-1 bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white font-semibold py-2 rounded-lg text-sm">
                {deleting ? 'Deleting...' : 'Delete Project'}
              </button>
              <button onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 text-sm text-gray-500 hover:text-gray-900">Cancel</button>
            </div>
          </div>
        </div>
      )}
      {showDeleteCustomer && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-white shadow-sm border border-gray-200 rounded-xl w-full max-w-sm p-6 space-y-4 shadow-2xl">
            <h3 className="font-semibold text-gray-900">Delete Customer Too?</h3>
            <p className="text-sm text-gray-500">This customer has no other projects. Do you want to delete the customer record as well?</p>
            <div className="flex gap-3">
              <button onClick={handleDeleteCustomerToo}
                className="flex-1 bg-red-700 hover:bg-red-600 text-white font-semibold py-2 rounded-lg text-sm">
                Yes, Delete Customer
              </button>
              <button onClick={() => router.push(isShopView ? '/dashboard/shop' : '/dashboard/sales')}
                className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-900 font-semibold py-2 rounded-lg text-sm">
                No, Keep Customer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
