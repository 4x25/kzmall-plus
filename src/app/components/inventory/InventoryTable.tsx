import { useEffect, useMemo, useState } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table'
import { ArrowUp, ArrowDown, ArrowUpDown, Download, Settings2 } from 'lucide-react'
import type { ProductRow } from '../../lib/inventory-data'
import { Card } from '../ui/card'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table'
import { cn } from '../../lib/utils'

interface InventoryTableProps {
  data: ProductRow[]
  sorting: SortingState
  onSortingChange: (updater: SortingState | ((old: SortingState) => SortingState)) => void
  onExport: () => void
}

const COLUMN_VISIBILITY_STORAGE_KEY = 'inventory-table-column-visibility'
const PAGE_SIZE_STORAGE_KEY = 'inventory-table-page-size'

function SortIcon({ sorted }: { sorted: false | 'asc' | 'desc' }) {
  if (sorted === 'asc') return <ArrowUp className="size-3" />
  if (sorted === 'desc') return <ArrowDown className="size-3" />
  return <ArrowUpDown className="size-3 opacity-40" />
}

export function InventoryTable({ data, sorting, onSortingChange, onExport }: InventoryTableProps) {
  const [pagination, setPagination] = useState(() => {
    const savedPageSize = Number(localStorage.getItem(PAGE_SIZE_STORAGE_KEY))
    return { pageIndex: 0, pageSize: [10, 20, 50, 100].includes(savedPageSize) ? savedPageSize : 20 }
  })
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [jumpPage, setJumpPage] = useState('')
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(() => {
    try {
      const saved = localStorage.getItem(COLUMN_VISIBILITY_STORAGE_KEY)
      return saved ? JSON.parse(saved) : {}
    } catch {
      return {}
    }
  })

  useEffect(() => {
    localStorage.setItem(PAGE_SIZE_STORAGE_KEY, String(pagination.pageSize))
  }, [pagination.pageSize])

  useEffect(() => {
    localStorage.setItem(COLUMN_VISIBILITY_STORAGE_KEY, JSON.stringify(columnVisibility))
  }, [columnVisibility])

  useEffect(() => {
    setPagination((current) => ({ ...current, pageIndex: 0 }))
  }, [data, sorting, search])

  const filteredData = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    if (!keyword) return data

    return data.filter((row) => [
      row.invNo,
      row.invName,
      row.skuId,
      row.spec,
      row.unit,
      row.packSpec,
      row.brandName,
      row.categoryName,
    ].some((value) => String(value ?? '').toLowerCase().includes(keyword)))
  }, [data, search])

  const columns = useMemo<ColumnDef<ProductRow, unknown>[]>(() => [
    {
      id: 'rowNo',
      header: '序号',
      cell: () => null,
      enableSorting: false,
      enableHiding: false,
    },
    { accessorKey: 'invNo', header: '商品编号' },
    { accessorKey: 'invName', header: '商品名称' },
    { accessorKey: 'skuId', header: '物料编码' },
    { accessorKey: 'spec', header: '规格型号' },
    { accessorKey: 'unit', header: '单位' },
    { accessorKey: 'packSpec', header: '包装规格' },
    { accessorKey: 'brandName', header: '商品品牌', cell: (info) => <span className="font-medium">{info.getValue() as string}</span> },
    { accessorKey: 'categoryName', header: '商品分类' },
    {
      accessorKey: 'simpleCode',
      header: '商品简码',
      cell: (info) => (info.getValue() as string) || '—',
    },
    {
      accessorKey: 'in_time',
      header: '最近入库时间',
      cell: (info) => <span className="font-mono text-xs text-muted-foreground">{(info.getValue() as string) || '—'}</span>,
      enableSorting: false,
    },
    {
      accessorKey: 'out_time',
      header: '最近出库时间',
      cell: (info) => <span className="font-mono text-xs text-muted-foreground">{(info.getValue() as string) || '—'}</span>,
      enableSorting: false,
    },
    {
      id: 'qty_1',
      header: '库存数量',
      accessorFn: (row) => Number.parseFloat(row.qty_1) || 0,
      cell: (info) => <span className="block text-right font-mono tabular-nums">{(info.getValue() as number).toFixed(info.getValue() as number % 1 === 0 ? 0 : 1)}</span>,
      enableSorting: true,
    },
    {
      id: 'saleQty',
      header: '销售数量',
      accessorFn: (row) => row.saleQty,
      cell: (info) => <span className="block text-right font-mono tabular-nums">{info.getValue() as number}</span>,
      enableSorting: true,
    },
  ], [])

  const table = useReactTable({
    data: filteredData,
    columns,
    defaultColumn: { enableSorting: false },
    state: { sorting, pagination, columnVisibility },
    onSortingChange,
    onPaginationChange: setPagination,
    onColumnVisibilityChange: setColumnVisibility,
    isMultiSortEvent: () => true,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  })

  const firstRow = filteredData.length === 0 ? 0 : pagination.pageIndex * pagination.pageSize + 1
  const lastRow = Math.min(filteredData.length, (pagination.pageIndex + 1) * pagination.pageSize)
  const pageCount = table.getPageCount()
  const currentPage = pageCount === 0 ? 0 : pagination.pageIndex + 1

  useEffect(() => {
    setJumpPage(String(currentPage))
  }, [currentPage])

  const handleSearch = () => {
    setSearch(searchInput)
  }

  const handleJumpPage = () => {
    const page = Number(jumpPage)
    if (!Number.isInteger(page) || page < 1 || page > pageCount) {
      setJumpPage(String(currentPage))
      return
    }
    table.setPageIndex(page - 1)
  }

  return (
    <Card className="gap-0 overflow-hidden p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex min-w-[280px] flex-1 items-center gap-2">
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSearch()
            }}
            placeholder="搜索商品编号、商品名称、物料编码、规格型号、单位、包装规格、商品品牌、商品分类"
            className="h-9 max-w-xl"
          />
          <Button type="button" variant="outline" className="h-9" onClick={handleSearch}>
            搜索
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" className="h-9" onClick={onExport} disabled={data.length === 0}>
            <Download className="size-4" />
            导出
          </Button>
          <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" className="h-9">
              <Settings2 className="size-4" />
              列展示
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-48 p-2">
            <div className="grid gap-1">
              {table.getAllLeafColumns().filter((column) => column.getCanHide()).map((column) => (
                <label key={column.id} className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent">
                  <input
                    type="checkbox"
                    checked={column.getIsVisible()}
                    onChange={column.getToggleVisibilityHandler()}
                    className="size-4 accent-primary"
                  />
                  {String(column.columnDef.header)}
                </label>
              ))}
            </div>
          </PopoverContent>
          </Popover>
        </div>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="bg-muted/50 hover:bg-muted/50">
                {hg.headers.map((header) => {
                  const canSort = header.column.getCanSort()
                  const sorted = header.column.getIsSorted()
                  return (
                    <TableHead
                      key={header.id}
                      className={cn('px-4', canSort && 'cursor-pointer select-none', (header.id === 'qty_1' || header.id === 'saleQty') && 'text-right')}
                      onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                    >
                      <span className={cn('inline-flex items-center gap-1', (header.id === 'qty_1' || header.id === 'saleQty') && 'justify-end')}>
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {canSort && <SortIcon sorted={sorted} />}
                      </span>
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={table.getVisibleLeafColumns().length} className="h-32 text-center text-muted-foreground">
                  暂无匹配数据
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row, rowIndex) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => {
                    const colId = cell.column.id
                    const isNumeric = colId === 'qty_1' || colId === 'saleQty'
                    const isCode = colId === 'rowNo' || colId === 'invNo' || colId === 'skuId'

                    return (
                      <TableCell key={cell.id} className={cn('px-4', (isNumeric || isCode) && 'font-mono tabular-nums', isNumeric && 'text-right')}>
                        {colId === 'rowNo'
                          ? pagination.pageIndex * pagination.pageSize + rowIndex + 1
                          : flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    )
                  })}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3">
        <div className="text-sm text-muted-foreground">
          显示 {firstRow}-{lastRow} / 共 {filteredData.length} 条
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>每页</span>
            <Select
              value={String(pagination.pageSize)}
              onValueChange={(value) => table.setPageSize(Number(value))}
            >
              <SelectTrigger className="w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 20, 50, 100].map((size) => (
                  <SelectItem key={size} value={String(size)}>{size}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>第</span>
            <Input
              type="number"
              min={1}
              max={pageCount}
              value={jumpPage}
              onChange={(e) => setJumpPage(e.target.value)}
              onBlur={() => setJumpPage(String(currentPage))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleJumpPage()
              }}
              className="h-8 w-16 text-center"
            />
            <span>/ {pageCount} 页</span>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
              上一页
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
              下一页
            </Button>
          </div>
        </div>
      </div>
    </Card>
  )
}
