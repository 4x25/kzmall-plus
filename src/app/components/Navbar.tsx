import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Package } from 'lucide-react'
import { cn } from '../lib/utils'

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
            cn(
              'inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors',
              isActive
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            )
          }
        >
          <item.icon className="size-4" />
          {item.label}
        </NavLink>
      ))}
    </nav>
  )
}
