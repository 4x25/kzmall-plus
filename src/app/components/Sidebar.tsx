import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Package, X } from 'lucide-react'

interface SidebarProps {
  onClose?: () => void
}

const navItems = [
  { path: '/', label: '首页概览', icon: LayoutDashboard },
  { path: '/inventory', label: '库存销量', icon: Package }
]

export function Sidebar({ onClose }: SidebarProps) {
  return (
    <div className="flex flex-col h-full text-white">
      {/* Logo */}
      <div className="flex items-center justify-between h-16 px-5 border-b border-white/10">
        <span className="text-lg font-bold">快准商城+</span>
        {onClose && (
          <button onClick={onClose} className="p-1 rounded hover:bg-sidebar-hover">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-3 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            onClick={onClose}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                isActive
                  ? 'bg-sidebar-active text-white'
                  : 'text-gray-300 hover:bg-sidebar-hover hover:text-white'
              }`
            }
          >
            <item.icon className="w-5 h-5" />
            <span className="text-sm font-medium">{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}