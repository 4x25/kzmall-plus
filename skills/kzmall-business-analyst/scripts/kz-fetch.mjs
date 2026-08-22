#!/usr/bin/env node
/**
 * kz-fetch —— 唯一允许的取数入口。
 *
 * 它刻意只把"清单（manifest）"打到 stdout，把数据行写到磁盘文件：这样使用本
 * 技能的模型拿不到成千上万行原始数据去心算，只能让 kz-compute.mjs（或自己写的
 * Node 脚本）读文件做计算。这既是数据最小化，也是"算术必须由脚本完成"的实现。
 *
 * 用法：
 *   node kz-fetch.mjs --list
 *   node kz-fetch.mjs --describe sales-detail
 *   node kz-fetch.mjs day-report --date yesterday --out data/day-yesterday.json
 *   node kz-fetch.mjs day-report --date this-month --out data/day-thismonth.json
 *   node kz-fetch.mjs sales-detail --date this-month --split \
 *        --param kzCategoryIds='[123,124]' --out data/tyre-sales.json
 *   node kz-fetch.mjs sales-order-list --date last-week --out data/orders.json
 *
 * 环境变量（Token 只能走环境变量）：
 *   KZP_BASE_URL=https://<你的 kzmall-plus 域名>
 *   KZP_AGENT_TOKEN=kza_v1_xxx
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { ENDPOINTS, getEndpoint } from './kz-endpoints.mjs'
import { callEndpoint, redact, KzError } from './kz-http.mjs'
import { resolveRange, resolveMonthRange, resolveMonthFirstDays, splitWindows, daysBetween } from './kz-dates.mjs'

function parseArgs(argv) {
  const out = { params: {}, flags: {}, positional: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--param' || a === '--p') {
      const kv = argv[++i] ?? ''
      const eq = kv.indexOf('=')
      if (eq < 1) throw new KzError(`--param 需要 key=value 形式，收到 "${kv}"。`)
      out.params[kv.slice(0, eq)] = kv.slice(eq + 1)
    } else if (a.startsWith('--')) {
      const eq = a.indexOf('=')
      if (eq !== -1) out.flags[a.slice(2, eq)] = a.slice(eq + 1)
      else if (argv[i + 1] && !argv[i + 1].startsWith('--')) out.flags[a.slice(2)] = argv[++i]
      else out.flags[a.slice(2)] = true
    } else {
      out.positional.push(a)
    }
  }
  return out
}

function listEndpoints() {
  const groups = {
    '经营与利润': ['day-report', 'month-report', 'profit-report'],
    '销售（普通客户 / 门店零售）': [
      'sales-detail',
      'sales-detail-cost',
      'sales-summary-by-goods',
      'sales-summary-by-customer',
      'sales-order-list',
      'sales-return-list',
      'sales-reconcile-detail',
    ],
    '大客户销售（独立的另一套单据，普通客户报表里查不到）': [
      'key-account-sales-list',
      'key-account-return-list',
      'key-account-sales-detail',
      'key-account-return-detail',
    ],
    '库存': ['inv-balance', 'deliver-summary'],
    '资金与应收应付': ['receipt-list', 'customer-balance', 'bank-journal', 'payable-detail'],
    '主数据（把中文名换成 ID/编码）': [
      'category-tree',
      'brand-list',
      'contact-home',
      'key-account-category',
      'warehouse-list',
      'store-list',
      'employee-list',
      'settle-account-list',
      'pay-method-list',
    ],
  }
  // 兜底分组：注册表里有、但上面漏了分组的端点仍然要出现在清单里。
  // 一个"注册表有、--list 看不见"的端点等于不存在——模型只按清单选端点，
  // 于是它会退回到别的端点凑一个答案，而且没有任何一处会报错。
  const grouped = new Set(Object.values(groups).flat())
  const ungrouped = Object.keys(ENDPOINTS).filter((k) => !grouped.has(k))
  if (ungrouped.length) groups['未分组（注册表已启用）'] = ungrouped

  const lines = ['可调用端点（注册表之外一律不允许，禁止自行拼接路径）：']
  for (const [group, keys] of Object.entries(groups)) {
    lines.push(`\n【${group}】`)
    for (const k of keys) {
      const ep = ENDPOINTS[k]
      const budget = ep.dates ? (ep.dates.budgetLabel ?? `≤${ep.dates.maxSpan} 天`) : '无日期条件'
      lines.push(`  ${k.padEnd(26)} ${ep.title}${ep.costGated ? '（含成本，需 --allow-cost）' : ''}  [${budget}]`)
    }
  }
  lines.push(
    '\n注意：普通客户销售与大客户销售是**两套互不覆盖的单据体系**。' +
      '销售明细表（sales-detail*）查不到大客户业务，大客户端点也不含门店零售。' +
      '经营报表也**没有**把两者合并：month-report 的 sale_fee = 普通客户销售 + 调拨出库，' +
      '大客户单列在 big_sale_fee（实测 2026-03..07 逐月逐分吻合）。' +
      '所以问"总销售额"必须两侧分别取数、由脚本相加，不能只报 sale_fee。',
  )
  console.log(lines.join('\n'))
}

function describeEndpoint(key) {
  const ep = getEndpoint(key)
  const params = []
  for (const [name, spec] of [...(ep.query ?? []), ...(ep.form ?? [])]) {
    if (spec && typeof spec === 'object' && spec.p) {
      params.push({
        param: spec.p,
        required: !spec.opt,
        default: spec.default ?? '',
        query_key: name,
      })
    }
  }
  console.log(
    JSON.stringify(
      {
        endpoint: key,
        title: ep.title,
        method: ep.method,
        http_path: `/api/${ep.path}`,
        success_predicate: ep.success,
        row_container: ep.container,
        footer: ep.footer ?? null,
        footer_sum_fields: ep.footerSum ?? null,
        date_budget: ep.dates ?? null,
        paging: ep.paging ?? null,
        empty_result_sentinel: ep.emptySentinel ? { match: ep.emptySentinel.match, why: ep.emptySentinel.why } : null,
        cost_gated: !!ep.costGated,
        recommended_narrowing: ep.narrow ?? null,
        // 已知的分片缺口要在"设计取数方案之前"就看见。只在取数后警告是被动的：
        // 那时循环已经写好、跑完了，才发现拼出来的"全量"缺一块。
        shard_gaps: (ep.shardGaps ?? []).length
          ? ep.shardGaps.map((g) => ({
              if_you_loop_over: g.param,
              rows_you_will_never_get: `${g.blankField} 为空的行`,
              why: g.why,
              measured: g.measured,
              complement_command: g.complement,
            }))
          : null,
        params,
        notes: ep.notes ?? null,
      },
      null,
      2,
    ),
  )
}

function fillDates(ep, params, dateExpr) {
  if (!dateExpr) return null
  if (!ep.dates) throw new KzError(`${ep.title} 没有日期条件，不要传 --date。`)
  if (ep.dates.unit === 'month') {
    const r = resolveMonthRange(dateExpr)
    params.startMonth = r.startMonth
    params.endMonth = r.endMonth
    return r
  }
  if (ep.dates.unit === 'month-first-day') {
    const r = resolveMonthFirstDays(dateExpr)
    params.beginDate = r.beginDate
    params.endDate = r.endDate
    return r
  }
  const r = resolveRange(dateExpr)
  params[ep.dates.begin] = r.begin
  params[ep.dates.end] = r.end
  return r
}

/**
 * 逐页取数，并防住"后端无视 page 每次都返回同一批数据"。
 *
 * 注册表里的完整性判定依赖后端自报的 totalsize/totalPages，但这些字段偶尔与实际
 * 分页行为不一致（品牌列表就声称多页却一次吐完 466 条）。所以除了元数据判定，
 * 这里再加一道与元数据无关的取证：如果新一页的指纹与上一页相同，那它就是同一页，
 * 继续翻只会把行数翻倍。宁可停下并说明，也不要把重复行写进文件。
 */
async function fetchAllPages(key, params, opts, maxRequests) {
  const rowsAll = []
  const windows = []
  let page = 1
  let complete = true
  let requests = 0
  let repeated = null
  let lastPrint = null
  for (;;) {
    const res = await callEndpoint(key, params, { ...opts, page })
    requests += 1
    const print = fingerprint(res.rows)
    if (lastPrint !== null && print === lastPrint) {
      repeated = {
        stopped_at_page: page,
        why: '本页与上一页内容完全相同，说明后端忽略了 page 参数。已丢弃这一页并停止翻页，否则会重复计数。',
      }
      break // 重复页不进 rowsAll
    }
    lastPrint = print
    rowsAll.push(...res.rows)
    windows.push({ meta: res.meta, footer: res.footer ?? null })
    if (res.meta.pagination_complete || !res.meta.next_page) break
    if (requests >= maxRequests) {
      complete = false
      break
    }
    page = res.meta.next_page
  }
  return { rowsAll, windows, complete, requests, repeated }
}

/** 页指纹：行数 + 首尾行。够区分"下一页"和"同一页"，又不必比较整页。 */
function fingerprint(rows) {
  if (!Array.isArray(rows)) return 'not-array'
  if (!rows.length) return 'empty'
  return `${rows.length}|${JSON.stringify(rows[0])}|${JSON.stringify(rows[rows.length - 1])}`
}

/**
 * 清单里的日期区间必须是"这份文件实际覆盖的区间"。
 *
 * --split 会把一个月拆成多个 7 天窗口，每个窗口的 meta.date_range 只描述自己。
 * 如果照搬第一个窗口，清单就会写着 08-01..08-07，而文件里其实有整月的数据——
 * 读清单的模型会照着这个区间去描述结论，答案的时间范围就错了。所以跨窗口取
 * 最早的 begin 和最晚的 end，并把窗口数一并说明。
 */
function mergeDateRange(dateInfo, windows) {
  const ranges = windows.map((w) => w.meta.date_range).filter(Boolean)
  if (!ranges.length) return dateInfo ? { label: dateInfo.label } : null
  const first = ranges[0]
  if (ranges.length === 1) return dateInfo ? { label: dateInfo.label, ...first } : first
  const begins = ranges.map((r) => r.begin).filter(Boolean).sort()
  const ends = ranges.map((r) => r.end).filter(Boolean).sort()
  const begin = begins[0] ?? first.begin
  const end = ends[ends.length - 1] ?? first.end
  return {
    ...(dateInfo ? { label: dateInfo.label } : {}),
    ...first,
    begin,
    end,
    // 天数按合并后的区间重算：照搬窗口的 spanDays 会写着 7 天而文件里有 22 天
    spanDays: begin && end ? daysBetween(begin, end) : (first.spanDays ?? null),
    covered_by_windows: ranges.length,
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.flags.list) return listEndpoints()
  if (args.flags.describe) return describeEndpoint(args.flags.describe === true ? args.positional[0] : args.flags.describe)

  const key = args.positional[0]
  if (!key) {
    console.error('用法：node kz-fetch.mjs <endpoint> [--date <表达式>] [--param k=v] --out <文件>\n先看 --list 和 --describe <endpoint>。')
    process.exit(2)
  }
  const ep = getEndpoint(key)
  const params = { ...args.params }
  const dateInfo = fillDates(ep, params, args.flags.date === true ? undefined : args.flags.date)

  const opts = {
    allowCost: args.flags['allow-cost'] === true || args.flags['allow-cost'] === 'true',
    rows: args.flags.rows ? Number(args.flags.rows) : undefined,
  }
  const maxRequests = Number(args.flags['max-requests'] ?? 12)
  const outPath = args.flags.out === true || !args.flags.out ? null : String(args.flags.out)

  let rowsAll = []
  let windows = []
  let paginationComplete = true
  let requests = 0
  let splitInfo = null
  let repeatedPage = null

  const wantSplit = args.flags.split === true || args.flags.split === 'true'
  const pagedMode = ep.paging?.mode === 'pages' || ep.paging?.mode === 'records'

  if (wantSplit) {
    if (ep.dates?.unit !== 'day') throw new KzError(`${ep.title} 不支持 --split（只有按日区间的端点可以切窗口）。`)
    const begin = params[ep.dates.begin]
    const end = params[ep.dates.end]
    if (!begin || !end) throw new KzError(`--split 需要先用 --date 或 --param 指定 ${ep.dates.begin}/${ep.dates.end}。`)
    const wins = splitWindows(begin, end, ep.dates.maxSpan)
    if (wins.length > maxRequests) {
      throw new KzError(
        `区间 ${begin}..${end} 需要 ${wins.length} 个 ≤${ep.dates.maxSpan} 天的窗口，超过 --max-requests=${maxRequests}。请缩小区间或显式提高上限。`,
      )
    }
    splitInfo = { window_days: ep.dates.maxSpan, window_count: wins.length, requested_range: { begin, end } }
    for (const w of wins) {
      const winParams = { ...params, [ep.dates.begin]: w.begin, [ep.dates.end]: w.end }
      if (pagedMode) {
        const r = await fetchAllPages(key, winParams, opts, maxRequests)
        rowsAll.push(...r.rowsAll)
        windows.push(...r.windows)
        requests += r.requests
        if (!r.complete) paginationComplete = false
        if (r.repeated) repeatedPage = r.repeated
      } else {
        const res = await callEndpoint(key, winParams, opts)
        rowsAll.push(...res.rows)
        windows.push({ meta: res.meta, footer: res.footer ?? null })
        requests += 1
        if (!res.meta.pagination_complete) paginationComplete = false
      }
    }
  } else if (pagedMode) {
    const r = await fetchAllPages(key, params, opts, maxRequests)
    rowsAll = r.rowsAll
    windows = r.windows
    requests = r.requests
    paginationComplete = r.complete && windows[windows.length - 1]?.meta.pagination_complete !== false
    repeatedPage = r.repeated
  } else {
    const res = await callEndpoint(key, params, { ...opts, page: args.flags.page ? Number(args.flags.page) : 1 })
    rowsAll = Array.isArray(res.rows) ? res.rows : []
    windows = [{ meta: res.meta, footer: res.footer ?? null }]
    requests = 1
    paginationComplete = res.meta.pagination_complete
    if (!Array.isArray(res.rows)) {
      // @raw 端点（主数据集合）直接整块落盘
      rowsAll = []
      windows[0].raw = res.rows
    }
  }

  const possiblyTruncated = windows.some((w) => w.meta.possibly_truncated)
  const recons = windows.map((w) => w.meta.footer_reconciliation).filter(Boolean)
  const coverages = windows.map((w) => w.meta.date_coverage).filter(Boolean)
  const excluded = windows.map((w) => w.meta.excluded_rows).filter((e) => e && e.dropped > 0)
  const sentinelWins = windows.filter((w) => w.meta.empty_result_sentinel)
  const manifest = {
    endpoint: key,
    title: ep.title,
    http_path: `/api/${ep.path}`,
    success_predicate: ep.success,
    row_container: ep.container,
    requests_made: requests,
    row_count: rowsAll.length,
    columns: rowsAll.length ? Object.keys(rowsAll[0]).sort() : null,
    bytes_total: windows.reduce((s, w) => s + (w.meta.bytes || 0), 0),
    date_range: mergeDateRange(dateInfo, windows),
    split: splitInfo,
    pagination_complete: paginationComplete,
    possibly_truncated: possiblyTruncated,
    // 空结果哨兵：后端用一个"看着像失败"的信封表达"这段区间没有单据"。
    // 必须在清单里显式说明，否则 row_count: 0 会被读成"取数出问题了"，
    // 而这两种情况在回答时的说法完全相反（"没有业务发生" vs "查询失败，不要下结论"）。
    empty_result_sentinel: sentinelWins.length
      ? {
          windows_empty: sentinelWins.length,
          windows_total: windows.length,
          all_windows_empty: sentinelWins.length === windows.length,
          note: sentinelWins[0].meta.pagination_note,
        }
      : null,
    // 完整性取证：行求和与服务端页脚逐字段一致，就说明这一次没有丢行
    footer_reconciliation: recons.length
      ? {
          windows_reconciled: recons.length,
          all_match: recons.every((r) => r.all_match),
          per_window: recons,
        }
      : null,
    date_coverage: coverages.length
      ? {
          date_field: coverages[0].date_field,
          expected_buckets: coverages.reduce((s, c) => s + c.expected_buckets, 0),
          present_buckets: coverages.reduce((s, c) => s + c.present_buckets, 0),
          missing_buckets: coverages.flatMap((c) => c.missing_buckets),
          unexpected_buckets: [...new Set(coverages.flatMap((c) => c.unexpected_buckets ?? []))],
          note: [...new Set(coverages.map((c) => c.note))].join(' '),
        }
      : null,
    server_footers: windows.map((w) => w.footer).filter(Boolean),
    // 剔除的伪行（小计/期初余额/合计）要报出来：落盘行数少于后端行数是有原因的
    excluded_rows: excluded.length
      ? {
          field: excluded[0].field,
          values: excluded[0].values,
          dropped: excluded.reduce((s, e) => s + e.dropped, 0),
          dropped_by_value: excluded.reduce((acc, e) => {
            for (const [k, v] of Object.entries(e.dropped_by_value)) acc[k] = (acc[k] ?? 0) + v
            return acc
          }, {}),
          why: excluded[0].why,
          note: excluded[0].note,
        }
      : null,
    repeated_page_stop: repeatedPage,
    cost_fields_included: !!ep.costGated,
    filters_applied: Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== '')),
    notes: ep.notes ?? null,
  }

  if (possiblyTruncated) {
    manifest.warning =
      '行数达到本次请求上限且该端点没有可靠分页元数据，结果可能被截断。基于它的合计不可信，请缩小日期或增加窄化条件后重取。'
  }

  // 分片缺口：用某个字段窄化时，该字段为空的行不属于任何分片值，会整批取不到。
  // 这一类缺失骗过了所有既有的完整性检查——每个分片的页脚都对得上、possibly_truncated 是 false、
  // 分组也没丢行，因为那些行从来没进过数据文件。所以只能在取数时就把它说出来。
  const shardGap = (ep.shardGaps ?? []).find(
    (g) => params[g.param] !== undefined && params[g.param] !== '',
  )
  if (shardGap) {
    manifest.shard_coverage_warning = {
      narrowed_by: shardGap.param,
      rows_this_shard: rowsAll.length,
      blank_field_rows_here: rowsAll.filter((r) => !String(r?.[shardGap.blankField] ?? '').trim()).length,
      why: shardGap.why,
      measured: shardGap.measured,
      complement_command: shardGap.complement,
      note:
        `本次用 ${shardGap.param} 窄化。如果你是想靠遍历 ${shardGap.param} 拼出全量，那么 ` +
        `${shardGap.blankField} 为空的那些行一条都取不到（${shardGap.why}${shardGap.measured}）。` +
        `每个分片的页脚都会对得上、possibly_truncated 也是 false——页脚只证明"这个分片没丢行"，` +
        `证明不了"分片集合覆盖了全表"，所以这个缺口不会有任何报错。` +
        `补齐办法：再取一次 \`${shardGap.complement}\`，与品牌分片合并后一起算。` +
        `想给全量总额找旁证，用 day-report 最新一天的 store_fee 核对量级。` +
        `只查单个品牌时忽略本条。`,
    }
  }

  const payload = { manifest, windows: windows.map(({ meta, footer, raw }) => ({ meta, footer, raw })), rows: rowsAll }
  if (outPath) {
    mkdirSync(dirname(outPath), { recursive: true })
    writeFileSync(outPath, JSON.stringify(payload, null, 2))
    manifest.saved_to = outPath
  } else {
    manifest.saved_to = null
    manifest.hint = '没有 --out：数据行没有落盘，无法交给脚本计算。加 --out <文件> 再运行一次。'
  }

  const previewN = Math.min(Number(args.flags.preview ?? 0) || 0, 5)
  const stdout = { manifest }
  if (previewN > 0) {
    stdout.sample_rows = rowsAll.slice(0, previewN)
    stdout.sample_note = '样本只用于确认字段名与取值形态，禁止据此估算或手算任何合计。'
  }
  console.log(JSON.stringify(stdout, null, 2))
}

main().catch((err) => {
  const out = { error: redact(err?.message ?? String(err)) }
  if (err?.code) out.code = err.code
  if (err?.requestId) out.requestId = err.requestId
  console.error(JSON.stringify(out, null, 2))
  process.exit(1)
})
