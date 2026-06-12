'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { getProjectById } from '@/lib/api/supabase-client'
import type { Project } from '@/lib/core/types'

export default function PrintLabelPage() {
  const { id } = useParams<{ id: string }>()
  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [printDate] = useState(new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }))

  useEffect(() => {
    getProjectById(id)
      .then(setProject)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [id])

  // Auto-trigger print once the project has rendered
  useEffect(() => {
    if (!loading && project) {
      const t = setTimeout(() => window.print(), 400)
      return () => clearTimeout(t)
    }
  }, [loading, project])

  if (loading) return <div className="text-center py-8 text-gray-500">Loading label...</div>
  if (!project) return <div className="text-center py-8 text-gray-500">Project not found</div>

  const projectName = `${project.customer?.name ?? 'Unknown Customer'} — ${project.project_type?.replace(/_/g, ' ') ?? 'Project'}`
  const colorText = project.color_finish ?? 'NO COLOR SPECIFIED'

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          nav { display: none !important; }
          main { padding: 0 !important; }
          body { background: white !important; }
        }
      `}</style>

      {/* Screen-only toolbar */}
      <div className="no-print flex items-center justify-between max-w-2xl mx-auto mb-6">
        <button onClick={() => window.history.back()} className="text-sm text-gray-500 hover:text-gray-900">← Back</button>
        <button onClick={() => window.print()}
          className="text-sm bg-blue-600 hover:bg-blue-500 text-white font-semibold px-4 py-2 rounded-lg">
          🖨 Print Label
        </button>
      </div>

      {/* Label — sized for a half-sheet of paper */}
      <div className="max-w-2xl mx-auto bg-white border-2 border-gray-900 rounded-lg p-10 text-center space-y-6 print:border-4 print:rounded-none print:shadow-none">
        <p className="text-2xl font-bold text-gray-900 capitalize">{projectName}</p>

        <div className="border-y-4 border-gray-900 py-8">
          <p className="text-xs uppercase tracking-widest text-gray-500 mb-2">Color / Finish</p>
          <p className={`font-black leading-tight ${colorText.length > 30 ? 'text-4xl' : 'text-6xl'} ${project.color_finish ? 'text-gray-900' : 'text-red-600'}`}>
            {colorText}
          </p>
          {project.primary_material && (
            <p className="text-xl text-gray-700 mt-3">on {project.primary_material}</p>
          )}
        </div>

        <div className="flex items-center justify-center gap-8 text-sm text-gray-600">
          <span>Ref: <span className="font-mono font-semibold text-gray-900">{project.id.slice(0, 8).toUpperCase()}</span></span>
          <span>Printed: {printDate}</span>
        </div>

        {project.notes && (
          <div className="text-left bg-gray-50 border border-gray-300 rounded-lg p-4 print:bg-white">
            <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Shop Notes</p>
            <p className="text-sm text-gray-800 whitespace-pre-wrap">{project.notes}</p>
          </div>
        )}
      </div>
    </>
  )
}
