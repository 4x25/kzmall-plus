import { Package } from 'lucide-react'

export function InventoryPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">库存销量盘点</h1>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="flex items-center justify-center py-20 text-gray-400">
          <Package className="w-12 h-12 mb-3" />
          <div className="text-center">
            <p className="text-lg font-medium">暂无数据</p>
            <p className="text-sm mt-1">请先登录快准车服账号以查看库存信息</p>
          </div>
        </div>
      </div>
    </div>
  )
}