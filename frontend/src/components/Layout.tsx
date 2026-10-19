import { Outlet } from 'react-router-dom'
import Sidebar, { MobileBar } from './Sidebar'

export default function Layout() {
  return (
    <div className="flex min-h-dvh bg-[#faf9f7] text-neutral-900 md:h-dvh md:min-h-0 md:flex-row md:overflow-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileBar />
        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
