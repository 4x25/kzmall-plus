import { BarChart3, Package, TrendingUp, Warehouse } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'

const stats = [
  { label: '商品总数', value: '--', icon: Package },
  { label: '今日销量', value: '--', icon: BarChart3 },
  { label: '库存预警', value: '--', icon: Warehouse },
  { label: '销售趋势', value: '--', icon: TrendingUp },
]

export function DashboardPage() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((item) => (
          <Card key={item.label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{item.label}</CardTitle>
              <item.icon className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{item.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
