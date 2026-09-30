import { NavLink } from 'react-router-dom'
import {
  ActivityIcon,
  BellIcon,
  FileIcon,
  MapPinIcon,
  MessageIcon,
  SettingsIcon,
  ShieldIcon,
} from './icons'

const NAV = [
  { to: '/', label: 'Overview', icon: ActivityIcon, end: true },
  { to: '/reports', label: 'Reports', icon: FileIcon },
  { to: '/alerts', label: 'Alerts', icon: BellIcon },
  { to: '/map', label: 'Map', icon: MapPinIcon },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
]

export default function Sidebar() {
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-neutral-200 bg-white">
      <div className="flex items-center gap-2.5 px-5 pb-5 pt-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white shadow-glow">
          <ShieldIcon size={20} />
        </div>
        <div>
          <div className="text-sm font-semibold tracking-tight text-neutral-900">Peace-Watch</div>
          <div className="text-[11px] text-neutral-500">Community warning system</div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-2">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-brand-600 text-white'
                  : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900'
              }`
            }
          >
            <Icon size={17} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="m-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
        <div className="flex items-center gap-2">
          <MessageIcon size={15} className="text-neutral-500" />
          <span className="text-xs font-medium text-neutral-700">WhatsApp channel</span>
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-neutral-500">
          Not connected yet. Incoming messages will appear as reports in Step 3.
        </p>
        <span className="mt-2 inline-flex items-center rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium text-neutral-500">
          Not connected
        </span>
      </div>
    </aside>
  )
}
