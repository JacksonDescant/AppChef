import { ChefHat, LayoutDashboard, FileText, Target, ClipboardList, Sparkles, Settings } from 'lucide-react'
import type { ViewId } from '../App'

interface NavItem { id: ViewId; label: string; icon: React.ComponentType<{ size?: number; strokeWidth?: number }> }

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard',    label: 'Dashboard',    icon: LayoutDashboard },
  { id: 'resume',       label: 'Resume',       icon: FileText },
  { id: 'target-jobs',  label: 'Target Roles', icon: Target },
  { id: 'applications', label: 'Applications', icon: ClipboardList },
  { id: 'generate',     label: 'Generate',     icon: Sparkles },
]

interface SidebarProps { view: ViewId; setView: (id: ViewId) => void }

export default function Sidebar({ view, setView }: SidebarProps) {
  return (
    <aside className="w-52 shrink-0 flex flex-col bg-[#111113] border-r border-zinc-800/60 min-h-screen">
      {/* Brand */}
      <div className="px-4 py-5">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center shadow-[0_0_10px_rgba(249,115,22,0.35)]">
            <ChefHat size={13} className="text-white" strokeWidth={2.5} />
          </div>
          <span className="font-semibold text-zinc-100 text-sm tracking-tight">AppChef</span>
        </div>
      </div>

      <div className="px-2 flex-1 flex flex-col">
        {/* Nav label */}
        <p className="px-2 mb-1.5 text-[10px] font-semibold text-zinc-600 uppercase tracking-widest">Workspace</p>

        <nav className="flex flex-col gap-0.5">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
            const active = view === id
            return (
              <button
                key={id}
                onClick={() => setView(id)}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium transition-all duration-150 text-left ${
                  active
                    ? 'bg-orange-500/10 text-orange-400 border border-orange-500/15'
                    : 'text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.04] border border-transparent'
                }`}
              >
                <Icon size={14} strokeWidth={active ? 2 : 1.75} />
                {label}
              </button>
            )
          })}
        </nav>
      </div>

      {/* Settings at bottom */}
      <div className="px-2 py-3 border-t border-zinc-800/60">
        <button
          onClick={() => setView('settings')}
          className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium transition-all duration-150 text-left ${
            view === 'settings'
              ? 'bg-orange-500/10 text-orange-400 border border-orange-500/15'
              : 'text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.04] border border-transparent'
          }`}
        >
          <Settings size={14} strokeWidth={view === 'settings' ? 2 : 1.75} />
          Settings
        </button>
      </div>
    </aside>
  )
}
