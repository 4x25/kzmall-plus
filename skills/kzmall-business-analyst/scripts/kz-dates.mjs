/**
 * 日期口径解析与窗口切分。
 *
 * 为什么必须有这个文件：快准车服是中国境内业务，"昨天""本月"只能按
 * Asia/Shanghai 判定；而运行 Agent 的机器时区未知。让模型自己心算日期是
 * 本技能明确禁止的（属于计算），所以日期一律由脚本产出。
 *
 * 用法：
 *   node kz-dates.mjs today
 *   node kz-dates.mjs yesterday
 *   node kz-dates.mjs this-month
 *   node kz-dates.mjs last-month --split 7
 *   node kz-dates.mjs 2026-08-01..2026-08-21 --split 7
 */

const TZ = process.env.KZP_TZ || 'Asia/Shanghai'
const DAY = 86400000

const fmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** 当前时区下的今天（YYYY-MM-DD）。 */
export function today() {
  return fmt.format(new Date())
}

/** 把 YYYY-MM-DD 当成"民用日期"处理：转成 UTC 午夜再做整天加减，不受时区漂移影响。 */
const toEpoch = (d) => Date.parse(`${d}T00:00:00Z`)
const toDate = (ms) => new Date(ms).toISOString().slice(0, 10)

export function addDays(d, n) {
  return toDate(toEpoch(d) + n * DAY)
}

export function daysBetween(begin, end) {
  return Math.round((toEpoch(end) - toEpoch(begin)) / DAY) + 1
}

const firstOfMonth = (d) => `${d.slice(0, 7)}-01`

function lastOfMonth(d) {
  const [y, m] = d.split('-').map(Number)
  return toDate(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1) - DAY)
}

function addMonths(ym, n) {
  const [y, m] = ym.split('-').map(Number)
  const total = y * 12 + (m - 1) + n
  return `${String(Math.floor(total / 12)).padStart(4, '0')}-${String((total % 12) + 1).padStart(2, '0')}`
}

/** 周一为一周起点，符合国内经营习惯。 */
function startOfWeek(d) {
  const dow = new Date(toEpoch(d)).getUTCDay() // 0=周日
  return addDays(d, -((dow + 6) % 7))
}

/**
 * 解析自然语言日期表达式。
 * @returns {{begin:string,end:string,label:string,kind:'day-range'}}
 */
export function resolveRange(expr) {
  const t = today()
  const e = String(expr ?? '').trim().toLowerCase()

  const exact = /^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/.exec(e)
  if (exact) return { begin: exact[1], end: exact[2], label: `${exact[1]} 至 ${exact[2]}`, kind: 'day-range' }
  if (/^\d{4}-\d{2}-\d{2}$/.test(e)) return { begin: e, end: e, label: e, kind: 'day-range' }
  if (/^\d{4}-\d{2}$/.test(e)) {
    const b = `${e}-01`
    return { begin: b, end: lastOfMonth(b), label: `${e} 整月`, kind: 'day-range' }
  }

  const lastN = /^last-(\d+)-days?$/.exec(e)
  if (lastN) {
    const n = Number(lastN[1])
    return { begin: addDays(t, -n), end: addDays(t, -1), label: `最近 ${n} 天（不含今天）`, kind: 'day-range' }
  }

  switch (e) {
    case 'today':
    case '今天':
      return { begin: t, end: t, label: `今天 ${t}`, kind: 'day-range' }
    case 'yesterday':
    case '昨天': {
      const y = addDays(t, -1)
      return { begin: y, end: y, label: `昨天 ${y}`, kind: 'day-range' }
    }
    case 'this-month':
    case '本月':
      // 结束日取今天：本月尚未结束，写成月末会让报表包含未发生的日期
      return { begin: firstOfMonth(t), end: t, label: `本月 ${t.slice(0, 7)}（1 日至今天 ${t}）`, kind: 'day-range' }
    case 'last-month':
    case '上月': {
      const lm = addMonths(t.slice(0, 7), -1)
      return { begin: `${lm}-01`, end: lastOfMonth(`${lm}-01`), label: `上月 ${lm} 整月`, kind: 'day-range' }
    }
    case 'this-week':
    case '本周': {
      const b = startOfWeek(t)
      return { begin: b, end: t, label: `本周（${b} 起至今天 ${t}）`, kind: 'day-range' }
    }
    case 'last-week':
    case '上周': {
      const b = addDays(startOfWeek(t), -7)
      return { begin: b, end: addDays(b, 6), label: `上周（${b} 至 ${addDays(b, 6)}）`, kind: 'day-range' }
    }
    case 'this-year':
    case '今年':
      return { begin: `${t.slice(0, 4)}-01-01`, end: t, label: `今年至今（至 ${t}）`, kind: 'day-range' }
    default:
      throw new Error(
        `无法解析日期表达式 "${expr}"。支持：today / yesterday / this-week / last-week / this-month / last-month / this-year / last-N-days / YYYY-MM-DD / YYYY-MM / YYYY-MM-DD..YYYY-MM-DD`,
      )
  }
}

/** 月度端点（profit-report）用的 YYYY-MM 区间。 */
export function resolveMonthRange(expr) {
  const r = resolveRange(expr)
  return { startMonth: r.begin.slice(0, 7), endMonth: r.end.slice(0, 7), label: r.label }
}

/** 月报（month-report）要求每个端点值都是当月 1 日。 */
export function resolveMonthFirstDays(expr) {
  const r = resolveRange(expr)
  return { beginDate: `${r.begin.slice(0, 7)}-01`, endDate: `${r.end.slice(0, 7)}-01`, label: r.label }
}

/**
 * 把区间切成不超过 maxDays 天的连续窗口。
 *
 * 这不是"自动扩大日期范围"——用户要的区间没有变，只是让每一次 HTTP 请求都
 * 独立满足 7 天/2 MiB 预算。切分后必须逐窗口成功，任一窗口失败就整体作废。
 */
export function splitWindows(begin, end, maxDays) {
  if (daysBetween(begin, end) < 1) throw new Error(`区间无效：${begin}..${end}`)
  const out = []
  let cursor = begin
  while (toEpoch(cursor) <= toEpoch(end)) {
    const stop = addDays(cursor, maxDays - 1)
    const winEnd = toEpoch(stop) > toEpoch(end) ? end : stop
    out.push({ begin: cursor, end: winEnd })
    cursor = addDays(winEnd, 1)
  }
  return out
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2)
  const expr = args.find((a) => !a.startsWith('--')) ?? 'today'
  const splitIdx = args.indexOf('--split')
  try {
    const range = resolveRange(expr)
    const out = {
      timezone: TZ,
      today: today(),
      ...range,
      days: daysBetween(range.begin, range.end),
      monthRange: { startMonth: range.begin.slice(0, 7), endMonth: range.end.slice(0, 7) },
      monthFirstDays: { beginDate: `${range.begin.slice(0, 7)}-01`, endDate: `${range.end.slice(0, 7)}-01` },
    }
    if (splitIdx !== -1) {
      const maxDays = Number(args[splitIdx + 1] || 7)
      out.windows = splitWindows(range.begin, range.end, maxDays)
      out.window_count = out.windows.length
    }
    console.log(JSON.stringify(out, null, 2))
  } catch (err) {
    console.error(err.message)
    process.exit(1)
  }
}
