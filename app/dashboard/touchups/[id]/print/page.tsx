'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { getTouchups } from '@/lib/api/supabase-client'
import type { Touchup, Customer } from '@/lib/core/types'

export default function TouchupPrintPage() {
  const { id } = useParams<{ id: string }>()
  const [touchup, setTouchup] = useState<Touchup | null>(null)
  const [loading, setLoading] = useState(true)
  const [printDate] = useState(new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }))

  useEffect(() => {
    getTouchups()
      .then(all => setTouchup(all.find(t => t.id === id) ?? null))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <div style={{ padding: 32, fontFamily: 'sans-serif' }}>Loading...</div>
  if (!touchup) return <div style={{ padding: 32, fontFamily: 'sans-serif' }}>Touch-up not found.</div>

  const linkedName =
    touchup.customer?.name ??
    (touchup.project?.customer as Customer | undefined)?.name ??
    null
  const projectLabel = touchup.project
    ? `${linkedName ?? 'Unknown'} — ${touchup.project.project_type?.replace(/_/g, ' ') ?? 'Project'}`
    : linkedName

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; }
        }
        body { font-family: Georgia, serif; background: white; color: #111; margin: 0; }
        .container { max-width: 600px; margin: 0 auto; padding: 32px; }
        .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #666; margin-bottom: 2px; }
        .value { font-size: 14px; margin-bottom: 14px; }
        .badge { display: inline-block; font-size: 11px; font-weight: 700; text-transform: uppercase; padding: 2px 8px; border-radius: 4px; border: 1px solid #ccc; margin-right: 6px; }
        .urgent { background: #fee2e2; border-color: #ef4444; color: #991b1b; }
      `}</style>

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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 4 }}>CraftFlow</div>
            <div style={{ fontSize: 12, color: '#888' }}>Touch-Up / Field Job</div>
          </div>
          <div style={{ textAlign: 'right', fontSize: 12, color: '#666' }}>
            <div>{printDate}</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
          {touchup.priority === 'urgent' && <span className="badge urgent">Urgent</span>}
          <span className="badge">{touchup.status.replace('_', ' ')}</span>
        </div>

        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 20, lineHeight: 1.3 }}>
          {touchup.description}
        </div>

        {touchup.assigned_to && (
          <>
            <div className="label">Assigned To</div>
            <div className="value">{touchup.assigned_to}</div>
          </>
        )}

        {touchup.address && (
          <>
            <div className="label">Address</div>
            <div className="value">{touchup.address}</div>
          </>
        )}

        {projectLabel && (
          <>
            <div className="label">Linked Project</div>
            <div className="value">{projectLabel}</div>
          </>
        )}

        {touchup.notes && (
          <>
            <div className="label">Notes</div>
            <div className="value" style={{ whiteSpace: 'pre-wrap' }}>{touchup.notes}</div>
          </>
        )}

        <div style={{ marginTop: 40, borderTop: '1px solid #ddd', paddingTop: 12, fontSize: 11, color: '#aaa' }}>
          CraftFlow · {printDate}
        </div>
      </div>
    </>
  )
}
