import { NavLink } from 'react-router-dom'
import { LayoutDashboard, LineChart, Package } from 'lucide-react'
import { cn } from '../lib/utils'

const navItems = [
  { path: '/', label: '首页概览', icon: LayoutDashboard },
  { path: '/inventory', label: '库存销量', icon: Package },
  { path: '/sales-report', label: '销售报表', icon: LineChart }
]

export function Navbar() {
  return (
    <nav className="flex items-center gap-3">
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
