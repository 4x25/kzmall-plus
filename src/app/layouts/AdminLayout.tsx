import { useState } from 'react'
import { Outlet, Navigate, useNavigate } from 'react-router-dom'
import { Sidebar } from '../components/Sidebar'
import { Menu, LogOut } from 'lucide-react'
import { isLoggedIn, clearAuth } from '../lib/auth'

export function AdminLayout() {
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  if (!isLoggedIn()) {
    return <Navigate to="/login" replace />
  }

  const handleLogout = () => {
    clearAuth()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div className="fixed inset-y-0 left-0 z-50 w-64 bg-sidebar transform transition-transform duration-200 ease-in-out lg:translate-x-0">
        <Sidebar onClose={() => setSidebarOpen(false)} />
      </div>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg hover:bg-gray-100"
          >
            <Menu className="w-5 h-5 text-gray-600" />
          </button>
          <span className="font-semibold text-gray-900">快准商城+</span>
          <button onClick={handleLogout} className="p-2 rounded-lg hover:bg-gray-100">
            <LogOut className="w-5 h-5 text-gray-600" />
          </button>
        </header>

        <header className="hidden lg:flex sticky top-0 z-30 bg-white border-b border-gray-200 px-6 py-3 items-center justify-between">
          <div />
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">管理员</span>
            <button onClick={handleLogout} className="p-2 rounded-lg hover:bg-gray-100">
              <LogOut className="w-5 h-5 text-gray-600" />
            </button>
          </div>
        </header>

        <main className="p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}