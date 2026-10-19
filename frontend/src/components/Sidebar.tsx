import { NavLink } from 'react-router-dom'
import { FileIcon, ShieldIcon, UsersIcon } from './icons'

export const NAV = [
  { to: '/', label: 'Reports', icon: FileIcon, end: true },
  { to: '/quarter-heads', label: 'Quarter Heads', icon: UsersIcon, end: false },
] as const

function BrandRow() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-neutral-900 text-white">
        <ShieldIcon size={18} />
      </div>
      <div>
        <div className="text-sm font-semibold tracking-tight text-neutral-900">Peace-Watch</div>
        <div className="text-[11px] text-neutral-500">Community reports</div>
      </div>
    </div>
  )
}

/** Desktop: dark rail nav. */
export default function Sidebar() {
  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-neutral-200 bg-white md:flex">
      <div className="px-5 pb-5 pt-6">
        <BrandRow />
      </div>

      <nav className="flex-1 space-y-1 px-3 py-2">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `-mx-1 flex items-center gap-2.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-neutral-900 text-white'
                  : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
              }`
            }
          >
            <Icon size={17} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="px-5 pb-6">
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3">
          <p className="text-[11px] leading-relaxed text-neutral-500">
            Verified quarter heads get each report from their area on WhatsApp.
          </p>
        </div>
      </div>
    </aside>
  )
}

/** Mobile: slim top bar with horizontal nav pills. */
export function MobileBar() {
  return (
    <header className="sticky top-0 z-40 border-b border-neutral-200 bg-white md:hidden">
      <div className="flex items-center justify-between px-4 pb-2 pt-3">
        <BrandRow />
      </div>
      <nav className="flex gap-1.5 overflow-x-auto px-4 pb-3">
        {NAV.map(({ to, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                isActive
                  ? 'bg-neutral-900 text-white'
                  : 'border border-neutral-200 bg-white text-neutral-600'
              }`
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>
    </header>
  )
}
