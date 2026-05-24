import { BarChart3, Package } from 'lucide-react'

export function DashboardPage() {
  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-center gap-3">
            <Package className="w-5 h-5 text-primary" />
            <span className="text-sm text-gray-500">商品总数</span>
          </div>
          <p className="text-2xl font-bold text-gray-900 mt-2">--</p>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-center gap-3">
            <BarChart3 className="w-5 h-5 text-emerald-500" />
            <span className="text-sm text-gray-500">今日销量</span>
          </div>
          <p className="text-2xl font-bold text-gray-900 mt-2">--</p>
        </div>
      </div>
    </div>
  )
}