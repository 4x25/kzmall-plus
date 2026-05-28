import { useMemo } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table'
import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react'
import type { ProductRow } from '../../lib/inventory-data'
import { Card } from '../ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table'
import { cn } from '../../lib/utils'

interface InventoryTableProps {
  data: ProductRow[]
  sorting: SortingState
  onSortingChange: (updater: SortingState | ((old: SortingState) => SortingState)) => void
}

function SortIcon({ sorted }: { sorted: false | 'asc' | 'desc' }) {
  if (sorted === 'asc') return <ArrowUp className="size-3" />
  if (sorted === 'desc') return <ArrowDown className="size-3" />
  return <ArrowUpDown className="size-3 opacity-40" />
}

export function InventoryTable({ data, sorting, onSortingChange }: InventoryTableProps) {
  const columns = useMemo<ColumnDef<ProductRow, unknown>[]>(() => [
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
    data,
    columns,
    state: { sorting },
    onSortingChange,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  return (
    <Card className="overflow-hidden p-0">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((hg) => (
            <TableRow key={hg.id} className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="px-4">序号</TableHead>
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
              <TableCell colSpan={columns.length + 1} className="h-32 text-center text-muted-foreground">
                暂无匹配数据
              </TableCell>
            </TableRow>
          ) : (
            table.getRowModel().rows.map((row, index) => (
              <TableRow key={row.id}>
                <TableCell className="px-4 font-mono text-muted-foreground tabular-nums">{index + 1}</TableCell>
                {row.getVisibleCells().map((cell) => {
                  const colId = cell.column.id
                  const isNumeric = colId === 'qty_1' || colId === 'saleQty'
                  const isCode = colId === 'invNo' || colId === 'skuId'

                  return (
                    <TableCell key={cell.id} className={cn('px-4', (isNumeric || isCode) && 'font-mono tabular-nums', isNumeric && 'text-right')}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  )
                })}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </Card>
  )
}
