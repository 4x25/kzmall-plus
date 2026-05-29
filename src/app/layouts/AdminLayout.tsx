import { Link, Navigate, useNavigate, Outlet } from 'react-router-dom'
import { LogOut, Store } from 'lucide-react'
import { Navbar } from '../components/Navbar'
import { Button } from '../components/ui/button'
import { Separator } from '../components/ui/separator'
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
    <div className="min-h-screen bg-muted/30">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-16 items-center gap-6 px-4 lg:px-6">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Store className="size-5" />
            </div>
            <span>站管家+</span>
          </Link>
          <Separator orientation="vertical" className="h-6" />
          <Navbar />
          <div className="ml-auto">
            <Button variant="ghost" size="icon" onClick={handleLogout} aria-label="退出登录">
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>
      </header>
      <main className="p-4 lg:p-6">
        <Outlet />
      </main>
    </div>
  )
}
