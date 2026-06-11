'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

interface ApprovalDetails {
  approval_type: string
  file_url: string | null
  approved: boolean
  approved_at: string | null
  expired: boolean
  project_name: string | null
}

const TYPE_LABELS: Record<string, string> = {
  sketch: 'Sketch',
  rendering: 'Rendering',
  quote: 'Quote',
  other: 'Document',
}

export default function CustomerApprovalPage() {
  const { token } = useParams<{ token: string }>()
  const [details, setDetails] = useState<ApprovalDetails | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [notes, setNotes] = useState('')
  const [showNotes, setShowNotes] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    fetch(`/api/approve/${token}`)
      .then(async res => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Not found')
        setDetails(data)
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Something went wrong'))
      .finally(() => setLoading(false))
  }, [token])

  async function handleApprove() {
    setSubmitting(true)
    try {
      const res = await fetch(`/api/approve/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_notes: notes }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Approval failed')
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  const typeLabel = details ? (TYPE_LABELS[details.approval_type] ?? 'Document') : ''
  const isImage = details?.file_url ? /\.(jpe?g|png|gif|webp|heic)($|\?)/i.test(details.file_url) : false

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 flex flex-col items-center px-4 py-10">
      {/* Wordmark */}
      <p className="text-2xl font-bold text-blue-600 tracking-tight mb-8">CraftFlow</p>

      <div className="w-full max-w-lg bg-white border border-gray-200 rounded-2xl shadow-sm p-6 space-y-5">
        {loading ? (
          <p className="text-center text-gray-500 py-8">Loading...</p>
        ) : error && !details ? (
          <p className="text-center text-gray-500 py-8">{error}</p>
        ) : details?.approved || done ? (
          <div className="text-center py-8 space-y-2">
            <p className="text-4xl">✓</p>
            <p className="text-lg font-semibold text-emerald-600">You have already approved this. Thank you!</p>
            {details?.project_name && <p className="text-sm text-gray-500">{details.project_name}</p>}
          </div>
        ) : details?.expired ? (
          <div className="text-center py-8 space-y-2">
            <p className="text-4xl">⏰</p>
            <p className="text-lg font-semibold text-gray-700">This approval link has expired.</p>
            <p className="text-sm text-gray-500">Please contact us for a new one.</p>
          </div>
        ) : details ? (
          <>
            <div className="text-center space-y-1">
              <p className="text-sm text-gray-500">You have been asked to review and approve the following:</p>
              <p className="text-xl font-bold">{typeLabel}</p>
              {details.project_name && <p className="text-sm text-gray-500 capitalize">{details.project_name}</p>}
            </div>

            {details.file_url && (
              isImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={details.file_url} alt={typeLabel}
                  className="w-full rounded-xl border border-gray-200" />
              ) : (
                <a href={details.file_url} target="_blank" rel="noopener noreferrer"
                  className="block text-center bg-gray-100 hover:bg-gray-200 border border-gray-200 rounded-xl px-4 py-3 text-sm font-medium text-blue-600">
                  📄 View / Download {typeLabel}
                </a>
              )
            )}

            {!showNotes ? (
              <button
                onClick={() => setShowNotes(true)}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white text-lg font-bold py-4 rounded-xl transition-colors"
              >
                ✓ Approve
              </button>
            ) : (
              <div className="space-y-3">
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Any comments or notes (optional)"
                  className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={handleApprove}
                  disabled={submitting}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-lg font-bold py-4 rounded-xl transition-colors"
                >
                  {submitting ? 'Submitting...' : 'Submit Approval'}
                </button>
                {error && <p className="text-sm text-red-600 text-center">{error}</p>}
              </div>
            )}
          </>
        ) : null}
      </div>

      <p className="text-xs text-gray-400 mt-6">Powered by CraftFlow</p>
    </div>
  )
}
