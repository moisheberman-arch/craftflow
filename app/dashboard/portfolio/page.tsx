'use client'

import { useEffect, useState } from 'react'
import { getPortfolioProjects, getDeliveryPhotoUrl } from '@/lib/api/supabase-client'
import type { Project, DeliveryPhoto } from '@/lib/core/types'

interface PortfolioEntry {
  project: Project
  photos: DeliveryPhoto[]
}

export default function PortfolioPage() {
  const [entries, setEntries] = useState<PortfolioEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [hiddenNames, setHiddenNames] = useState<Set<string>>(new Set())
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)

  useEffect(() => {
    getPortfolioProjects()
      .then(data => setEntries(data.filter(e => e.photos.length > 0)))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  function toggleName(projectId: string) {
    setHiddenNames(prev => {
      const next = new Set(prev)
      if (next.has(projectId)) next.delete(projectId); else next.add(projectId)
      return next
    })
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Portfolio</h1>
        <p className="text-sm text-gray-500 mt-0.5">Completed work, captured at delivery.</p>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : entries.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <p className="text-lg mb-2">No portfolio entries yet</p>
          <p className="text-sm">Delivery photos from completed projects will appear here.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {entries.map(({ project, photos }) => {
            const nameHidden = hiddenNames.has(project.id)
            return (
              <div key={project.id} className="bg-white shadow-sm border border-gray-200 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p className="font-bold text-gray-900 text-lg">
                      {nameHidden ? 'Anonymous' : (project.customer?.name ?? 'Anonymous')}
                    </p>
                    <p className="text-sm text-gray-500 capitalize">
                      {project.project_type?.replace(/_/g, ' ') ?? 'Project'}
                      {project.status === 'completed' && project.updated_at && (
                        <span className="text-gray-400"> · Completed {new Date(project.updated_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
                      )}
                    </p>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-500">
                    <input
                      type="checkbox"
                      checked={!nameHidden}
                      onChange={() => toggleName(project.id)}
                      className="accent-blue-600 w-3.5 h-3.5"
                    />
                    Show customer name
                  </label>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {photos.map(photo => {
                    const url = getDeliveryPhotoUrl(photo.file_path)
                    return (
                      <div key={photo.id}>
                        <button onClick={() => setLightboxUrl(url)}
                          className="w-full aspect-square block rounded-xl overflow-hidden bg-gray-100 border border-gray-300 hover:opacity-90 transition-opacity">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={url} alt={photo.caption ?? photo.file_name} className="w-full h-full object-cover" />
                        </button>
                        {photo.caption && (
                          <p className="text-xs text-gray-500 mt-1 truncate">{photo.caption}</p>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
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
    </div>
  )
}
