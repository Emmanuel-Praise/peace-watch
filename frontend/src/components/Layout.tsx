import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import ReportForm from './ReportForm'

export default function Layout() {
  const [formOpen, setFormOpen] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden bg-white text-neutral-900">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onNewReport={() => setFormOpen(true)} />
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
      {formOpen && <ReportForm onClose={() => setFormOpen(false)} onCreated={() => {}} />}
    </div>
  )
}
