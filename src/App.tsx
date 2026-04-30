import { useState } from 'react'
import type { ComponentType } from 'react'
import Sidebar from './components/Sidebar'
import Dashboard from './components/Dashboard'
import Resume from './components/Resume'
import TargetJobs from './components/TargetJobs'
import Applications from './components/Applications'
import Generate from './components/Generate'
import Settings from './components/Settings'

export type ViewId = 'dashboard' | 'resume' | 'target-jobs' | 'applications' | 'generate' | 'settings'

const VIEWS: Record<ViewId, ComponentType> = {
  'dashboard':    Dashboard,
  'resume':       Resume,
  'target-jobs':  TargetJobs,
  'applications': Applications,
  'generate':     Generate,
  'settings':     Settings,
}

export default function App() {
  const [view, setView] = useState<ViewId>('dashboard')

  return (
    <div className="flex min-h-screen bg-[#09090b] text-zinc-100">
      <Sidebar view={view} setView={setView} />
      <main className="flex-1 overflow-y-auto">
        {(Object.entries(VIEWS) as [ViewId, ComponentType][]).map(([id, View]) => (
          <div
            key={id}
            className={`p-8 ${id === 'applications' ? 'h-full flex flex-col' : ''} ${view === id ? '' : 'hidden'}`}
          >
            <View />
          </div>
        ))}
      </main>
    </div>
  )
}
