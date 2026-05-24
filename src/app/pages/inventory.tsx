import { useState, useEffect, useCallback } from 'react'
import { Loader2, AlertCircle } from 'lucide-react'
import { QueryPanel } from '../components/inventory/QueryPanel'
import { InventoryTable } from '../components/inventory/InventoryTable'
import { fetchBrands, fetchInventory, fetchSales, type BrandOption, type ProductRow } from '../lib/inventory-data'
import type { DropdownOption } from '../components/inventory/SearchableDropdown'

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

export function InventoryPage() {
  const [brands, setBrands] = useState<BrandOption[]>([])
  const [brandOptions, setBrandOptions] = useState<DropdownOption[]>([])
  const [selectedBrand, setSelectedBrand] = useState<number | null>(null)
  const [startDate, setStartDate] = useState('2024-05-01')
  const [endDate, setEndDate] = useState(todayStr())
  const [data, setData] = useState<ProductRow[]>([])
  const [loading, setLoading] = useState(false)
  const [queried, setQueried] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchBrands()
      .then((list) => {
        setBrands(list)
        setBrandOptions([
          { value: null, label: '全部品牌' },
          ...list.map((b) => ({ value: b.id as number, label: b.name })),
        ])
      })
      .catch(() => {})
  }, [])

  const handleQuery = useCallback(async () => {
    setLoading(true)
    setQueried(true)
    setError(null)
    try {
      const [salesRows, inventoryRows] = await Promise.all([
        fetchSales(selectedBrand, startDate, endDate),
        fetchInventory(selectedBrand),
      ])
      const salesMap = new Map<string, number>()
      for (const row of salesRows) {
        salesMap.set(row.skuId, (salesMap.get(row.skuId) ?? 0) + row.qty)
      }
      const merged = inventoryRows.map((row) => ({
        ...row,
        saleQty: salesMap.get(row.skuId) ?? 0,
      }))
      setData(merged)
    } catch (e) {
      setData([])
      setError(e instanceof Error ? e.message : '请求失败')
    } finally {
      setLoading(false)
    }
  }, [selectedBrand, startDate, endDate])

  return (
    <div>
      <QueryPanel
        brandOptions={brandOptions}
        selectedBrand={selectedBrand}
        onBrandChange={(v) => setSelectedBrand(v as number | null)}
        startDate={startDate}
        onStartDateChange={setStartDate}
        endDate={endDate}
        onEndDateChange={setEndDate}
        onQuery={handleQuery}
        loading={loading}
      />

      {queried && (
        <div className="pt-3.5 pb-2.5 text-[13px] text-gray-500">
          共 <strong className="text-gray-900 font-semibold">{loading ? '…' : data.length}</strong> 条记录
        </div>
      )}

      {loading && (
        <div className="mb-8 bg-white border border-gray-200 rounded-md flex items-center justify-center py-16 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          <span className="text-sm">加载中…</span>
        </div>
      )}

      {queried && !loading && error && (
        <div className="mb-8 bg-white border border-red-200 rounded-md flex items-start gap-3 py-6 px-5 text-red-700">
          <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
          <div className="text-sm leading-relaxed whitespace-pre-wrap break-all">{error}</div>
        </div>
      )}

      {queried && !loading && !error && <InventoryTable data={data} />}
    </div>
  )
}