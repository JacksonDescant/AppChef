import { useState } from 'react'
import { User, Briefcase, GraduationCap, FolderGit2, Wrench } from 'lucide-react'
import Profile from './Profile'
import Jobs from './Jobs'
import Education from './Education'
import Projects from './Projects'
import Skills from './Skills'

type Tab = 'profile' | 'jobs' | 'education' | 'projects' | 'skills'

const TABS: { id: Tab; label: string; icon: React.ComponentType<{ size?: number; strokeWidth?: number }> }[] = [
  { id: 'profile',   label: 'Profile',        icon: User },
  { id: 'jobs',      label: 'Work Experience', icon: Briefcase },
  { id: 'education', label: 'Education',       icon: GraduationCap },
  { id: 'projects',  label: 'Projects',        icon: FolderGit2 },
  { id: 'skills',    label: 'Skills',          icon: Wrench },
]

const SECTIONS: Record<Tab, React.ComponentType> = {
  profile:   Profile,
  jobs:      Jobs,
  education: Education,
  projects:  Projects,
  skills:    Skills,
}

export default function Resume() {
  const [tab, setTab] = useState<Tab>('profile')

  return (
    <div>
      <div className="flex gap-1 mb-7 p-1 bg-zinc-900 border border-zinc-800/80 rounded-lg w-fit shadow-[0_1px_3px_rgba(0,0,0,0.4)]">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-150 ${
              tab === id
                ? 'bg-zinc-800 text-zinc-100 shadow-sm border border-zinc-700/60'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <Icon size={13} strokeWidth={tab === id ? 2 : 1.75} />
            {label}
          </button>
        ))}
      </div>

      {(Object.entries(SECTIONS) as [Tab, React.ComponentType][]).map(([id, Section]) => (
        <div key={id} className={tab === id ? undefined : 'hidden'}>
          <Section />
        </div>
      ))}
    </div>
  )
}
