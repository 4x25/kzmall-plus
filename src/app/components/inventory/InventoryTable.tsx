import { useMemo } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table'
import { useState } from 'react'
import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react'
import type { ProductRow } from '../../lib/inventory-data'

interface InventoryTableProps {
  data: ProductRow[]
}

function SortIcon({ sorted }: { sorted: false | 'asc' | 'desc' }) {
  if (sorted === 'asc') return <ArrowUp className="w-3 h-3" />
  if (sorted === 'desc') return <ArrowDown className="w-3 h-3" />
  return <ArrowUpDown className="w-3 h-3 opacity-40" />
}

export function InventoryTable({ data }: InventoryTableProps) {
  const [sorting, setSorting] = useState<SortingState>([])

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
      cell: (info) => <span className="font-mono text-gray-400 text-xs">{info.getValue() as string || '—'}</span>,
      enableSorting: false,
    },
    {
      accessorKey: 'out_time',
      header: '最近出库时间',
      cell: (info) => <span className="font-mono text-gray-400 text-xs">{info.getValue() as string || '—'}</span>,
      enableSorting: false,
    },
    {
      id: 'qty_1',
      header: '库存数量',
      accessorFn: (row) => parseFloat(row.qty_1) || 0,
      cell: (info) => <span className="font-mono tabular-nums text-right block">{(info.getValue() as number).toFixed(info.getValue() as number % 1 === 0 ? 0 : 1)}</span>,
      enableSorting: true,
    },
    {
      id: 'saleQty',
      header: '销售数量',
      accessorFn: (row) => row.saleQty,
      cell: (info) => <span className="font-mono tabular-nums text-right block">{info.getValue() as number}</span>,
      enableSorting: true,
    },
  ], [])

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  return (
    <div className="mx-8 mb-8 bg-white border border-gray-200 rounded-md overflow-auto">
      <table className="w-full border-collapse text-[13px] table-auto">
        <thead>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((header) => {
                const canSort = header.column.getCanSort()
                const sorted = header.column.getIsSorted()
                return (
                  <th
                    key={header.id}
                    className={`bg-[#f8f9fb] px-3.5 py-2.5 text-left text-xs font-semibold text-gray-500 tracking-wide border-b border-gray-200 whitespace-nowrap select-none
                      ${canSort ? 'cursor-pointer text-blue-600 hover:bg-[#eef0f4]' : ''}
                      ${header.id === 'qty_1' || header.id === 'saleQty' ? 'text-right' : ''}
                    `}
                    onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                  >
                    <span className="inline-flex items-center gap-1">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {canSort && <SortIcon sorted={sorted} />}
                    </span>
                  </th>
                )
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="text-center text-gray-400 py-12">
                暂无匹配数据
              </td>
            </tr>
          ) : (
            table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="hover:bg-blue-50/40 transition-colors">
                {row.getVisibleCells().map((cell) => {
                  const colId = cell.column.id
                  const isNumeric = colId === 'qty_1' || colId === 'saleQty'
                  const isCode = colId === 'invNo' || colId === 'skuId'
                  return (
                    <td
                      key={cell.id}
                      className={`px-3.5 py-2 border-b border-gray-100 whitespace-nowrap align-middle
                        ${isNumeric || isCode ? 'font-mono tabular-nums' : ''}
                        ${isNumeric ? 'text-right' : ''}
                        ${isCode ? '' : ''}
                      `}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  )
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}