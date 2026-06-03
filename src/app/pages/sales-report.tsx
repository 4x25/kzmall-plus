import { useCallback, useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { AlertCircle, Loader2 } from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from 'recharts'
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { DatePicker } from '../components/ui/date-picker'
import { Input } from '../components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table'
import { cn } from '../lib/utils'
import {
  fetchSalesReport,
  getCurrentPeriodRange,
  type ReportMetricKey,
  type ReportPeriodType,
  type SalesReportResult,
} from '../lib/sales-report-data'

const periodOptions: { value: ReportPeriodType; label: string }[] = [
  { value: 'day', label: '日' },
  { value: 'week', label: '周' },
  { value: 'month', label: '月' },
]

const metricOptions: { key: ReportMetricKey; label: string }[] = [
  { key: 'grossProfit', label: '毛利润' },
  { key: 'salesRevenue', label: '销售收入' },
  { key: 'salesCost', label: '销售成本' },
]

type ChartViewType = 'line' | 'bar' | 'table'

const viewOptions: { value: ChartViewType; label: string }[] = [
  { value: 'line', label: '趋势图' },
  { value: 'bar', label: '柱状图' },
  { value: 'table', label: '表格' },
]

function todayValue() {
  return dayjs().format('YYYY-MM-DD')
}

function currentMonthValue() {
  return dayjs().format('YYYY-MM')
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
    maximumFractionDigits: 2,
  }).format(value)
}

function TooltipContent({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null

  return (
    <div className="rounded-lg border bg-background p-3 text-sm shadow-sm">
      <div className="mb-2 font-medium">{label}</div>
      {payload.map((item) => (
        <div key={item.dataKey} className="flex items-center justify-between gap-6 text-muted-foreground">
          <span>{item.name}</span>
          <span className="font-medium text-foreground">{formatCurrency(Number(item.value ?? 0))}</span>
        </div>
      ))}
    </div>
  )
}

export function SalesReportPage() {
  const [periodType, setPeriodType] = useState<ReportPeriodType>('day')
  const [selectedDate, setSelectedDate] = useState(todayValue())
  const [selectedMonth, setSelectedMonth] = useState(currentMonthValue())
  const [selectedMetric, setSelectedMetric] = useState<ReportMetricKey>('grossProfit')
  const [viewType, setViewType] = useState<ChartViewType>('line')
  const [report, setReport] = useState<SalesReportResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const filterValue = periodType === 'month' ? selectedMonth : selectedDate
  const currentRange = useMemo(() => getCurrentPeriodRange(periodType, filterValue), [filterValue, periodType])
  const selectedMetricLabel = metricOptions.find((item) => item.key === selectedMetric)?.label ?? ''
  const trendData = report?.trends[selectedMetric] ?? []

  const loadReport = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetchSalesReport(periodType, filterValue)
      setReport(result)
    } catch (e) {
      setReport(null)
      setError(e instanceof Error ? e.message : '请求失败')
    } finally {
      setLoading(false)
    }
  }, [filterValue, periodType])

  useEffect(() => {
    loadReport()
  }, [loadReport])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">销售报表</h1>
          <p className="mt-1 text-sm text-muted-foreground">当前周期：{currentRange.startDate} 至 {currentRange.endDate}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-md border bg-background p-1 shadow-xs">
            {periodOptions.map((item) => (
              <Button
                key={item.value}
                type="button"
                variant={periodType === item.value ? 'default' : 'ghost'}
                size="sm"
                className="h-7 px-3"
                onClick={() => setPeriodType(item.value)}
              >
                {item.label}
              </Button>
            ))}
          </div>
          {periodType === 'month' ? (
            <Input
              type="month"
              value={selectedMonth}
              max={currentMonthValue()}
              onChange={(event) => setSelectedMonth(event.target.value)}
              className="w-[180px]"
            />
          ) : (
            <DatePicker value={selectedDate} onChange={setSelectedDate} />
          )}
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>查询失败</AlertTitle>
          <AlertDescription className="whitespace-pre-wrap break-all">{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {metricOptions.map((item) => {
          const value = report?.summary[item.key] ?? { total: 0, normal: 0, keyAccount: 0 }
          const selected = selectedMetric === item.key

          return (
            <Card
              key={item.key}
              role="button"
              tabIndex={0}
              className={cn(
                'cursor-pointer gap-3 py-4 transition-colors hover:border-primary/60',
                selected && 'border-primary shadow-md ring-2 ring-primary/15'
              )}
              onClick={() => setSelectedMetric(item.key)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') setSelectedMetric(item.key)
              }}
            >
              <CardHeader className="px-4 pb-0">
                <CardTitle className="text-sm font-medium text-muted-foreground">{item.label}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 px-4">
                <div className="text-2xl font-bold">{formatCurrency(value.total)}</div>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground">普通客户</span>
                    <span className="font-medium">{formatCurrency(value.normal)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground">大客户</span>
                    <span className="font-medium">{formatCurrency(value.keyAccount)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Card>
        <CardHeader className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle>{selectedMetricLabel}趋势</CardTitle>
            <CardDescription>最近 10 个周期，按普通客户和大客户区分</CardDescription>
          </div>
          <div className="inline-flex rounded-md border bg-background p-1 shadow-xs">
            {viewOptions.map((item) => (
              <Button
                key={item.value}
                type="button"
                variant={viewType === item.value ? 'default' : 'ghost'}
                size="sm"
                className="h-7 px-3"
                onClick={() => setViewType(item.value)}
              >
                {item.label}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex h-[360px] items-center justify-center text-muted-foreground">
              <div className="flex items-center gap-2 text-sm">
                <Loader2 className="size-5 animate-spin" />
                加载中…
              </div>
            </div>
          ) : viewType === 'table' ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>周期</TableHead>
                  <TableHead className="text-right">普通客户</TableHead>
                  <TableHead className="text-right">大客户</TableHead>
                  <TableHead className="text-right">合计</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trendData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                      暂无数据
                    </TableCell>
                  </TableRow>
                ) : (
                  trendData.map((item) => (
                    <TableRow key={item.label}>
                      <TableCell className="font-medium">{item.label}</TableCell>
                      <TableCell className="text-right">{formatCurrency(item.normal)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(item.keyAccount)}</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(item.normal + item.keyAccount)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          ) : (
            <div className="h-[360px]">
              <ResponsiveContainer width="100%" height="100%">
                {viewType === 'bar' ? (
                  <BarChart data={trendData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                    <YAxis tickLine={false} axisLine={false} fontSize={12} tickFormatter={(value) => `${Number(value) / 10000}万`} />
                    <Tooltip content={<TooltipContent />} cursor={{ fill: 'var(--muted)', opacity: 0.4 }} />
                    <Legend />
                    <Bar dataKey="normal" name="普通客户" fill="#2563eb" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="keyAccount" name="大客户" fill="#f97316" radius={[4, 4, 0, 0]} />
                  </BarChart>
                ) : (
                  <LineChart data={trendData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                    <YAxis tickLine={false} axisLine={false} fontSize={12} tickFormatter={(value) => `${Number(value) / 10000}万`} />
                    <Tooltip content={<TooltipContent />} />
                    <Legend />
                    <Line type="monotone" dataKey="normal" name="普通客户" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                    <Line type="monotone" dataKey="keyAccount" name="大客户" stroke="#f97316" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                  </LineChart>
                )}
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
