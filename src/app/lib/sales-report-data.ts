import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'

dayjs.locale('zh-cn')

export type ReportPeriodType = 'day' | 'week' | 'month'

export type ReportMetricKey = 'grossProfit' | 'salesRevenue' | 'salesCost'

export interface MetricSummary {
  total: number
  normal: number
  keyAccount: number
}

export interface SalesReportSummary {
  grossProfit: MetricSummary
  salesRevenue: MetricSummary
  salesCost: MetricSummary
}

export interface SalesReportTrendItem {
  label: string
  startDate: string
  endDate: string
  normal: number
  keyAccount: number
}

export interface SalesReportResult {
  summary: SalesReportSummary
  trends: Record<ReportMetricKey, SalesReportTrendItem[]>
}

interface NormalSalesRow {
  date: string
  recAmount: number | string
  cost: number | string
  saleProfit: number | string
}

interface KeyAccountSalesRow {
  billDate: string
  totalAmount: number | string
  totalPurPrice: number | string
  totalCost: number | string
}

interface NormalSalesResponse {
  status: number
  msg?: string
  data: { rows: NormalSalesRow[] }
}

interface KeyAccountSalesResponse {
  success: boolean
  msg?: string
  data: { rows: KeyAccountSalesRow[] }
}

interface PeriodRange {
  label: string
  startDate: string
  endDate: string
}

interface MetricValues {
  grossProfit: number
  salesRevenue: number
  salesCost: number
}

const emptyMetricValues = (): MetricValues => ({
  grossProfit: 0,
  salesRevenue: 0,
  salesCost: 0,
})

function parseJSON<T>(res: Response): Promise<T> {
  return res.text().then((text) => {
    try {
      return JSON.parse(text) as T
    } catch {
      throw new Error(text.slice(0, 500))
    }
  })
}

function toNumber(value: unknown) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function formatDate(date: dayjs.Dayjs) {
  return date.format('YYYY-MM-DD')
}

function parseSelectedDate(periodType: ReportPeriodType, value: string) {
  if (periodType === 'month') return dayjs(`${value}-01`)
  return dayjs(value)
}

function getPeriodRange(periodType: ReportPeriodType, date: dayjs.Dayjs): PeriodRange {
  if (periodType === 'week') {
    const start = date.startOf('week')
    const end = date.endOf('week')
    return {
      label: `${start.format('M/D')}-${end.format('M/D')}`,
      startDate: formatDate(start),
      endDate: formatDate(end),
    }
  }

  if (periodType === 'month') {
    const start = date.startOf('month')
    const end = date.endOf('month')
    return {
      label: start.format('YYYY-MM'),
      startDate: formatDate(start),
      endDate: formatDate(end),
    }
  }

  return {
    label: date.format('M/D'),
    startDate: formatDate(date),
    endDate: formatDate(date),
  }
}

export function getCurrentPeriodRange(periodType: ReportPeriodType, value: string) {
  return getPeriodRange(periodType, parseSelectedDate(periodType, value))
}

function getRecentPeriods(periodType: ReportPeriodType, value: string) {
  const selected = parseSelectedDate(periodType, value)
  return Array.from({ length: 10 }).map((_, index) => {
    const offset = index - 9
    const date = periodType === 'day'
      ? selected.add(offset, 'day')
      : periodType === 'week'
        ? selected.add(offset, 'week')
        : selected.add(offset, 'month')
    return getPeriodRange(periodType, date)
  })
}

function findPeriodIndex(periods: PeriodRange[], value: string) {
  const date = formatDate(dayjs(value))
  return periods.findIndex((period) => date >= period.startDate && date <= period.endDate)
}

async function fetchNormalSalesDetail(startDate: string, endDate: string): Promise<NormalSalesRow[]> {
  const params = new URLSearchParams({
    beginDate: startDate,
    endDate,
    customerNo: '',
    goodsNo: '',
    storageNo: '',
    brandId: '',
    cateoryTreeValue: '',
    categoryTreeAllValue: '',
    saleType: '-1',
    kzCategoryIds: '[]',
    action: 'sales_detail',
    _search: 'false',
    sidx: 'date',
    sord: 'desc',
    salesId: '',
  })
  const res = await fetch(`/api/report/salesDetail_detail_cost?${params}`)
  const json = await parseJSON<NormalSalesResponse>(res)
  if (json.status !== 200) throw new Error(json.msg || '获取普通客户销售数据失败')
  return json.data.rows
}

async function fetchKeyAccountSalesDetail(startDate: string, endDate: string): Promise<KeyAccountSalesRow[]> {
  const params = new URLSearchParams({
    action: 'list',
    matchCon: '',
    transType: '180601',
    beginDate: startDate,
    endDate,
    relationOrderNo: '',
    _search: 'false',
    sidx: '',
    sord: 'asc',
    salesId: '0',
    hxState: '0',
    serviceType: '0',
    sourceType: '0',
    delieverId: '0',
    customType: '0',
    billStatus: '',
  })
  const res = await fetch(`/api/scm/invCu?${params}`)
  const json = await parseJSON<KeyAccountSalesResponse>(res)
  if (!json.success) throw new Error(json.msg || '获取大客户销售数据失败')
  return json.data.rows
}

export async function fetchSalesReport(periodType: ReportPeriodType, value: string): Promise<SalesReportResult> {
  const periods = getRecentPeriods(periodType, value)
  const rangeStart = periods[0].startDate
  const rangeEnd = periods[periods.length - 1].endDate
  const normalValues = periods.map(emptyMetricValues)
  const keyAccountValues = periods.map(emptyMetricValues)

  const [normalRows, keyAccountRows] = await Promise.all([
    fetchNormalSalesDetail(rangeStart, rangeEnd),
    fetchKeyAccountSalesDetail(rangeStart, rangeEnd),
  ])

  for (const row of normalRows) {
    const index = findPeriodIndex(periods, row.date)
    if (index < 0) continue
    normalValues[index].grossProfit += toNumber(row.saleProfit)
    normalValues[index].salesRevenue += toNumber(row.recAmount)
    normalValues[index].salesCost += toNumber(row.cost)
  }

  for (const row of keyAccountRows) {
    const index = findPeriodIndex(periods, row.billDate)
    if (index < 0) continue
    keyAccountValues[index].grossProfit += toNumber(row.totalCost)
    keyAccountValues[index].salesRevenue += toNumber(row.totalAmount)
    keyAccountValues[index].salesCost += toNumber(row.totalPurPrice)
  }

  const currentIndex = periods.length - 1
  const createSummary = (key: ReportMetricKey): MetricSummary => ({
    normal: normalValues[currentIndex][key],
    keyAccount: keyAccountValues[currentIndex][key],
    total: normalValues[currentIndex][key] + keyAccountValues[currentIndex][key],
  })
  const createTrend = (key: ReportMetricKey): SalesReportTrendItem[] => periods.map((period, index) => ({
    ...period,
    normal: normalValues[index][key],
    keyAccount: keyAccountValues[index][key],
  }))

  return {
    summary: {
      grossProfit: createSummary('grossProfit'),
      salesRevenue: createSummary('salesRevenue'),
      salesCost: createSummary('salesCost'),
    },
    trends: {
      grossProfit: createTrend('grossProfit'),
      salesRevenue: createTrend('salesRevenue'),
      salesCost: createTrend('salesCost'),
    },
  }
}
