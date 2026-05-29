import { useState, useEffect, useCallback, useMemo } from 'react'
import { Loader2, AlertCircle } from 'lucide-react'
import type { SortingState } from '@tanstack/react-table'
import * as XLSX from 'xlsx'
import { QueryPanel } from '../components/inventory/QueryPanel'
import { InventoryTable } from '../components/inventory/InventoryTable'
import { fetchBrands, fetchInventory, fetchSales, type BrandOption, type ProductRow } from '../lib/inventory-data'
import type { DropdownOption } from '../components/inventory/SearchableDropdown'
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert'
import { Card } from '../components/ui/card'

function firstDayOfMonthStr() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`
}

function todayStr() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
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
  const [startDate, setStartDate] = useState(firstDayOfMonthStr())
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
      setSorting([
        { id: 'saleQty', desc: true },
        { id: 'qty_1', desc: true },
      ])
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
    <div className="space-y-6">
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

      {loading && (
        <Card className="flex items-center justify-center py-16 text-muted-foreground">
          <div className="flex items-center gap-2 text-sm">
            <Loader2 className="size-5 animate-spin" />
            加载中…
          </div>
        </Card>
      )}

      {queried && !loading && error && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>查询失败</AlertTitle>
          <AlertDescription className="whitespace-pre-wrap break-all">{error}</AlertDescription>
        </Alert>
      )}

      {queried && !loading && !error && <InventoryTable data={data} sorting={sorting} onSortingChange={setSorting} onExport={handleExport} />}
    </div>
  )
}
