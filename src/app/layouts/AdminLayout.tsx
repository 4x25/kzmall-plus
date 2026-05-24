import { Navigate, useNavigate, Outlet } from 'react-router-dom'
import { Navbar } from '../components/Navbar'
import { LogOut } from 'lucide-react'
import { isLoggedIn, signOut } from '../lib/auth'

export function AdminLayout() {
  const navigate = useNavigate()

  if (!isLoggedIn()) {
    return <Navigate to="/login" replace />
  }

  const handleLogout = async () => {
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-30 bg-navbar border-b border-white/10 px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Navbar />
        </div>
        <div className="flex items-center gap-3">
          <button onClick={handleLogout} className="p-2 rounded-lg hover:bg-navbar-hover">
            <LogOut className="w-5 h-5 text-gray-300" />
          </button>
        </div>
      </header>

      <main className="p-4 lg:p-6">
        <Outlet />
      </main>
    </div>
  )
}
