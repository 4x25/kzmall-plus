#!/usr/bin/env node
/**
 * kz-compute —— 所有加减乘除都在这里发生。
 *
 * 本技能要求业务数字必须可复算：模型负责决定"算什么"，脚本负责"算出来"。
 * 每条命令都会输出它用了哪个文件、哪些字段、多少行，以及与服务端页脚的
 * 交叉核对结果，这样结论可以被逐步复查。
 *
 * 命令：
 *   summary  <file> --revenue <字段> [--revenue-less <字段,…>] --cost <字段> [--profit <字段>] [--label 文本]
 *   sum      <file> --fields a,b,c
 *   daily    <file> --date-field <字段> --fields a,b,c
 *   rank     <file> --group <字段[,字段…]> [--label f1,f2] --fields a,b --by <字段> [--top 10]
 *   distinct <file> --fields a,b [--measure qty,recAmount] [--top 30]
 *   compare  <fileA> <fileB> --fields a,b [--labels 本期,上期]
 *
 * 每条命令都支持本地行筛选（可重复给）：
 *   --where 字段~包含值      --where 字段=精确值
 *   --exclude 字段~排除值    --exclude 字段=排除值
 *
 * 目标字段藏在嵌套数组里时（利润表的 coreBiz[]），先展开再计算：
 *   --explode coreBiz
 *
 * 例：
 *   # 本月销售额 / 成本 / 毛利（经营报表口径，dbck_fee 不参与毛利）
 *   node kz-compute.mjs summary data/day-thismonth.json \
 *        --revenue sale_fee --revenue-less dbck_fee --cost cost_fee --profit profit
 *
 *   # 本月卖得最好的轮胎：先看有哪些分类路径，再筛"轮胎"这一层，再排名
 *   node kz-compute.mjs distinct data/sales.json \
 *        --fields firstCategoryName,secondCategoryName,categoryName --measure recAmount
 *   node kz-compute.mjs rank data/sales.json --where secondCategoryName=轮胎 \
 *        --group skuId,number --label name,spec,brandName --fields qty,recAmount --by recAmount --top 5
 *
 *   # 利润表的销售口径：sale_fee 在 coreBiz[] 里，不展开会得到 0
 *   node kz-compute.mjs sum data/profit.json --explode coreBiz --where cust_type=销售 \
 *        --fields sale_fee,cost_fee,zy_profit
 */

import { readFileSync } from 'node:fs'
import { parseAmount, sumField, format, percent, nearlyEqual, FACTOR } from './kz-money.mjs'

function parseArgs(argv) {
  const flags = {}
  const positional = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const eq = a.indexOf('=')
      if (eq !== -1) flags[a.slice(2, eq)] = a.slice(eq + 1)
      else if (argv[i + 1] && !argv[i + 1].startsWith('--')) flags[a.slice(2)] = argv[++i]
      else flags[a.slice(2)] = true
    } else positional.push(a)
  }
  return { flags, positional }
}

const list = (v) => String(v ?? '').split(',').map((s) => s.trim()).filter(Boolean)

/** --where/--exclude 可以给多次，argv 解析器会把重复键覆盖，所以单独扫一遍 argv。 */
function collectRepeated(argv, name) {
  const out = []
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === `--${name}` && argv[i + 1] !== undefined) out.push(argv[++i])
    else if (argv[i].startsWith(`--${name}=`)) out.push(argv[i].slice(name.length + 3))
  }
  return out
}

const OPS = [
  ['!~', (cell, want) => !cell.includes(want)],
  ['!=', (cell, want) => cell !== want],
  ['~', (cell, want) => cell.includes(want)],
  ['=', (cell, want) => cell === want],
]

function parseCondition(expr) {
  for (const [op, test] of OPS) {
    const at = expr.indexOf(op)
    if (at > 0) return { field: expr.slice(0, at).trim(), op, value: expr.slice(at + op.length).trim(), test }
  }
  throw new Error(`条件 "${expr}" 无法解析。写法是 字段~包含值 / 字段=精确值 / 字段!~排除值 / 字段!=不等值。`)
}

/**
 * 在本地对行做筛选。
 *
 * 为什么要有它：像"本月卖得最好的轮胎"这种问题，上游的 kzCategoryIds 服务端筛选是可用的
 * （叶子类别 id 从 category-tree 取，实测有效），但服务端筛选看不见"筛掉了什么"。销售明细
 * 每一行都自带完整分类路径（firstCategoryName / secondCategoryName / categoryName），
 * 本地按名称筛能得到同样的结果，而且可以逐条核对匹配到了什么——分类归属拿不准时更可查。
 *
 * 关键设计：筛选结果会连同"命中了哪些取值"一起输出。关键词匹配天然会误伤
 * （搜"轮胎"会同时命中"轮胎清洗剂"和"胎压传感器"），把命中集合摊开给人看，
 * 误伤才有机会被发现并用 --exclude 修掉。
 *
 * 但只看"命中了什么"只能发现多算，发现不了少算：--where 作用的字段在某些行上是空的
 * （第三方仓的销售明细就没有品类和品牌），这些行会在分组之前被无声滤掉，
 * rows_without_group_key 仍然是 0，dropped_rows_warning 也不会触发。少一整块销售
 * 而毫无提示，比多算一点危险得多，所以下面把"因为字段为空而被滤掉的行"单独数出来。
 */
function applyFilters(doc, argv) {
  const conds = [
    ...collectRepeated(argv, 'where').map((e) => ({ ...parseCondition(e), kind: 'where' })),
    ...collectRepeated(argv, 'exclude').map((e) => ({ ...parseCondition(e), kind: 'exclude' })),
  ]
  if (!conds.length) return null

  const before = doc.rows.length
  const beforeRows = doc.rows
  const fields = [...new Set(conds.map((c) => c.field))]
  const missing = fields.filter((f) => !doc.rows.some((r) => r && f in r))
  if (missing.length && before > 0) {
    const sample = doc.rows[0] ? Object.keys(doc.rows[0]).join(', ') : '(无行)'
    throw new Error(`筛选字段 ${missing.join('、')} 在数据行里不存在。该文件的可用字段：${sample}`)
  }

  // where：条件成立才保留；exclude：条件成立就剔除
  doc.rows = doc.rows.filter((row) =>
    conds.every((c) => {
      const hit = c.test(String(row?.[c.field] ?? ''), c.value)
      return c.kind === 'where' ? hit : !hit
    }),
  )

  const matched = {}
  for (const f of fields) {
    const vals = new Map()
    for (const r of doc.rows) {
      const v = String(r?.[f] ?? '')
      vals.set(v, (vals.get(v) ?? 0) + 1)
    }
    matched[f] = [...vals]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([value, rows]) => ({ value, rows }))
  }

  doc.filtered = {
    conditions: conds.map((c) => `${c.field}${c.kind === 'exclude' ? ' 排除 ' : ' 满足 '}${c.op}${c.value}`),
    rows_before: before,
    rows_after: doc.rows.length,
    matched_values: matched,
    note:
      '筛选在本地完成，服务端页脚仍对应筛选前的全部行，所以下面的 integrity 校验的是"数据源是否完整"，' +
      '而不是筛选后的小计。两个方向都要看：往多了看，核对 matched_values——关键词匹配可能误伤' +
      '（按"轮胎"筛会命中"轮胎清洗剂"），误伤就用 --exclude 字段~误伤值 排掉后重算；' +
      '往少了看，核对 blank_field_rows——被 --where 的字段在那些行上是空的，它们已经被无声滤掉了。',
  }

  // 因为字段为空而被滤掉的行。只有 --where 会造成这种漏掉：exclude 条件在空值上不成立，空行反而会被留下。
  const blankFieldRows = {}
  const kept = new Set(doc.rows)
  for (const c of conds) {
    if (c.kind !== 'where') continue
    const dropped = beforeRows.filter((r) => !kept.has(r) && String(r?.[c.field] ?? '').trim() === '')
    if (!dropped.length) continue
    // 同一个关键词在这些行的别的字段上命中了吗？命中就说明筛错了字段，
    // 而不是这些行真的与问题无关——这是最常见的情形，直接把候选字段指出来。
    const elsewhere = new Map()
    for (const r of dropped) {
      for (const [k, v] of Object.entries(r ?? {})) {
        if (k === c.field || typeof v !== 'string' || v.trim() === '') continue
        if (c.test(v, c.value)) elsewhere.set(k, (elsewhere.get(k) ?? 0) + 1)
      }
    }
    const also = [...elsewhere].sort((a, b) => b[1] - a[1]).map(([field, rows]) => ({ field, rows }))
    // sample 里优先放"在别处命中了关键词"的行：它们才是需要人去判断该不该计入的那几行，
    // 而被滤掉的空字段行往往有几十行，随手取前 5 行大概率全是无关商品。
    const hitsElsewhere = (r) =>
      Object.entries(r ?? {}).some(
        ([k, v]) => k !== c.field && typeof v === 'string' && v.trim() !== '' && c.test(v, c.value),
      )
    const ordered = [...dropped].sort((a, b) => Number(hitsElsewhere(b)) - Number(hitsElsewhere(a)))
    blankFieldRows[c.field] = {
      dropped_rows: dropped.length,
      also_matched_in: also,
      sample: ordered.slice(0, 5).map((r) =>
        Object.fromEntries(
          ['number', 'name', 'spec', 'goodsName', 'brandName', 'categoryName', 'location']
            .filter((f) => r && f in r)
            .map((f) => [f, r[f]]),
        ),
      ),
      warning: also.length
        ? `有 ${dropped.length} 行的 ${c.field} 是空的，已被这个 --where 滤掉，但同样的关键词在这些行的 ` +
          `${also.map((a) => `${a.field}(${a.rows} 行)`).join('、')} 上命中了——很可能筛错了字段。` +
          `改筛那个字段后重算，或把两次结果相加，并在回答里说明这部分数据的分类是空的。`
        : `有 ${dropped.length} 行的 ${c.field} 是空的，已被这个 --where 滤掉。它们在其他字段上也没命中这个关键词，` +
          `大概确实无关，但要确认这些行不该计入——空分类常见于第三方仓，看 sample 里的商品名判断。`,
    }
  }
  if (Object.keys(blankFieldRows).length) doc.filtered.blank_field_rows = blankFieldRows

  return doc.filtered
}

function load(file, flags, argv) {
  const doc = JSON.parse(readFileSync(file, 'utf8'))
  if (!doc.manifest || !Array.isArray(doc.rows)) {
    throw new Error(`${file} 不是 kz-fetch 生成的数据文件。计算只能基于 kz-fetch 落盘的数据。`)
  }
  const m = doc.manifest
  if (m.possibly_truncated && flags['allow-incomplete'] !== true) {
    throw new Error(
      `${file} 的 manifest 标记 possibly_truncated=true：数据可能被截断，基于它的合计会是错的。请缩小日期范围或增加窄化条件后重新取数（确认要在不完整数据上试算才加 --allow-incomplete）。`,
    )
  }
  // 有些报表把合计行混在 rows 里（例如利润表的 month="合计"），不剔掉就会双倍计数
  const stray = m.date_coverage?.unexpected_buckets ?? []
  if (stray.length) {
    const field = m.date_coverage.date_field
    if (flags['drop-total-rows'] === true) {
      const before = doc.rows.length
      doc.rows = doc.rows.filter((r) => !stray.includes(String(r?.[field] ?? '').trim()))
      doc.dropped_total_rows = { field, values: stray, dropped: before - doc.rows.length }
    } else {
      throw new Error(
        `${file} 的 ${field} 里有不属于请求区间的取值（${stray.join('、')}），这通常是后端混在 rows 里的合计行，` +
          `直接求和会重复计算。确认要把它们当合计行剔除就加 --drop-total-rows。`,
      )
    }
  }
  // 展开要在筛选之前：--where cust_type=销售 这类条件针对的是展开后的子行
  if (flags.explode && flags.explode !== true) explodeRows(doc, String(flags.explode))
  // 筛选前的行要留一份：服务端页脚对应的是全部行，完整性只能用它来证明
  doc.allRows = doc.rows
  applyFilters(doc, argv ?? [])
  return doc
}

/**
 * 把某一列里的嵌套数组展开成行。
 *
 * 利润表就是这个形状：data[] 一行一个月，但 sale_fee / cost_fee 藏在这一行的
 * coreBiz[] 里（按 cust_type 拆成"销售"和"调拨"）。不展开就没有任何一行含 sale_fee，
 * 求和会得到 0 —— 一个看起来像答案的错误答案。展开后父行的标量字段（month 等）
 * 会带到子行上，所以展开完还能继续用 --where cust_type=销售 挑口径。
 */
function explodeRows(doc, field) {
  const out = []
  let parentsWithout = 0
  for (const row of doc.rows) {
    const nested = row?.[field]
    if (!Array.isArray(nested) || !nested.length) {
      parentsWithout += 1
      continue
    }
    // 父行只带标量，避免把兄弟数组（otherIncome 等）复制进每个子行造成混淆
    const scalars = {}
    for (const [k, v] of Object.entries(row)) {
      if (k !== field && (v === null || typeof v !== 'object')) scalars[k] = v
    }
    for (const child of nested) out.push({ ...scalars, ...child })
  }
  doc.exploded = {
    field,
    parent_rows: doc.rows.length,
    child_rows: out.length,
    parents_without_children: parentsWithout,
    note:
      `已把每行的 ${field}[] 展开成独立行，父行的标量字段（如 month）已带到子行上。` +
      '展开改变了行的口径，所以服务端页脚不再可比，完整性只能依赖取数阶段的 manifest。',
  }
  doc.rows = out
}

/**
 * 请求的字段必须真的存在于数据里。
 *
 * 这条检查存在的理由：字段名写错（或字段其实藏在嵌套数组里，比如利润表的 sale_fee）
 * 时，求和会安静地给出 "0.00"。0 看起来是个正常的业务答案，模型很可能直接转述成
 * "销售额 0 元"。这类错误比报错危险得多，所以宁可失败也不要输出一个没有依据的 0。
 */
function requireFields(doc, fields, file) {
  const rows = doc.allRows ?? doc.rows
  if (!rows.length) return
  const missing = fields.filter((f) => !rows.some((r) => r && f in r))
  if (!missing.length) return
  const available = Object.keys(rows[0] ?? {}).sort().join(', ')
  // 直接指出目标字段藏在哪一列里，而不是让调用方逐个 explode 试
  const nestedCols = Object.entries(rows[0] ?? {})
    .filter(([, v]) => Array.isArray(v) && v.length && v[0] && typeof v[0] === 'object')
    .map(([k, v]) => [k, Object.keys(v[0])])
  const found = nestedCols.filter(([, keys]) => missing.some((f) => keys.includes(f)))
  let hint = ''
  if (found.length) {
    hint =
      ` 目标字段其实在嵌套数组 ${found.map(([k]) => k).join('、')} 里，` +
      `加 --explode ${found[0][0]} 展开成行后再计算（展开后还能用 --where 挑口径，例如利润表的 --where cust_type=销售）。`
  } else if (nestedCols.length) {
    hint = ` 该文件还有嵌套数组列：${nestedCols.map(([k]) => k).join('、')}，如果目标字段在其中，用 --explode <列名> 先展开。`
  }
  throw new Error(
    `字段 ${missing.join('、')} 在 ${file} 的任何一行里都不存在，求和只会得到一个没有依据的 0。` +
      `该文件的可用字段：${available}。${hint}`,
  )
}

/**
 * 行求和与服务端页脚交叉核对：能对上说明取到的行是完整的口径。
 *
 * 注意用的是 allRows（筛选前）。页脚是整个查询的合计，拿筛选后的子集去比一定不等，
 * 那样只会制造假警报。这里要回答的问题是"数据源完整吗"，而不是"子集等于总量吗"。
 */
function footerCheck(doc, fields) {
  if (doc.exploded) {
    return {
      available: false,
      note:
        `行已按 ${doc.exploded.field}[] 展开，服务端页脚对应的是展开前的父行，两边口径不同，交叉核对没有意义。` +
        '完整性请看 source.pagination_complete 与取数时的 manifest。',
    }
  }
  const footers = doc.manifest.server_footers ?? []
  if (!footers.length) return { available: false, note: '该端点没有服务端页脚，无法交叉核对完整性。' }
  const rows = doc.allRows ?? doc.rows
  const checks = {}
  for (const f of fields) {
    let footerTotal = 0n
    let present = 0
    for (const ft of footers) {
      const v = parseAmount(ft?.[f])
      if (v !== null) {
        footerTotal += v
        present += 1
      }
    }
    if (!present) continue
    const rowSum = sumField(rows, f).total
    checks[f] = {
      row_sum: format(rowSum, 2),
      server_footer_sum: format(footerTotal, 2),
      matches: nearlyEqual(rowSum, footerTotal, FACTOR / 100n),
    }
  }
  const compared = Object.values(checks)
  return {
    available: compared.length > 0,
    footers_used: footers.length,
    checked_rows: rows.length,
    checked_scope: doc.filtered ? '筛选前的全部行（页脚口径）' : '全部行',
    fields: checks,
    all_match: compared.length ? compared.every((c) => c.matches) : null,
    note: compared.length
      ? '行求和与服务端页脚一致时，可以认为该字段的行数据完整；不一致说明存在截断或口径差异，结论不可直接使用。'
      : '页脚里没有被检查的字段。',
  }
}

function sourceOf(doc, file) {
  const m = doc.manifest
  const out = {
    file,
    endpoint: m.endpoint,
    title: m.title,
    date_range: m.date_range ?? null,
    row_count: m.row_count,
    pagination_complete: m.pagination_complete,
    filters_applied: m.filters_applied ?? {},
  }
  // 展开或本地筛选后，参与计算的行数与取数时的行数不同，两个都给出才对得上账
  if (doc.rows.length !== m.row_count) out.rows_used = doc.rows.length
  if (m.date_coverage) out.date_coverage = m.date_coverage
  if (m.excluded_rows) out.excluded_rows = m.excluded_rows
  if (doc.dropped_total_rows) out.dropped_total_rows = doc.dropped_total_rows
  if (doc.exploded) out.exploded = doc.exploded
  if (doc.filtered) out.local_filter = doc.filtered
  if (!doc.rows.length) {
    out.no_data = true
    out.no_data_note = doc.filtered
      ? '筛选后没有剩下任何行。请先核对 local_filter.conditions 里的字段名和关键词是否正确' +
        '（用 distinct 命令看看这个字段实际有哪些取值），确认无误后才能说"这段时间没有相关业务"。'
      : '该区间没有任何数据行。合计因此是 0，但"没有数据"和"金额为 0"是不同的结论——' +
        '回答时说这段时间没有相关业务记录（若 date_coverage.missing_buckets 覆盖了整个区间，' +
        '更准确的说法是这些日期在报表里没有数据），不要说营业额是 0 元。'
  }
  return out
}

const cmds = {
  /** 销售额 / 成本 / 毛利 / 毛利率的标准口径计算。 */
  summary(positional, flags, argv) {
    const file = positional[0]
    const doc = load(file, flags, argv)
    const revenueField = flags.revenue
    const costField = flags.cost
    if (!revenueField) throw new Error('summary 需要 --revenue <字段>。')
    const lessFields = list(flags['revenue-less'])
    const profitField = flags.profit && flags.profit !== true ? flags.profit : null
    requireFields(doc, [revenueField, costField, profitField, ...lessFields].filter(Boolean), file)

    const rev = sumField(doc.rows, revenueField)
    // --revenue-less：从收入里扣掉不参与毛利的部分。经营报表的 dbck_fee（调拨出库）
    // 计入 sale_fee 却不计入 profit 的收入侧，不扣就会比后端毛利多出这一块。
    let lessTotal = 0n
    const lessDetail = {}
    for (const f of lessFields) {
      const s = sumField(doc.rows, f)
      lessTotal += s.total
      lessDetail[f] = format(s.total, 2)
    }
    const netRevenue = rev.total - lessTotal
    const cost = costField ? sumField(doc.rows, costField) : null
    const reported = profitField ? sumField(doc.rows, profitField) : null
    const derivedProfit = cost ? netRevenue - cost.total : null

    const out = {
      operation: 'summary',
      label: flags.label && flags.label !== true ? flags.label : (doc.manifest.date_range?.label ?? null),
      source: sourceOf(doc, file),
      fields_used: {
        revenue: revenueField,
        revenue_less: lessFields.length ? lessFields : null,
        cost: costField ?? null,
        reported_profit: profitField,
      },
      revenue: format(rev.total, 2),
      rows_counted: rev.counted,
      cells_unparsable: rev.skipped + (cost?.skipped ?? 0),
    }
    if (lessFields.length) {
      out.revenue_deductions = lessDetail
      out.net_revenue = format(netRevenue, 2)
      out.net_revenue_note = `毛利口径的收入 = ${revenueField} − ${lessFields.join(' − ')}。回答"销售额"时用 ${revenueField}，回答毛利率分母时说明用的是哪一个。`
    }
    out.cost = cost ? format(cost.total, 2) : null
    out.gross_profit = derivedProfit !== null ? format(derivedProfit, 2) : null
    out.gross_margin_percent = derivedProfit !== null ? percent(derivedProfit, netRevenue, 2) : null
    if (reported) {
      out.reported_profit = format(reported.total, 2)
      out.derived_matches_reported =
        derivedProfit === null ? null : nearlyEqual(derivedProfit, reported.total, FACTOR / 100n)
      out.reported_profit_note = out.derived_matches_reported
        ? '推导毛利与后端毛利字段一致，口径对齐，可以直接引用。'
        : '推导毛利与后端毛利字段不一致。先查是不是漏了 --revenue-less（经营报表要扣 dbck_fee），' +
          '仍不一致就必须向用户说明差异，不要二选一。'
    }
    out.integrity = footerCheck(doc, [revenueField, costField, profitField, ...lessFields].filter(Boolean))
    return out
  },

  /** 任意列求和。 */
  sum(positional, flags, argv) {
    const file = positional[0]
    const doc = load(file, flags, argv)
    const fields = list(flags.fields)
    if (!fields.length) throw new Error('sum 需要 --fields a,b,c。')
    requireFields(doc, fields, file)
    const totals = {}
    for (const f of fields) {
      const s = sumField(doc.rows, f)
      totals[f] = { total: format(s.total, 2), rows_counted: s.counted, cells_unparsable: s.skipped }
    }
    return { operation: 'sum', source: sourceOf(doc, file), totals, integrity: footerCheck(doc, fields) }
  },

  /** 按日期字段展开时间序列，并给出合计、日均、最高/最低日。 */
  daily(positional, flags, argv) {
    const file = positional[0]
    const doc = load(file, flags, argv)
    const dateField = flags['date-field']
    const fields = list(flags.fields)
    if (!dateField || !fields.length) throw new Error('daily 需要 --date-field <字段> 和 --fields a,b。')
    requireFields(doc, [dateField, ...fields], file)

    const buckets = new Map()
    for (const row of doc.rows) {
      const key = String(row?.[dateField] ?? '').trim()
      if (!key) continue
      if (!buckets.has(key)) buckets.set(key, { key, rows: 0, totals: Object.fromEntries(fields.map((f) => [f, 0n])) })
      const b = buckets.get(key)
      b.rows += 1
      for (const f of fields) {
        const v = parseAmount(row?.[f])
        if (v !== null) b.totals[f] += v
      }
    }
    const series = [...buckets.values()]
      .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
      .map((b) => ({ [dateField]: b.key, rows: b.rows, ...Object.fromEntries(fields.map((f) => [f, format(b.totals[f], 2)])) }))

    const grand = {}
    const stats = {}
    for (const f of fields) {
      const total = [...buckets.values()].reduce((s, b) => s + b.totals[f], 0n)
      grand[f] = format(total, 2)
      const n = BigInt(buckets.size || 1)
      stats[f] = { average_per_bucket: format(total / n, 2) }
      const sorted = [...buckets.values()].sort((a, b) => (a.totals[f] === b.totals[f] ? 0 : a.totals[f] > b.totals[f] ? -1 : 1))
      if (sorted.length) {
        stats[f].max = { [dateField]: sorted[0].key, value: format(sorted[0].totals[f], 2) }
        stats[f].min = {
          [dateField]: sorted[sorted.length - 1].key,
          value: format(sorted[sorted.length - 1].totals[f], 2),
        }
      }
    }
    return {
      operation: 'daily',
      source: sourceOf(doc, file),
      bucket_field: dateField,
      bucket_count: buckets.size,
      series,
      totals: grand,
      stats,
      integrity: footerCheck(doc, fields),
    }
  },

  /** 分组排名："卖得最好"这类问题的答案来源。 */
  rank(positional, flags, argv) {
    const file = positional[0]
    const doc = load(file, flags, argv)
    // --group 收一个字段列表：单个字段够用时就写一个，需要兜底身份时写 skuId,number。
    // 理由见下面 keyOf()：销售明细里第三方仓商品没有 skuId。
    const groupFields = list(flags.group)
    const fields = list(flags.fields)
    const by = flags.by && flags.by !== true ? flags.by : fields[0]
    const labelFields = list(flags.label)
    const top = Number(flags.top ?? 10)
    if (!groupFields.length || !fields.length) throw new Error('rank 需要 --group <字段>（可逗号分隔多个）和 --fields a,b。')
    if (!fields.includes(by)) throw new Error(`--by ${by} 必须出现在 --fields 里。`)
    requireFields(doc, [...groupFields, ...fields, ...labelFields], file)

    const buckets = new Map()
    let skippedRows = 0
    let skippedMeasure = 0n
    for (const row of doc.rows) {
      const parts = groupFields.map((f) => {
        const v = row?.[f]
        return v === undefined || v === null ? '' : String(v).trim()
      })
      // 全部分组字段都空才算"无法归属"。多字段时任一有值即可成键，
      // 这正是 --group skuId,number 能把第三方仓商品分开的原因。
      if (parts.every((p) => p === '')) {
        skippedRows += 1
        const v = parseAmount(row?.[by])
        if (v !== null) skippedMeasure += v
        continue
      }
      const k = parts.join('\u0001') // 控制字符分隔，避免 ["a","bc"] 与 ["ab","c"] 撞成同一个键
      if (!buckets.has(k)) {
        buckets.set(k, {
          key: k,
          parts,
          rows: 0,
          labels: Object.fromEntries(labelFields.map((f) => [f, row?.[f] ?? null])),
          totals: Object.fromEntries(fields.map((f) => [f, 0n])),
        })
      }
      const b = buckets.get(k)
      b.rows += 1
      for (const f of fields) {
        const v = parseAmount(row?.[f])
        if (v !== null) b.totals[f] += v
      }
    }

    const all = [...buckets.values()].sort((a, b) => {
      if (a.totals[by] !== b.totals[by]) return a.totals[by] > b.totals[by] ? -1 : 1
      return a.key < b.key ? -1 : 1 // 同值时按分组键稳定排序，保证结果可重现
    })
    const grand = Object.fromEntries(fields.map((f) => [f, [...buckets.values()].reduce((s, b) => s + b.totals[f], 0n)]))

    const out = {
      operation: 'rank',
      source: sourceOf(doc, file),
      group_by: groupFields.length === 1 ? groupFields[0] : groupFields,
      ranked_by: by,
      group_count: buckets.size,
      rows_without_group_key: skippedRows,
      top: all.slice(0, top).map((b, i) => ({
        rank: i + 1,
        ...Object.fromEntries(groupFields.map((f, gi) => [f, b.parts[gi] === '' ? null : b.parts[gi]])),
        ...b.labels,
        rows: b.rows,
        ...Object.fromEntries(fields.map((f) => [f, format(b.totals[f], 2)])),
        [`${by}_share_percent`]: percent(b.totals[by], grand[by], 2),
      })),
      totals: Object.fromEntries(fields.map((f) => [f, format(grand[f], 2)])),
      integrity: footerCheck(doc, fields),
    }

    // 只在真的存在第二个口径时才提醒换口径排一次。
    // 之前这句无条件写"卖得最好可以指数量也可以指金额"，排欠款、排库存金额时就成了噪音，
    // 而噪音会让人连该看的提示一起跳过。
    const otherFields = fields.filter((f) => f !== by)
    if (otherFields.length > 0) {
      out.note =
        `本次按 ${by} 排序。同一批数据换 --by ${otherFields.join(' / ')} 排，第一名经常不同` +
        '（例如"卖得最好"既可以指销量也可以指销售额）。用户没指明口径时，把两个榜单都算出来，' +
        '并在回答里说明依据的是哪个字段。'
    }

    // 被丢掉的行必须显式报出金额，否则"少了 3.6% 的营业额"这种事看不出来。
    // 销售明细里第三方仓商品的 skuId 是 null，只按 skuId 分组就会静默丢掉它们。
    if (skippedRows > 0) {
      // 兜底建议必须分两种情况说，否则会把调用方送去找一个并不存在的字段：
      // skuId 为 null 可以用 number 兜底，但第三方仓的品类与品牌三列是同时为空的，无字段可补。
      const NO_FALLBACK_FIELDS = ['firstCategoryName', 'secondCategoryName', 'categoryName', 'brandName']
      const noFallback = groupFields.every((f) => NO_FALLBACK_FIELDS.includes(f))
      out.dropped_rows_warning = {
        rows: skippedRows,
        [`${by}_dropped`]: format(skippedMeasure, 2),
        why: `这些行的 ${groupFields.join(' / ')} 全为空，无法归属到任何分组，已排除在排名和 totals 之外。`,
        how_to_fix: noFallback
          ? '**这一处没有兜底字段可补。** 销售明细里第三方仓（location="第三方仓"）的行 '
            + 'firstCategoryName / secondCategoryName / brandName 三列同时为空；categoryName 那列有值'
            + '但是自由文本（混着品牌名和规格串），不能当分类用。所以只有两条路：自己写脚本给空值一个'
            + '具名桶（如"未分类（第三方仓）"）并核对分桶合计与全量合计逐分相等，'
            + '或者在回答里把这部分单独列出来说明它既不能归品类也不能归品牌。'
            + '不要默默让它消失——它的金额往往能排进前十，用户看到的排名会缺一块而毫无提示。'
          : '补一个同样能标识身份的字段做兜底，让这些行各自成组（--group 可以给多个字段）。'
            + '已知的一处：销售明细里第三方仓（location="第三方仓"）商品的 skuId 为 null，'
            + '改成 --group skuId,number 用型号兜底即可，非空 skuId 与 number 实测是 1:1，不会把同一商品拆开。'
            + '在给用户结论前要么修好分组重算，要么说明排名不含这部分——位次可能已经因此变了。',
      }
    }
    return out
  },

  /**
   * 商品收发汇总（deliver-summary）的期初 / 入库 / 出库 / 结存。
   *
   * 为什么这条命令必须存在、而不能让调用方自己挑 qty_N：
   * 那些列的数字后缀**不是稳定契约**，它取决于该账号启用了哪些业务类型。
   * 仓库文档 docs/api/inventory.md 抓包时 入库合计=qty_8 / 出库合计=qty_15 / 结存=qty_16，
   * 而生产账号实测是 入库合计=qty_7 / 出库合计=qty_13 / 结存=qty_14。
   * 照文档取 qty_16 会把"还有 3 条库存"的商品报成"结存 0"——一个看起来完全正常的错误答案。
   * 这个端点又没有服务端页脚，footer 交叉核对帮不上忙。
   *
   * 所以列含义从数据本身解，判据是收发汇总天然成立的那条恒等式（逐行）：
   *   期初 + 入库合计 − 出库合计 = 结存
   * 再加一条页面布局约束：这四组列从左到右就是 期初｜入库｜出库｜结存，所以下标递增。
   * 实测这一条就够了：1172 行、1171 行、165 行三份数据分别只剩 1、1、2 组候选下标。
   *
   * "合计 = 各分项之和"只用来给候选排序，**不作为门槛**。原因是实测踩到过：
   * 1171 行里有 1 行把一笔出库记在结存右边的尾列（qty_16）上，它的分项之和对不上，
   * 但结存恒等式照样成立。拿分项当硬条件会让这一行否掉整份数据——为一行不确定放弃 1170 行
   * 已核对的事实，那是把 fail closed 用错了地方。
   *
   * 解不出来、或排序后仍并列时不猜：只在"所有候选列算出来的合计完全一致"时给数字，
   * 否则该槽位留空并说明。宁可少答也不给错数字。
   */
  flow(positional, flags, argv) {
    const file = positional[0]
    const doc = load(file, flags, argv)
    const solveRows = doc.allRows ?? doc.rows // 解列含义用筛选前的全部行，样本越多解越唯一
    const source = sourceOf(doc, file)
    if (!solveRows.length) return { operation: 'flow', source, note: source.no_data_note ?? '没有数据行。' }

    const nums = [
      ...new Set(
        solveRows
          .flatMap((r) => Object.keys(r ?? {}))
          .map((k) => /^qty_(\d+)$/.exec(k))
          .filter(Boolean)
          .map((m) => Number(m[1])),
      ),
    ].sort((a, b) => a - b)
    if (nums.length < 4 || nums[0] !== 0) {
      throw new Error(
        `${file} 里没有 qty_0…qty_N 这组收发列（找到 ${nums.length} 列），flow 只适用于 deliver-summary 商品收发汇总表。`,
      )
    }
    const qtyCol = (i) => `qty_${i}`
    const costCol = (i) => `cost_${i}`
    const hasCost = solveRows.some((r) => r && costCol(nums[0]) in r)

    // 解析成定点整数（parseAmount 会处理 "1,774.0" 这种千分位逗号）。
    // 有无法解析的单元格就把该行排除在求解之外并如实报出来，不当成 0。
    const grid = []
    let unusable = 0
    for (const r of solveRows) {
      const vals = nums.map((i) => parseAmount(r?.[qtyCol(i)]))
      if (vals.some((v) => v === null)) unusable += 1
      else grid.push(vals)
    }
    const TOL = FACTOR / 1000n // 数量只有一位小数，1e-3 的容差足够吸收显示舍入
    const near = (a, b) => (a > b ? a - b : b - a) <= TOL

    // 每一列都是 0：常见于按 goods 只查一个冷门商品。这时列含义无法判定，但也不需要判定——
    // 不管哪一列是结存，它都是 0。当成"这个区间没有收发"直接回答，比报一堆 null 有用。
    if (grid.length && grid.every((v) => v.every((x) => x === 0n))) {
      const zeros = {}
      for (const s of ['opening', 'inbound', 'outbound', 'closing']) {
        zeros[`${s}_qty`] = '0.00'
        if (hasCost) zeros[`${s}_cost`] = '0.00'
      }
      return {
        operation: 'flow',
        source,
        no_flow: true,
        totals: zeros,
        note:
          `这 ${grid.length} 行的每个 qty_N / cost_N 都是 0：${source.date_range?.begin ?? ''} 至 ` +
          `${source.date_range?.end ?? ''} 期间没有任何入库或出库，期初与结存也都是 0。` +
          '列含义在这种数据上解不出来，但结论不受影响——任何一列都是 0。' +
          '注意这只说明"这个区间没有收发"，不等于"现在没有库存"；当前库存要看 inv-balance 的 qty_1 / allcost_1。',
      }
    }

    // 唯一的硬条件：结存恒等式逐行成立，且下标按页面从左到右递增
    const solutions = []
    for (let a = 1; a < nums.length - 2; a++) {
      for (let b = a + 1; b < nums.length - 1; b++) {
        for (let c = b + 1; c < nums.length; c++) {
          if (grid.every((v) => near(v[0] + v[a] - v[b], v[c]))) {
            solutions.push({ inbound: nums[a], outbound: nums[b], closing: nums[c], ai: a, bi: b })
          }
        }
      }
    }

    if (!solutions.length) {
      // 连结存恒等式都对不上：这份数据的形状与收发汇总不符，继续算下去只会输出错数字
      const nonzero = nums
        .map((i, pos) => ({ column: qtyCol(i), rows: grid.filter((v) => v[pos] !== 0n).length }))
        .filter((x) => x.rows > 0)
      throw new Error(
        `无法从 ${file} 解出收发列含义：没有任何下标组合让"期初 + 入库合计 − 出库合计 = 结存"在全部 ${grid.length} 行上成立。` +
          `非零列：${nonzero.map((x) => `${x.column}(${x.rows}行)`).join('、') || '无'}。` +
          '不要自己挑一列当结存回答用户，先确认这份数据确实来自 deliver-summary（本命令只认这一种表）；' +
          '只要当前库存请改用 inv-balance 的 qty_1 / allcost_1。',
      )
    }

    /**
     * 候选排序用的软证据："合计 = 它左边那段连续分项之和"能对上多少行。
     * 不做门槛的理由见上面的注释——个别行会把出库记在结存右边的尾列上。
     */
    const partsFit = (sol) => {
      let inOk = 0
      let outOk = 0
      for (const v of grid) {
        let ip = 0n
        for (let k = 1; k < sol.ai; k++) ip += v[k]
        let op = 0n
        for (let k = sol.ai + 1; k < sol.bi; k++) op += v[k]
        if (near(v[sol.ai], ip)) inOk += 1
        if (near(v[sol.bi], op)) outOk += 1
      }
      return { inOk, outOk, score: inOk + outOk }
    }
    for (const s of solutions) Object.assign(s, partsFit(s))
    const bestScore = Math.max(...solutions.map((s) => s.score))
    const bestSolutions = solutions.filter((s) => s.score === bestScore)

    // 每个槽位的候选列，只取并列最优的那些解。期初固定是第一列——它的角色由恒等式连带证明：
    // 如果 qty_0 不是期初，那条式子在上千行上不可能同时成立。
    const optsOf = {
      opening: [nums[0]],
      inbound: [...new Set(bestSolutions.map((c) => c.inbound))],
      outbound: [...new Set(bestSolutions.map((c) => c.outbound))],
      closing: [...new Set(bestSolutions.map((c) => c.closing))],
    }
    const SLOTS = ['opening', 'inbound', 'outbound', 'closing']
    const chosen = bestSolutions.length === 1 ? bestSolutions[0] : null

    /**
     * 一个槽位的合计。列没被唯一确定时还有一种情况可以安全给数：**所有候选列在这批行上的
     * 合计完全相同**。单商品查询很常见——入库分项全是 0，谁当"入库合计"都是 0，
     * 数字确定而列名待定。合计不一致才是真的不能给数，这时返回 null。
     */
    const slotTotal = (rows, slot, col) => {
      const opts = optsOf[slot]
      if (!opts.length) return null
      const sums = opts.map((i) => sumField(rows, col(i)).total)
      return sums.every((s) => nearlyEqual(s, sums[0], FACTOR / 100n)) ? sums[0] : null
    }
    const totalsOf = (rows) => {
      const t = {}
      for (const slot of SLOTS) {
        t[`${slot}_qty`] = format(slotTotal(rows, slot, qtyCol), 2)
        if (hasCost) t[`${slot}_cost`] = format(slotTotal(rows, slot, costCol), 2)
      }
      return t
    }

    const rows = doc.rows
    const mapping = {
      opening: qtyCol(nums[0]),
      inbound_total: optsOf.inbound.length === 1 ? qtyCol(optsOf.inbound[0]) : null,
      outbound_total: optsOf.outbound.length === 1 ? qtyCol(optsOf.outbound[0]) : null,
      closing: optsOf.closing.length === 1 ? qtyCol(optsOf.closing[0]) : null,
      resolved_from_data: true,
      solved_on_rows: grid.length,
      rows_unusable: unusable,
      solutions_satisfying_identity: solutions.length,
      why_not_hardcoded:
        'qty_N 的数字后缀由账号启用的业务类型决定，不是稳定契约：仓库文档抓包时结存在 qty_16，' +
        '生产账号实测在 qty_14。所以每次都从数据里解，不照抄任何一份映射表（包括本技能的参考文档）。',
    }

    if (chosen) {
      // 分项列只是"合计左边那段连续列"这个假设的兑现程度。它没有参与判定，报出来是为了
      // 让不寻常的账号配置可见：对不上的行说明该行有一笔记在了这段区间之外的列上。
      mapping.parts_sum_check = {
        inbound_parts: nums.slice(1, chosen.ai).map(qtyCol),
        inbound_rows_matching: `${chosen.inOk}/${grid.length}`,
        outbound_parts: nums.slice(chosen.ai + 1, chosen.bi).map(qtyCol),
        outbound_rows_matching: `${chosen.outOk}/${grid.length}`,
        note:
          '不是 100% 也不影响期初/入库/出库/结存这四个数——它们来自合计列，恒等式逐行成立。' +
          '只是别拿分项列去回答"哪种业务类型出了多少"，这个账号有把出库记在结存右边尾列的行。',
      }
    }

    const undetermined = SLOTS.filter((s) => optsOf[s].length !== 1)
    if (undetermined.length) {
      const safe = undetermined.filter((s) => slotTotal(rows, s, qtyCol) !== null)
      mapping.ambiguity = {
        undetermined_slots: Object.fromEntries(
          undetermined.map((s) => [
            s,
            {
              candidate_columns: optsOf[s].slice(0, 10).map(qtyCol),
              总合计一致: safe.includes(s),
            },
          ]),
        ),
        why:
          `满足结存恒等式的下标组合有 ${solutions.length} 组，按分项证据排序后仍有 ${bestSolutions.length} 组并列：` +
          `这批数据只有 ${grid.length} 行、收发分项大多是 0，证据不足以把每个槽位钉到唯一一列。`,
        how_to_answer:
          '标了 总合计一致 的槽位可以照 totals 里的数字回答——每个候选列算出来都一样，数字是确定的，' +
          '只是"它在第几列"没被证明。totals 里为 null 的槽位候选列结果不一致，不要给数字：' +
          '扩大日期区间或去掉窄化条件重新取数（行多了解通常就唯一了），或改用 inv-balance 的 qty_1 看当前库存。',
      }
    }

    const out = {
      operation: 'flow',
      source,
      column_mapping: mapping,
      totals: totalsOf(rows),
    }

    // 总量上再走一遍恒等式。对唯一解来说这几乎是同义反复（逐行成立自然可加），
    // 它真正的用处在并列的情况：那时不同槽位的数字可能取自不同候选解，加起来就不一定自洽了。
    const idt = (col) => {
      const [o, i, ou, c] = SLOTS.map((s) => slotTotal(rows, s, col))
      return o === null || i === null || ou === null || c === null ? null : { computed: o + i - ou, reported: c }
    }
    const q = idt(qtyCol)
    if (q) {
      out.identity_check = {
        formula: '期初 + 入库合计 − 出库合计 = 结存',
        computed_closing_qty: format(q.computed, 2),
        reported_closing_qty: format(q.reported, 2),
        matches: nearlyEqual(q.computed, q.reported, FACTOR / 100n),
        note:
          '这个端点没有服务端页脚，footer 交叉核对不可用，这条恒等式顶替它做"数据自洽、没丢行"的证据。' +
          '注意它同时是解列含义的判据，所以 matches 为 true 主要说明求解一致；' +
          '真正独立的旁证是 cost_columns_agree（金额列另一套数字满足同一条式子）与 ' +
          'column_mapping.solutions_satisfying_identity（候选越少，列含义越确定）。matches 为 false 时不要给结论。',
      }
      // cost_N 是 qty_N 的配套金额列，没参与求解，同一套下标却满足同一条恒等式——这是独立旁证
      const c = hasCost ? idt(costCol) : null
      if (c) out.identity_check.cost_columns_agree = nearlyEqual(c.computed, c.reported, FACTOR / 10n)
    }

    const groupFields = list(flags.group)
    if (groupFields.length) {
      const labelFields = list(flags.label)
      const by = String(flags.by ?? 'outbound_qty')
      const top = Number(flags.top ?? 10)
      const measures = Object.keys(totalsOf([]))
      if (!measures.includes(by)) {
        throw new Error(`--by ${by} 不是可排序的口径。可用：${measures.join('、')}。`)
      }
      requireFields(doc, [...groupFields, ...labelFields], file)

      const buckets = new Map()
      let skipped = 0
      for (const row of rows) {
        const parts = groupFields.map((f) => {
          const v = row?.[f]
          return v === undefined || v === null ? '' : String(v).trim()
        })
        if (parts.every((p) => p === '')) {
          skipped += 1
          continue
        }
        const k = parts.join('\u0001') // 与 rank 同一套分隔符：控制字符不会出现在业务字段里
        if (!buckets.has(k)) buckets.set(k, { parts, rows: [] })
        const b = buckets.get(k)
        b.rows.push(row)
        if (labelFields.length && !b.labels) {
          b.labels = Object.fromEntries(labelFields.map((f) => [f, row?.[f] ?? null]))
        }
      }

      const groups = [...buckets.values()]
        .map((b) => ({
          ...Object.fromEntries(groupFields.map((f, gi) => [f, b.parts[gi] === '' ? null : b.parts[gi]])),
          ...(b.labels ?? {}),
          rows: b.rows.length,
          ...totalsOf(b.rows),
        }))
        .sort((x, y) => {
          const a = parseAmount(x[by]) ?? 0n
          const c = parseAmount(y[by]) ?? 0n
          return a === c ? 0 : a > c ? -1 : 1
        })

      out.group_by = groupFields.length === 1 ? groupFields[0] : groupFields
      out.sorted_by = by
      out.group_count = groups.length
      out.groups = groups.slice(0, top)
      if (skipped > 0) out.dropped_rows_warning = { rows: skipped, why: `这些行的 ${groupFields.join(' / ')} 全为空，未计入分组。` }
      out.grouping_note =
        '收发汇总的 invName 是分类叶子名（实测 1172 行只有 33 个不同值），单独用它分组会把不同商品并成一个；' +
        '商品身份用 --group skuId,invNo。行还可能按 location 拆开，看到同一 skuId 多行是正常的。'
    }
    return out
  },

  /** 两个区间的对比（环比/同比）。 */
  compare(positional, flags, argv) {
    const [fileA, fileB] = positional
    if (!fileA || !fileB) throw new Error('compare 需要两个数据文件。')
    const docA = load(fileA, flags, argv)
    const docB = load(fileB, flags, argv)
    const fields = list(flags.fields)
    if (!fields.length) throw new Error('compare 需要 --fields a,b。')
    requireFields(docA, fields, fileA)
    requireFields(docB, fields, fileB)
    const [labelA, labelB] = list(flags.labels).length === 2 ? list(flags.labels) : ['A', 'B']

    const rows = {}
    for (const f of fields) {
      const a = sumField(docA.rows, f).total
      const b = sumField(docB.rows, f).total
      const diff = a - b
      rows[f] = {
        [labelA]: format(a, 2),
        [labelB]: format(b, 2),
        difference: format(diff, 2),
        change_percent: b === 0n ? null : percent(diff, b < 0n ? -b : b, 2),
      }
    }
    return {
      operation: 'compare',
      sources: { [labelA]: sourceOf(docA, fileA), [labelB]: sourceOf(docB, fileB) },
      fields,
      comparison: rows,
      note:
        '只有两个文件来自同一端点、同一筛选条件时对比才有意义；口径不同（例如一个含成本一个不含）请在回答里说明。',
    }
  },

  /**
   * 列出某几个字段的不同取值及其行数/金额——筛选之前的"看清楚数据长什么样"。
   *
   * 这是回答"某类商品卖得最好"之前必须走的一步：先看这批数据里实际有哪些分类路径，
   * 再决定筛哪个词。凭想象猜字段取值是这类问题最常见的错误来源。
   */
  distinct(positional, flags, argv) {
    const file = positional[0]
    const doc = load(file, flags, argv)
    const fields = list(flags.fields)
    const measures = list(flags.measure)
    const top = Number(flags.top ?? 30)
    if (!fields.length) throw new Error('distinct 需要 --fields a,b（多个字段会按组合展开，用于看分类路径）。')
    requireFields(doc, [...fields, ...measures], file)

    const buckets = new Map()
    for (const row of doc.rows) {
      const parts = fields.map((f) => String(row?.[f] ?? ''))
      const k = parts.join(' / ')
      if (!buckets.has(k)) {
        buckets.set(k, { value: k, parts, rows: 0, totals: Object.fromEntries(measures.map((m) => [m, 0n])) })
      }
      const b = buckets.get(k)
      b.rows += 1
      for (const m of measures) {
        const v = parseAmount(row?.[m])
        if (v !== null) b.totals[m] += v
      }
    }
    const sortKey = measures[0]
    const all = [...buckets.values()].sort((a, b) => {
      if (sortKey && a.totals[sortKey] !== b.totals[sortKey]) return a.totals[sortKey] > b.totals[sortKey] ? -1 : 1
      if (a.rows !== b.rows) return b.rows - a.rows
      return a.value < b.value ? -1 : 1
    })

    return {
      operation: 'distinct',
      source: sourceOf(doc, file),
      fields,
      distinct_count: buckets.size,
      shown: Math.min(top, buckets.size),
      values: all.slice(0, top).map((b) => ({
        value: b.value,
        rows: b.rows,
        ...Object.fromEntries(measures.map((m) => [m, format(b.totals[m], 2)])),
      })),
      note:
        '拿到取值清单后，用 --where 字段~关键词 做筛选，再用 rank/sum 计算。' +
        '注意同名不同层级：销售明细里 firstCategoryName（一级）/ secondCategoryName（二级）/ categoryName（三级）' +
        '是三层，按"轮胎"这类词筛请挑准层级，并检查有没有误伤别的分类。',
    }
  },
}

function main() {
  const argv = process.argv.slice(2)
  const { flags, positional } = parseArgs(argv)
  const cmd = positional.shift()
  if (!cmd || !cmds[cmd]) {
    console.error(`用法：node kz-compute.mjs <${Object.keys(cmds).join('|')}> <数据文件> [选项]`)
    process.exit(2)
  }
  console.log(JSON.stringify(cmds[cmd](positional, flags, argv), null, 2))
}

try {
  main()
} catch (err) {
  console.error(JSON.stringify({ error: err.message }, null, 2))
  process.exit(1)
}
