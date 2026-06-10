'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import {
  getProjectById,
  getMaterialsByProjectId,
  getStepsByProjectId,
  getSubtasksByStepId,
  getOpenQuestionsByProjectId,
  getPricingAddons,
  getFieldsByProjectType,
  getAnswersByProjectId,
} from '@/lib/api/supabase-client'
import type { Project, MaterialItem, ProductionStep, StepSubtask, OpenQuestion, PricingAddon, Customer, ProjectTypeField, ProjectTypeAnswer } from '@/lib/core/types'

export default function PrintJobSheetPage() {
  const { id } = useParams<{ id: string }>()
  const [project, setProject] = useState<Project | null>(null)
  const [materials, setMaterials] = useState<MaterialItem[]>([])
  const [steps, setSteps] = useState<ProductionStep[]>([])
  const [currentSubtasks, setCurrentSubtasks] = useState<StepSubtask[]>([])
  const [questions, setQuestions] = useState<OpenQuestion[]>([])
  const [addons, setAddons] = useState<PricingAddon[]>([])
  const [typeFields, setTypeFields] = useState<ProjectTypeField[]>([])
  const [typeAnswers, setTypeAnswers] = useState<ProjectTypeAnswer[]>([])
  const [loading, setLoading] = useState(true)
  const [printDate] = useState(new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }))

  useEffect(() => {
    async function load() {
      const [p, m, s, q, a] = await Promise.all([
        getProjectById(id),
        getMaterialsByProjectId(id).catch(() => [] as MaterialItem[]),
        getStepsByProjectId(id).catch(() => [] as ProductionStep[]),
        getOpenQuestionsByProjectId(id).catch(() => [] as OpenQuestion[]),
        getPricingAddons().catch(() => [] as PricingAddon[]),
      ])
      setProject(p)
      setMaterials(m)
      setSteps(s)
      setQuestions(q.filter(q => !q.resolved))
      setAddons(a)
      if (p?.project_type) {
        const [fields, answers] = await Promise.all([
          getFieldsByProjectType(p.project_type).catch(() => [] as ProjectTypeField[]),
          getAnswersByProjectId(p.id).catch(() => [] as ProjectTypeAnswer[]),
        ])
        setTypeFields(fields)
        setTypeAnswers(answers)
      }
      const curr = s.find(x => x.is_current)
      if (curr) {
        const subs = await getSubtasksByStepId(curr.id).catch(() => [] as StepSubtask[])
        setCurrentSubtasks(subs)
      }
    }
    load().finally(() => setLoading(false))
  }, [id])

  if (loading) return <div style={{ padding: 32, fontFamily: 'sans-serif' }}>Loading...</div>
  if (!project) return <div style={{ padding: 32, fontFamily: 'sans-serif' }}>Project not found.</div>

  const customer = project.customer as Customer | undefined
  const currentStep = steps.find(s => s.is_current)
  const completedCount = steps.filter(s => s.completed).length
  const requestedAddonIds = (project.requested_addons as string[] | undefined) ?? []
  const requestedAddonNames = addons.filter(a => requestedAddonIds.includes(a.id)).map(a => a.name)
  const answerMap: Record<string, string> = {}
  for (const a of typeAnswers) answerMap[a.field_id] = a.answer ?? ''
  const answeredFields = typeFields.filter(f => answerMap[f.id])

  const STATUS_LABELS: Record<string, string> = {
    lead: 'Lead', tentative_quote_sent: 'Tentative Quote Sent',
    design_meeting_scheduled: 'Design Meeting Scheduled', post_design_meeting: 'Post Design Meeting',
    rendering_in_progress: 'Rendering In Progress', final_quote_issued: 'Final Quote Issued',
    deposit_received: 'Deposit Received', in_production: 'In Production', ready_for_delivery: 'Ready for Delivery', completed: 'Completed',
  }

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; }
          .page-break { page-break-before: always; }
        }
        body { font-family: Georgia, serif; background: white; color: #111; margin: 0; }
        .container { max-width: 800px; margin: 0 auto; padding: 32px; }
        h1 { font-size: 28px; margin: 0 0 4px; }
        h2 { font-size: 16px; font-weight: 700; border-bottom: 2px solid #111; padding-bottom: 4px; margin: 24px 0 12px; }
        h3 { font-size: 18px; font-weight: 700; margin: 0 0 8px; }
        .row { display: flex; gap: 24px; flex-wrap: wrap; margin-bottom: 8px; }
        .field { flex: 1; min-width: 160px; }
        .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #666; margin-bottom: 2px; }
        .value { font-size: 14px; }
        .badge { display: inline-block; font-size: 11px; font-weight: 700; text-transform: uppercase; padding: 2px 8px; border-radius: 4px; border: 1px solid #ccc; }
        .step-row { display: flex; align-items: center; gap: 8px; padding: 4px 0; font-size: 13px; border-bottom: 1px solid #f0f0f0; }
        .step-num { width: 24px; text-align: right; color: #888; font-size: 12px; }
        .check-box { width: 14px; height: 14px; border: 1.5px solid #555; border-radius: 2px; display: inline-block; flex-shrink: 0; }
        .check-filled { background: #111; }
        .check-arrow { font-weight: 700; font-size: 14px; }
        table { width: 100%; border-collapse: collapse; font-size: 13px; }
        th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #666; border-bottom: 1px solid #ddd; padding: 4px 8px; }
        td { padding: 6px 8px; border-bottom: 1px solid #f0f0f0; }
        .q-row { padding: 6px 0; border-bottom: 1px solid #f0f0f0; font-size: 13px; }
        .q-badge { display: inline-block; font-size: 10px; font-weight: 700; text-transform: uppercase; padding: 1px 6px; border-radius: 3px; border: 1px solid #ccc; margin-right: 6px; }
      `}</style>

      {/* Print button — hidden when printing */}
      <div className="no-print" style={{ background: '#111', padding: '12px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
        <span style={{ color: '#f59e0b', fontWeight: 700, fontFamily: 'sans-serif' }}>CraftFlow</span>
        <button
          onClick={() => window.print()}
          style={{ background: '#f59e0b', color: '#111', fontWeight: 700, border: 'none', borderRadius: 6, padding: '6px 18px', cursor: 'pointer', fontFamily: 'sans-serif', fontSize: 14 }}
        >
          🖨 Print
        </button>
        <button
          onClick={() => window.close()}
          style={{ background: 'transparent', color: '#888', border: '1px solid #444', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontFamily: 'sans-serif', fontSize: 13 }}
        >
          Close
        </button>
      </div>

      <div className="container">
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 4 }}>CraftFlow</div>
            <div style={{ fontSize: 12, color: '#888' }}>Job Sheet</div>
          </div>
          <div style={{ textAlign: 'right', fontSize: 12, color: '#666' }}>
            <div>Printed: {printDate}</div>
            <div style={{ marginTop: 4, fontSize: 11 }}>ID: {id.slice(0, 8)}</div>
          </div>
        </div>

        {/* Section 1: Project Info */}
        <h2>Project Info</h2>
        <h1>{customer?.name ?? 'Unknown Customer'}</h1>
        <div className="row" style={{ marginTop: 12 }}>
          {customer?.phone && (
            <div className="field">
              <div className="label">Phone</div>
              <div className="value">{customer.phone}</div>
            </div>
          )}
          {customer?.email && (
            <div className="field">
              <div className="label">Email</div>
              <div className="value">{customer.email}</div>
            </div>
          )}
          {project.address && (
            <div className="field">
              <div className="label">Address</div>
              <div className="value">{project.address}</div>
            </div>
          )}
        </div>
        <div className="row">
          {project.project_type && (
            <div className="field">
              <div className="label">Project Type</div>
              <div className="value" style={{ textTransform: 'capitalize' }}>{project.project_type.replace(/_/g, ' ')}</div>
            </div>
          )}
          {project.status && (
            <div className="field">
              <div className="label">Status</div>
              <div className="value">{STATUS_LABELS[project.status] ?? project.status}</div>
            </div>
          )}
          {project.primary_material && (
            <div className="field">
              <div className="label">Primary Material</div>
              <div className="value">{project.primary_material}</div>
            </div>
          )}
          {(project.expected_delivery_start || project.expected_delivery_end) && (
            <div className="field">
              <div className="label">Expected Delivery</div>
              <div className="value">
                {project.expected_delivery_start ? new Date(project.expected_delivery_start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
                {project.expected_delivery_start && project.expected_delivery_end ? ' — ' : ''}
                {project.expected_delivery_end ? new Date(project.expected_delivery_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
              </div>
            </div>
          )}
        </div>

        {/* Section 2: Project Type Answers */}
        {answeredFields.length > 0 && (
          <>
            <h2>Project Details — {project.project_type?.replace(/_/g, ' ')}</h2>
            <div className="row" style={{ flexWrap: 'wrap' }}>
              {answeredFields.map(field => (
                <div key={field.id} className="field" style={{ minWidth: 180 }}>
                  <div className="label">{field.field_label}</div>
                  <div className="value">{answerMap[field.id]}</div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Section 3 (was 2): Key Details */}
        <h2>Key Details</h2>
        <div className="row">
          {(project.width_inches || project.height_inches || project.depth_inches) && (
            <div className="field">
              <div className="label">Dimensions (W × H × D)</div>
              <div className="value">
                {project.width_inches ?? '?'}&quot; × {project.height_inches ?? '?'}&quot; × {project.depth_inches ?? '?'}&quot;
              </div>
            </div>
          )}
          {project.ceiling_height_inches && (
            <div className="field">
              <div className="label">Ceiling Height</div>
              <div className="value">{project.ceiling_height_inches}&quot;</div>
            </div>
          )}
        </div>
        {requestedAddonNames.length > 0 && (
          <div style={{ marginBottom: 8 }}>
            <div className="label">Requested Add-Ons</div>
            <div className="value">{requestedAddonNames.join(', ')}</div>
          </div>
        )}
        {project.notes && (
          <div style={{ marginBottom: 8 }}>
            <div className="label">Notes</div>
            <div className="value" style={{ whiteSpace: 'pre-wrap' }}>{project.notes}</div>
          </div>
        )}

        {/* Section 3: Current Step */}
        {currentStep && (
          <>
            <h2>Current Step</h2>
            <h3>{currentStep.step_name}</h3>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
              <span className="badge">{currentStep.step_type}</span>
              {currentStep.waiting_on && (
                <span style={{ fontSize: 13 }}>Waiting on: <strong>{currentStep.waiting_on}</strong></span>
              )}
            </div>
            {currentSubtasks.length > 0 && (
              <div>
                <div className="label" style={{ marginBottom: 6 }}>Subtasks</div>
                {currentSubtasks.map(sub => (
                  <div key={sub.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 13 }}>
                    <span className={`check-box ${sub.completed ? 'check-filled' : ''}`} />
                    <span style={{ textDecoration: sub.completed ? 'line-through' : 'none', color: sub.completed ? '#888' : '#111' }}>
                      {sub.description}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Section 4: Open Questions */}
        {questions.length > 0 && (
          <>
            <h2>Open Questions</h2>
            {questions.map(q => (
              <div key={q.id} className="q-row">
                <span className="q-badge">{q.directed_at ?? 'internal'}</span>
                {q.question}
              </div>
            ))}
          </>
        )}

        {/* Section 5: Materials Checklist */}
        {materials.length > 0 && (
          <>
            <h2>Materials Checklist</h2>
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Cost Est.</th>
                  <th style={{ textAlign: 'center' }}>Ordered</th>
                  <th style={{ textAlign: 'center' }}>Received</th>
                </tr>
              </thead>
              <tbody>
                {materials.map(mat => (
                  <tr key={mat.id}>
                    <td>{mat.item_name}</td>
                    <td>{mat.cost_estimate != null ? `$${mat.cost_estimate.toFixed(0)}` : '—'}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span className={`check-box ${mat.ordered ? 'check-filled' : ''}`} />
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span className={`check-box ${mat.received ? 'check-filled' : ''}`} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {/* Section 6: Production Steps Summary */}
        {steps.length > 0 && (
          <>
            <h2>Production Steps — {completedCount}/{steps.length} complete</h2>
            {steps.map((step, idx) => (
              <div key={step.id} className="step-row">
                <span className="step-num">{step.sequence_order ?? idx + 1}</span>
                {step.is_current ? (
                  <span className="check-arrow">→</span>
                ) : step.completed ? (
                  <span className="check-arrow" style={{ color: '#555' }}>✓</span>
                ) : (
                  <span className="check-box" />
                )}
                <span style={{
                  textDecoration: step.completed ? 'line-through' : 'none',
                  color: step.completed ? '#888' : step.is_current ? '#111' : '#333',
                  fontWeight: step.is_current ? 700 : 400,
                }}>
                  {step.step_name}
                </span>
              </div>
            ))}
          </>
        )}

        <div style={{ marginTop: 40, borderTop: '1px solid #ddd', paddingTop: 12, fontSize: 11, color: '#aaa', textAlign: 'center' }}>
          CraftFlow Job Sheet · {printDate}
        </div>
      </div>
    </>
  )
}
