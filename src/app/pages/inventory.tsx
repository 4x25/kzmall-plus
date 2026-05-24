import { useState, useEffect, useCallback, useMemo } from 'react'
import { Loader2, AlertCircle, Download } from 'lucide-react'
import type { SortingState } from '@tanstack/react-table'
import * as XLSX from 'xlsx'
import { QueryPanel } from '../components/inventory/QueryPanel'
import { InventoryTable } from '../components/inventory/InventoryTable'
import { fetchBrands, fetchInventory, fetchSales, type BrandOption, type ProductRow } from '../lib/inventory-data'
import type { DropdownOption } from '../components/inventory/SearchableDropdown'

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function getSortValue(row: ProductRow, id: string) {
  if (id === 'qty_1') return Number.parseFloat(row.qty_1) || 0
  if (id === 'saleQty') return row.saleQty
  return row[id as keyof ProductRow] ?? ''
}

function compareValues(a: unknown, b: unknown) {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b), 'zh-CN', { numeric: true, sensitivity: 'base' })
}

function formatQty(value: string) {
  const num = Number.parseFloat(value) || 0
  return Number(num.toFixed(num % 1 === 0 ? 0 : 1))
}

export function InventoryPage() {
  const [brands, setBrands] = useState<BrandOption[]>([])
  const [brandOptions, setBrandOptions] = useState<DropdownOption[]>([])
  const [selectedBrand, setSelectedBrand] = useState<number | null>(null)
  const [startDate, setStartDate] = useState('2024-05-01')
  const [endDate, setEndDate] = useState(todayStr())
  const [data, setData] = useState<ProductRow[]>([])
  const [sorting, setSorting] = useState<SortingState>([])
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

  const sortedData = useMemo(() => {
    if (sorting.length === 0) return data
    return [...data].sort((a, b) => {
      for (const sort of sorting) {
        const result = compareValues(getSortValue(a, sort.id), getSortValue(b, sort.id))
        if (result !== 0) return sort.desc ? -result : result
      }
      return 0
    })
  }, [data, sorting])

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

  const handleExport = useCallback(() => {
    const rows = sortedData.map((row, index) => ({
      序号: index + 1,
      商品编号: row.invNo,
      商品名称: row.invName,
      物料编码: row.skuId,
      规格型号: row.spec,
      单位: row.unit,
      包装规格: row.packSpec,
      商品品牌: row.brandName,
      商品分类: row.categoryName,
      商品简码: row.simpleCode,
      最近入库时间: row.in_time,
      最近出库时间: row.out_time,
      库存数量: formatQty(row.qty_1),
      销售数量: row.saleQty,
    }))
    const sheet = XLSX.utils.json_to_sheet(rows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, sheet, '库存销量')
    XLSX.writeFile(workbook, `库存销量_${startDate}_${endDate}.xlsx`)
  }, [endDate, sortedData, startDate])

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
        <div className="pt-3.5 pb-2.5 flex items-center justify-between gap-3 text-[13px] text-gray-500">
          <div>
            共 <strong className="text-gray-900 font-semibold">{loading ? '…' : data.length}</strong> 条记录
          </div>
          <button
            type="button"
            onClick={handleExport}
            disabled={loading || data.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-3.5 h-3.5" />
            导出
          </button>
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

      {queried && !loading && !error && <InventoryTable data={data} sorting={sorting} onSortingChange={setSorting} />}
    </div>
  )
}
