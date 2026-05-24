import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Package } from 'lucide-react'

const navItems = [
  { path: '/', label: '首页概览', icon: LayoutDashboard },
  { path: '/inventory', label: '库存销量', icon: Package }
]

export function Navbar() {
  return (
    <nav className="flex items-center gap-1">
      {navItems.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          end={item.path === '/'}
          className={({ isActive }) =>
            `flex items-center gap-2 px-4 py-2 rounded-md transition-colors ${
              isActive
                ? 'bg-navbar-active text-white'
                : 'text-gray-300 hover:bg-navbar-hover hover:text-white'
            }`
          }
        >
          <item.icon className="w-4 h-4" />
          <span className="text-sm font-medium">{item.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}