/**
 * 快准车服网关 HTTP 层：构建请求、执行预算、判定业务成功、脱敏输出。
 *
 * 设计前提：调用方是一个通用 Agent，它可能会不小心把凭证写进命令行、日志或
 * 回答里。因此 Token 只从环境变量读取，任何其他来源都视为配置错误直接拒绝，
 * 并且所有对外输出都会过一遍 redact()。
 */

import { ENDPOINTS, PREDICATES, MAX_RESPONSE_BYTES, MAX_ROWS_RELIABLE, getEndpoint } from './kz-endpoints.mjs'
import { parseAmount, sumField, format, nearlyEqual, FACTOR } from './kz-money.mjs'

const TOKEN_SHAPE = /kza_v1_[A-Za-z0-9_-]{8,}/g

/** 把任何可能夹带 Token 的文本变成安全文本。所有 print/throw 都要经过这里。 */
export function redact(input) {
  let text = typeof input === 'string' ? input : String(input?.message ?? input)
  const token = process.env.KZP_AGENT_TOKEN
  if (token && token.length > 6) text = text.split(token).join('kza_v1_<redacted>')
  return text.replace(TOKEN_SHAPE, 'kza_v1_<redacted>')
}

export class KzError extends Error {
  constructor(message, extra = {}) {
    super(redact(message))
    this.name = 'KzError'
    Object.assign(this, extra)
  }
}

/**
 * 读取运行配置。
 *
 * 为什么这么严格：一旦 Token 出现在 argv 里，它就会进入 shell 历史、进程列表和
 * 各种 Agent 框架的命令回显，等于泄露。宁可让脚本失败，也不接受这种调用方式。
 */
export function loadConfig() {
  const leaked = process.argv.slice(2).find((a) => TOKEN_SHAPE.test(a))
  TOKEN_SHAPE.lastIndex = 0
  if (leaked) {
    throw new KzError(
      'Agent Token 不允许通过命令行参数传入（会落入进程列表和命令历史）。请改为设置环境变量 KZP_AGENT_TOKEN。',
    )
  }

  const baseUrl = process.env.KZP_BASE_URL
  const token = process.env.KZP_AGENT_TOKEN
  if (!baseUrl) throw new KzError('缺少环境变量 KZP_BASE_URL（kzmall-plus 应用地址，例如 https://your-app.example.com）。')
  if (!token) throw new KzError('缺少环境变量 KZP_AGENT_TOKEN（形如 kza_v1_ 开头的 Agent 凭证）。')
  if (!token.startsWith('kza_v1_')) {
    throw new KzError('KZP_AGENT_TOKEN 格式不正确：应以 kza_v1_ 开头。不要打印或转述该值。')
  }

  const timeoutMs = Number(process.env.KZP_TIMEOUT_MS || 60000)
  return { baseUrl: baseUrl.replace(/\/+$/, ''), token, timeoutMs }
}

/** 按有序模板求值，保留空键与重复键。 */
function renderPairs(template, params, { rows, page }) {
  const pairs = []
  const used = new Set()
  for (const [key, spec] of template) {
    let value
    if (typeof spec === 'string') {
      value = spec
    } else if (spec && spec.nd) {
      value = String(Date.now())
    } else if (spec && spec.rows) {
      value = String(rows)
    } else if (spec && spec.page) {
      value = String(page)
    } else if (spec && spec.p) {
      const provided = params[spec.p]
      used.add(spec.p)
      if (provided === undefined || provided === null || provided === '') {
        if (spec.opt) {
          value = spec.default ?? ''
        } else {
          throw new KzError(`缺少必填参数 --${spec.p}。`)
        }
      } else {
        value = String(provided)
      }
    } else {
      value = ''
    }
    pairs.push([key, value])
  }
  return { pairs, used }
}

function encodePairs(pairs) {
  const sp = new URLSearchParams()
  for (const [k, v] of pairs) sp.append(k, v) // append 而非 set，重复键才不会被吃掉
  return sp.toString()
}

function pick(obj, path) {
  if (path === '@raw') return obj?.data
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj)
}

/** 决定这次请求的 rows/page，并检查是否越过查询预算。 */
function resolvePaging(ep, { rows, page }) {
  const paging = ep.paging || { mode: 'none' }
  if (paging.mode === 'none') return { rows: 0, page: 1, paging }

  const wantPage = Number(page || 1)
  if (paging.neverPage && wantPage > 1) {
    throw new KzError(
      `${ep.title} 已证明不返回可靠分页元数据（rows=1 仍返回多行），请求第 ${wantPage} 页只会拿到重复数据。请改为缩小日期或增加窄化条件。`,
    )
  }
  if (paging.mode === 'single' && wantPage > 1) {
    throw new KzError(
      `${ep.title} 没有可靠服务端分页，不允许自动翻页。请缩小日期范围或增加业务条件，而不是请求第 ${wantPage} 页。`,
    )
  }
  if (paging.mode === 'date-bounded' && wantPage > 1) {
    throw new KzError(
      `${ep.title} 的行数上限就是日期跨度，一页装得下全部结果，不存在第 ${wantPage} 页。`,
    )
  }

  const cap = paging.mode === 'pages' || paging.mode === 'records' ? MAX_ROWS_RELIABLE : (paging.maxRows ?? MAX_ROWS_RELIABLE)
  const wantRows = Number(rows || paging.defaultRows || MAX_ROWS_RELIABLE)
  if (wantRows > cap) {
    throw new KzError(`${ep.title} 单次最多 ${cap} 行（当前请求 ${wantRows}）。`)
  }
  return { rows: wantRows, page: wantPage, paging }
}

/** 校验日期跨度，避免把大报表整块拉下来。 */
function checkDateBudget(key, ep, params) {
  if (!ep.dates) return null
  const { begin, end, unit, maxSpan } = ep.dates
  const b = params[begin]
  const e = params[end]
  if (!b || !e) return null

  if (unit === 'month') {
    if (!/^\d{4}-\d{2}$/.test(b) || !/^\d{4}-\d{2}$/.test(e)) {
      throw new KzError(`${ep.title} 的 ${begin}/${end} 必须是 YYYY-MM。`)
    }
    const months = (Number(e.slice(0, 4)) - Number(b.slice(0, 4))) * 12 + (Number(e.slice(5)) - Number(b.slice(5))) + 1
    if (months < 1) throw new KzError(`${begin} 不能晚于 ${end}。`)
    if (months > maxSpan) throw new KzError(`${ep.title} 单次最多查询 ${maxSpan} 个月（当前 ${months}）。`)
    return { spanDays: null, spanMonths: months }
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(b) || !/^\d{4}-\d{2}-\d{2}$/.test(e)) {
    throw new KzError(`${ep.title} 的 ${begin}/${end} 必须是 YYYY-MM-DD。`)
  }
  if (unit === 'month-first-day' && (!b.endsWith('-01') || !e.endsWith('-01'))) {
    throw new KzError(`${ep.title} 是月度口径，${begin}/${end} 必须是当月 1 日（YYYY-MM-01）。`)
  }
  const days = Math.round((Date.parse(`${e}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000) + 1
  if (days < 1) throw new KzError(`${begin} 不能晚于 ${end}。`)
  if (unit === 'month-first-day') {
    // 月度端点用"天"描述跨度会误导（上月整月会显示 spanDays: 1），按月计
    const months = (Number(e.slice(0, 4)) - Number(b.slice(0, 4))) * 12 + (Number(e.slice(5, 7)) - Number(b.slice(5, 7))) + 1
    if (months > 12) throw new KzError(`${ep.title} 单次最多查询 12 个月（当前 ${months}）。`)
    return { spanDays: null, spanMonths: months }
  }
  if (days > maxSpan) {
    const hint =
      maxSpan === 7
        ? `请用 kz-dates.mjs 的 split 把区间切成 ≤7 天的窗口分别查询（每次请求独立满足预算），再用 kz-compute.mjs 汇总。`
        : `请缩小区间或改用聚合口径更粗的端点（例如 month-report / profit-report）。`
    throw new KzError(`${ep.title} 单次最多 ${maxSpan} 天（当前 ${days} 天）。${hint}`)
  }
  return { spanDays: days, spanMonths: null }
}

/** 读取响应体，同时执行 2 MiB 硬上限。超限就停，不做"自动换更大页"。 */
async function readBounded(response, limit) {
  const reader = response.body?.getReader()
  if (!reader) return { text: '', bytes: 0, truncated: false }
  const chunks = []
  let bytes = 0
  let truncated = false
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    bytes += value.byteLength
    if (bytes > limit) {
      truncated = true
      await reader.cancel().catch(() => {})
      break
    }
    chunks.push(value)
  }
  return { text: new TextDecoder().decode(Buffer.concat(chunks.map((c) => Buffer.from(c)))), bytes, truncated }
}

/**
 * 执行一次注册表内的只读查询。
 * @returns {Promise<{rows:any[], footer:any, meta:object, raw:any}>}
 */
export async function callEndpoint(key, params = {}, opts = {}) {
  const ep = getEndpoint(key)
  const cfg = loadConfig()

  if (ep.costGated && !opts.allowCost) {
    throw new KzError(
      `${ep.title} 会返回成本与毛利。只有在用户明确要求成本/毛利/利润率时才可调用，并需显式传 --allow-cost。`,
    )
  }

  const dateInfo = checkDateBudget(key, ep, params)
  const { rows, page, paging } = resolvePaging(ep, opts)

  // 组装 URL
  const url = new URL(`${cfg.baseUrl}/api/${ep.path}`)
  let usedParams = new Set()
  if (ep.query) {
    const r = renderPairs(ep.query, params, { rows, page })
    url.search = encodePairs(r.pairs)
    usedParams = r.used
  }

  // 组装请求体
  const headers = { 'X-Credential': cfg.token, accept: 'application/json, text/javascript, */*; q=0.01' }
  let body
  if (ep.form) {
    const r = renderPairs(ep.form, params, { rows, page })
    for (const k of r.used) usedParams.add(k)
    body = encodePairs(r.pairs) + (ep.trailingAmp ? '&' : '')
    headers['content-type'] = 'application/x-www-form-urlencoded; charset=UTF-8'
  } else if (ep.body === 'empty-form') {
    // 抓包证明这里是零字节 body + urlencoded 头，不能换成 JSON 或省略头
    body = ''
    headers['content-type'] = 'application/x-www-form-urlencoded; charset=UTF-8'
  }

  // 未被模板消费的参数一定是拼错了或者端点不支持，直接报错胜过静默丢弃
  const unknown = Object.keys(params).filter((k) => !usedParams.has(k) && params[k] !== undefined)
  if (unknown.length) {
    throw new KzError(`${ep.title} 不接受参数：${unknown.join(', ')}。该端点支持的参数见 --describe ${key}。`)
  }

  if (ep.narrow && !ep.narrow.some((k) => params[k] !== undefined && params[k] !== '' && params[k] !== '[]')) {
    process.stderr.write(
      redact(
        `[提示] ${ep.title} 数据量大，建议至少给一个窄化条件（${ep.narrow.join(' / ')}），否则可能触达 2 MiB 上限。\n`,
      ),
    )
  }

  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), cfg.timeoutMs)
  let response
  try {
    response = await fetch(url, { method: ep.method, headers, body, signal: ac.signal, redirect: 'manual' })
  } catch (err) {
    clearTimeout(timer)
    throw new KzError(`请求 ${ep.title} 失败：${err?.name === 'AbortError' ? '超时' : redact(err)}`)
  }
  clearTimeout(timer)

  const { text, bytes, truncated } = await readBounded(response, MAX_RESPONSE_BYTES)
  if (truncated) {
    throw new KzError(
      `${ep.title} 响应超过 2 MiB 预算，已中止。请缩小日期范围或增加窄化条件；不要为了补全而放大页大小。`,
      { code: 'RESPONSE_TOO_LARGE' },
    )
  }

  let payload
  try {
    payload = JSON.parse(text)
  } catch {
    throw new KzError(
      `${ep.title} 返回了非 JSON 响应（HTTP ${response.status}）。可能是网关错误页或会话失效，不要把它当成"查询成功且无数据"。`,
      { code: 'NON_JSON_RESPONSE', httpStatus: response.status },
    )
  }

  // 网关错误信封与业务响应的区分方式：顶层有 error 对象且 HTTP 非 2xx
  if (payload && typeof payload === 'object' && payload.error && !response.ok) {
    const { code, message, requestId } = payload.error
    throw new KzError(gatewayHint(code, message, response, requestId), { code, requestId, httpStatus: response.status })
  }

  const predicateOk = PREDICATES[ep.success](payload)
  const emptySentinel = !predicateOk && matchesEmptySentinel(ep, payload)
  if (!predicateOk && !emptySentinel) {
    const msg = payload?.msg || payload?.message || ''
    throw new KzError(
      `${ep.title} 业务查询未成功（成功谓词 ${ep.success} 未满足${msg ? `，后端 msg：${msg}` : ''}）。按 fail closed 处理，不要把它解释成没有数据。`,
      { code: 'UPSTREAM_QUERY_FAILED', httpStatus: response.status },
    )
  }

  // 提取行容器
  let container = emptySentinel ? [] : pick(payload, ep.container)
  if (container === undefined && ep.emptyDataArrayOk && Array.isArray(payload?.data)) container = payload.data
  const isRaw = ep.container === '@raw'
  const rowsOut = isRaw ? container : Array.isArray(container) ? container : []
  if (!isRaw && !Array.isArray(container)) {
    if (container !== undefined && container !== null) {
      throw new KzError(`${ep.title} 的数据容器 ${ep.container} 不是数组，形态与文档不符，fail closed。`)
    }
  }

  const footer = ep.footer ? pick(payload, ep.footer) : undefined
  const { kept, excluded } = dropPseudoRows(ep, rowsOut, isRaw)
  const meta = buildMeta({ key, ep, payload, rowsOut: kept, bytes, rows, page, paging, dateInfo, params, isRaw, footer, emptySentinel })
  if (excluded) meta.excluded_rows = excluded
  return { rows: kept, footer, meta, raw: payload }
}

/**
 * 判断响应是否命中该端点声明的"精确空结果哨兵"。
 *
 * 为什么要逐项精确匹配而不是"status 不是 success 就当空"：后者会把权限不足、参数非法、
 * 会话失效这些真实故障统统说成"这段时间没有业务"，而用户完全没有办法察觉。
 * 所以这里宁可严格到"少一个条件就不认"——认不出来时报查询失败，方向上是安全的那一侧。
 */
function matchesEmptySentinel(ep, payload) {
  const s = ep.emptySentinel
  if (!s || !payload || typeof payload !== 'object' || Array.isArray(payload)) return false
  for (const [k, v] of Object.entries(s.match)) {
    if (payload[k] !== v) return false
  }
  if (s.dataEmptyArray && !(Array.isArray(payload.data) && payload.data.length === 0)) return false
  return true
}

/**
 * 剔除后端混在明细里的结构性伪行（小计 / 期初余额 / 合计）。
 *
 * 为什么必须在这里做、而不是留给计算层：这些伪行的金额本身就是同一批明细的合计，
 * 与明细行相加就是双倍计数。实测应付账款明细表 7 天 582 行里有 230 行 billNo="小计"，
 * 不剔除的话 income 合计正好翻倍（69139.02 而真值是 34569.51）——而且它还能通过
 * 页脚对账之外的任何一致性检查，因为行本身是"齐"的，错的是口径。所以取数阶段就要
 * 把口径修正掉，让落盘的数据直接可加。
 *
 * 剔除不静默：数量与原因都写进 manifest.excluded_rows，人可以复查这一步做了什么。
 */
function dropPseudoRows(ep, rowsOut, isRaw) {
  if (isRaw || !ep.excludeRows || !Array.isArray(rowsOut)) return { kept: rowsOut, excluded: null }
  const { field, values, why } = ep.excludeRows
  const hit = new Set(values)
  const kept = []
  const dropped = {}
  for (const row of rowsOut) {
    const v = String(row?.[field] ?? '').trim()
    if (hit.has(v)) dropped[v] = (dropped[v] ?? 0) + 1
    else kept.push(row)
  }
  const total = rowsOut.length - kept.length
  return {
    kept,
    excluded: {
      field,
      values,
      dropped: total,
      dropped_by_value: dropped,
      why,
      note:
        total > 0
          ? `已从 ${rowsOut.length} 行中剔除 ${total} 行伪行，剩余 ${kept.length} 行是可直接求和的明细。` +
            '若引用行数请用剩余行数，不要用原始行数。'
          : '本次没有出现伪行，行数即明细行数。',
    },
  }
}

/**
 * 对"一行一天/一行一月"的报表算出日期覆盖情况。
 *
 * 为什么单独做这件事：没有业务发生的日期后端根本不返回，行数少于天数是正常的。
 * 但"昨天没有数据"和"昨天营业额为 0"是完全不同的结论，前者不能说成后者。
 * 把缺哪些日期算清楚放进 manifest，模型就不需要自己比对日期列表。
 */
function dateCoverage(ep, rowsOut, params) {
  if (!ep.dates || !ep.dateField) return null
  const b = params[ep.dates.begin]
  const e = params[ep.dates.end]
  if (!b || !e) return null

  const expected = []
  if (ep.dates.unit === 'month' || ep.dates.unit === 'month-first-day') {
    let y = Number(b.slice(0, 4))
    let m = Number(b.slice(5, 7))
    const endKey = e.slice(0, 7)
    for (let guard = 0; guard < 400; guard++) {
      const key = `${y}-${String(m).padStart(2, '0')}`
      expected.push(key)
      if (key >= endKey) break
      m += 1
      if (m > 12) { m = 1; y += 1 }
    }
  } else {
    for (let t = Date.parse(`${b}T00:00:00Z`); t <= Date.parse(`${e}T00:00:00Z`); t += 86400000) {
      expected.push(new Date(t).toISOString().slice(0, 10))
    }
  }

  const present = new Set()
  for (const row of rowsOut) {
    const v = row?.[ep.dateField]
    if (v !== undefined && v !== null && String(v).trim() !== '') present.add(String(v).trim())
  }
  const expectedSet = new Set(expected)
  const missing = expected.filter((k) => !present.has(k))
  const unexpected = [...present].filter((k) => !expectedSet.has(k))
  const notes = []
  if (missing.length) {
    notes.push(
      '缺失日期在报表里没有对应行。含义是"该日期没有业务发生或数据尚未生成"，不等于金额为 0——回答时要按前者表述。',
    )
  }
  if (unexpected.length) {
    notes.push(
      `${ep.dateField} 出现了不属于请求区间的取值（${unexpected.join('、')}）。这通常是后端塞进 rows 的合计行，` +
        '按行求和会重复计算，计算前必须过滤掉。',
    )
  }
  if (!notes.length) notes.push('请求区间内每个日期都有对应行，且没有额外的合计行。')
  return {
    date_field: ep.dateField,
    expected_buckets: expected.length,
    present_buckets: expected.length - missing.length,
    missing_buckets: missing,
    unexpected_buckets: unexpected,
    note: notes.join(' '),
  }
}

/**
 * 用服务端页脚判断"这一页是不是全部数据"。
 *
 * 背景：快准的多数报表页把 rows 设成 3000 或 loadonce，后端实际上直接忽略 rows
 * 把整个结果集吐回来。这时"行数达到请求上限"的经验规则会把本来完整的数据误判成截断，
 * 让它无法参与计算。页脚（data.userdata / data.total）给的是整个查询的合计，
 * 行求和与它逐字段一致就证明行是齐的——这是取证，不是经验规则。
 *
 * footerSum 里的元素可以是字符串（行与页脚同名），也可以是 {row, footer}
 * ——销售对账明细表的页脚就叫 totalAmount 而行里叫 amount，不映射会对不上。
 * 比较留 1 分钱容差：后端金额是 JS 浮点，15940.479999999987 这类值不该被判成不一致。
 */
function reconcileWithFooter(ep, rowsOut, footer) {
  if (!ep.footerSum?.length || !footer || typeof footer !== 'object') return null
  const fields = {}
  for (const spec of ep.footerSum) {
    const rowField = typeof spec === 'string' ? spec : spec.row
    const footerField = typeof spec === 'string' ? spec : spec.footer
    const fv = parseAmount(footer[footerField])
    if (fv === null) continue
    const rs = sumField(rowsOut, rowField).total
    const entry = {
      row_sum: format(rs, 2),
      server_total: format(fv, 2),
      matches: nearlyEqual(rs, fv, FACTOR / 100n),
    }
    if (footerField !== rowField) entry.footer_field = footerField
    if (!entry.matches) entry.difference = format(rs - fv, 2)
    fields[rowField] = entry
  }
  const compared = Object.values(fields)
  if (!compared.length) return null
  return { fields, all_match: compared.every((c) => c.matches) }
}

function buildMeta({ key, ep, payload, rowsOut, bytes, rows, page, paging, dateInfo, params, isRaw, footer, emptySentinel }) {
  const meta = {
    endpoint: key,
    title: ep.title,
    http_path: `/api/${ep.path}`,
    method: ep.method,
    bytes,
    row_count: isRaw ? null : rowsOut.length,
    columns: isRaw || !rowsOut.length ? null : Object.keys(rowsOut[0]).sort(),
    requested_rows: paging.mode === 'none' ? null : rows,
    page: paging.mode === 'none' ? null : page,
    date_range: ep.dates ? { begin: params[ep.dates.begin] ?? null, end: params[ep.dates.end] ?? null, ...dateInfo } : null,
  }
  if (!isRaw) {
    const coverage = dateCoverage(ep, rowsOut, params)
    if (coverage) meta.date_coverage = coverage
  }

  // 命中精确空结果哨兵：查询成功、这段区间确实没有单据。这时响应里没有分页容器
  // （data 就是个空数组），按常规分页判定会算出 pagination_complete: false，
  // 让一个本该干净的"没有业务"结论变成"数据可能不完整"。所以在这里短路。
  if (emptySentinel) {
    meta.empty_result_sentinel = true
    meta.total_records = 0
    meta.pagination_complete = true
    meta.next_page = null
    meta.possibly_truncated = false
    meta.pagination_note =
      '后端返回了精确空结果信封（' +
      Object.entries(ep.emptySentinel.match).map(([k, v]) => `${k}="${v}"`).join(' + ') +
      ' + data=[]），已按"查询成功且这段区间没有单据"处理。这不是查询失败，也不是数据被截断；' +
      '回答时要说"这段时间没有相关业务发生"，不要说成"金额 0 元"。'
    return meta
  }

  if (paging.mode === 'pages') {
    const totalPages = pick(payload, paging.totalPages)
    const records = pick(payload, paging.records)
    meta.total_pages = Number(totalPages ?? 0) || null
    meta.total_records = Number(records ?? 0) || 0
    // 后端可能无视 rows 一次吐完（品牌列表就是这样）。这时行数已经够总量，
    // 继续翻页只会把同一批数据重复取回来，所以行数达标就算取尽。
    const gotEverything = meta.total_records > 0 && rowsOut.length >= meta.total_records
    meta.pagination_complete = gotEverything || (meta.total_pages !== null && page >= meta.total_pages)
    meta.next_page = meta.pagination_complete ? null : page + 1
    if (gotEverything && meta.total_pages !== null && page < meta.total_pages) {
      meta.pagination_note = `后端无视 rows，一次返回了全部 ${meta.total_records} 条（声称 ${meta.total_pages} 页）。已停止翻页，避免重复取回同一批数据。`
    }
  } else if (paging.mode === 'records') {
    const total = Number(pick(payload, paging.records) ?? 0)
    meta.total_records = total
    const gotEverything = total > 0 && rowsOut.length >= total
    meta.pagination_complete = gotEverything || page * rows >= total
    meta.next_page = meta.pagination_complete ? null : page + 1
    if (gotEverything && rowsOut.length > rows) {
      meta.pagination_note = `后端无视 rows=${rows}，一次返回了全部 ${total} 条。已停止翻页，避免重复取回同一批数据。`
    }
  } else if (paging.mode === 'date-bounded') {
    // 行数上限就是日期跨度（日报 ≤31，月报 ≤12），只要没触到请求上限就是全量
    meta.total_records = rowsOut.length
    meta.pagination_complete = rowsOut.length < rows
    meta.next_page = null
    meta.possibly_truncated = rowsOut.length >= rows
    const recon = reconcileWithFooter(ep, rowsOut, footer)
    if (recon) meta.footer_reconciliation = recon
    if (!meta.pagination_complete) {
      meta.pagination_note = `行数达到请求上限 ${rows}，与"一行一个日期"的预期不符，结果可能不完整。`
    }
  } else if (paging.mode === 'none') {
    // 请求里根本没有 rows/page，后端只能一次吐完，所以结构上就是全量。
    // 页脚对账在这里不是判定依据，但作为可复查的取证一并给出。
    meta.total_records = rowsOut.length
    meta.pagination_complete = true
    meta.next_page = null
    meta.possibly_truncated = false
    const recon = reconcileWithFooter(ep, rowsOut, footer)
    if (recon) {
      meta.footer_reconciliation = recon
      if (!recon.all_match) {
        meta.pagination_note =
          '本端点不分页，行必然是全量，但行求和与服务端页脚不一致。' +
          '这说明页脚口径与行不同（例如页脚含未在行里展开的部分），引用合计时要以行求和为准并说明口径。'
      }
    }
  } else {
    // single 模式：没有分页元数据。先用页脚对账取证；没有可对账页脚时，
    // "取回行数 < 请求行数"本身就是完整性证据——无论后端是遵守 rows 还是无视 rows，
    // 少于请求量都意味着结果集已经取尽。只有触到或超过请求量才真的存疑。
    meta.total_records = null
    meta.next_page = null
    const recon = reconcileWithFooter(ep, rowsOut, footer)
    if (recon) {
      meta.footer_reconciliation = recon
      meta.pagination_complete = recon.all_match
      meta.possibly_truncated = !recon.all_match
      meta.pagination_note = recon.all_match
        ? '该端点没有分页元数据，但行求和与服务端页脚逐字段一致，证明这一次已取到全部行。'
        : '行求和与服务端页脚不一致：行被截断，或页脚口径与行不同。合计不可用，请缩小日期范围或增加窄化条件后重取。'
    } else if (rowsOut.length < rows) {
      meta.pagination_complete = true
      meta.possibly_truncated = false
      meta.pagination_note = `该端点没有分页元数据也没有可对账页脚，但取回 ${rowsOut.length} 行少于请求的 ${rows} 行，说明结果集已取尽。`
    } else {
      meta.pagination_complete = false
      meta.possibly_truncated = true
      meta.pagination_note = `取回 ${rowsOut.length} 行已达请求上限 ${rows}，且该端点既无分页元数据也无可对账页脚，无法证明数据完整。请缩小日期范围或增加窄化条件后重取。`
    }
  }
  return meta
}

function gatewayHint(code, message, response, requestId) {
  const table = {
    INVALID_AGENT_CREDENTIAL: 'Token 无效、已撤销或已轮换。请让用户在 kzmall-plus 里重新生成，不要把旧值打印出来排查。',
    AGENT_API_DISABLED: '该部署尚未开启 Agent API（AGENT_API_ENABLED=false）。',
    UPSTREAM_AUTH_PATH_FORBIDDEN: '登录/登出路径在 Agent 模式下被禁止。会话由网关自动维护，不需要也不允许自行登录。',
    AGENT_MANAGEMENT_PATH_FORBIDDEN: '凭证管理接口只能由浏览器管理会话调用，Agent 不得访问。',
    INVALID_UPSTREAM_PATH: '路径不合法。只能调用注册表内的端点，不要自行拼接。',
    REQUEST_BODY_TOO_LARGE: '请求体超过 4 MiB。只读查询不应该这么大，请检查参数。',
    UPSTREAM_REAUTH_FAILED: '网关自动重新登录失败，通常是账号密码已变更。需要用户在 kzmall-plus 重新登录一次。',
    UPSTREAM_AUTH_FAILED: '上游认证失败且已重试一次。请稍后再试或让用户检查账号状态。',
    UPSTREAM_REAUTH_COOLDOWN: `重登录处于冷却期，请等待 Retry-After=${response.headers.get('retry-after') ?? '?'} 秒后重试。`,
    CREDENTIAL_STORE_UNAVAILABLE: '凭证存储暂时不可用，稍后重试。',
    UPSTREAM_UNAVAILABLE: '上游快准车服暂时不可达，稍后重试。',
    METHOD_NOT_ALLOWED: '该方法在 Agent 模式下不允许。',
  }
  const extra = table[code] ? ` ${table[code]}` : ''
  return `网关拒绝请求：${code}（HTTP ${response.status}）${message ? ` - ${message}` : ''}.${extra} requestId=${requestId ?? 'n/a'}`
}

export { ENDPOINTS, MAX_RESPONSE_BYTES, getEndpoint }
