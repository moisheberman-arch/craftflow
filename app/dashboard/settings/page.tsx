'use client'

import Link from 'next/link'

const SETTINGS_CARDS = [
  {
    href: '/dashboard/settings/workflow',
    title: '⚙️ Workflow',
    description: 'Define project statuses and tasks.',
  },
  {
    href: '/dashboard/settings/pricing',
    title: '💲 Pricing Config',
    description: 'Materials and add-on pricing used by the AI quote agent.',
  },
  {
    href: '/dashboard/settings/project-types',
    title: '📋 Project Types',
    description: 'Per-type data capture fields shown on project details.',
  },
  {
    href: '/dashboard/settings/steps',
    title: '🪜 Step Templates',
    description: 'Legacy production step library (being replaced by Workflow).',
  },
  {
    href: '/dashboard/settings/manage-projects',
    title: '🗂 Manage Projects',
    description: 'Bulk view and manage all projects.',
  },
]

export default function SettingsLandingPage() {
  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {SETTINGS_CARDS.map(card => (
          <Link key={card.href} href={card.href}
            className="bg-white shadow-sm border border-gray-200 rounded-xl p-5 hover:border-blue-300 transition-colors block">
            <h2 className="font-semibold text-gray-900 mb-1">{card.title}</h2>
            <p className="text-sm text-gray-500">{card.description}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
