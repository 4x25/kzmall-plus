/**
 * 金额与数量的定点算术。
 *
 * 为什么不用 JS 浮点：报表金额是"分"级业务数据，0.1 + 0.2 !== 0.3 这类误差
 * 累加到几千行以后会变成用户看得见的差额；而快准后端把金额混着 number 和
 * 数值字符串（有的还带千分位逗号）返回。这里统一按 1e6 缩放成 BigInt 计算，
 * 只在最后输出时转回十进制字符串。
 */

export const SCALE = 6
const FACTOR = 10n ** BigInt(SCALE)

/**
 * 把后端字段解析成缩放整数。
 * 无法解析时返回 null 而不是 0——把"缺数据"和"金额为零"混为一谈会静默算错。
 */
export function parseAmount(value) {
  if (value === null || value === undefined) return null
  if (typeof value === 'bigint') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null
    return parseAmount(value.toFixed(SCALE))
  }
  let s = String(value).trim().replace(/,/g, '').replace(/%$/, '')
  if (s === '' || s === '-' || s === '--' || s.toLowerCase() === 'null') return null
  const m = /^([+-]?)(\d*)(?:\.(\d*))?$/.exec(s)
  if (!m || (m[2] === '' && (m[3] ?? '') === '')) return null
  const sign = m[1] === '-' ? -1n : 1n
  const int = BigInt(m[2] || '0')
  const fracRaw = (m[3] || '').slice(0, SCALE).padEnd(SCALE, '0')
  return sign * (int * FACTOR + BigInt(fracRaw))
}

/** 解析失败时报错的严格版本，用于"这一列必须是数字"的场合。 */
export function requireAmount(value, label = 'value') {
  const parsed = parseAmount(value)
  if (parsed === null) throw new Error(`${label} 不是可解析的数值：${JSON.stringify(value)}`)
  return parsed
}

export const add = (a, b) => a + b
export const sub = (a, b) => a - b

/** 缩放整数 × 缩放整数，结果重新归一化到同一刻度。 */
export function mul(a, b) {
  return (a * b) / FACTOR
}

/** 缩放整数 ÷ 缩放整数，结果仍是缩放整数（相当于比值）。 */
export function div(a, b) {
  if (b === 0n) return null
  return (a * FACTOR) / b
}

/** 输出十进制字符串，decimals 位四舍五入（半数向远离零方向进位）。 */
export function format(scaled, decimals = 2) {
  if (scaled === null || scaled === undefined) return null
  const neg = scaled < 0n
  let v = neg ? -scaled : scaled
  const drop = BigInt(SCALE - decimals)
  if (drop > 0n) {
    const p = 10n ** drop
    const rem = v % p
    v = v / p
    if (rem * 2n >= p) v += 1n
  }
  let s = v.toString().padStart(decimals + 1, '0')
  const out = decimals > 0 ? `${s.slice(0, -decimals)}.${s.slice(-decimals)}` : s
  return (neg && v !== 0n ? '-' : '') + out
}

export const toNumber = (scaled) => (scaled === null ? null : Number(format(scaled, SCALE)))

/** 对一列求和；忽略无法解析的单元格，但把数量记下来以便诚实汇报。 */
export function sumField(rows, field) {
  let total = 0n
  let counted = 0
  let skipped = 0
  for (const row of rows) {
    const v = parseAmount(row?.[field])
    if (v === null) {
      if (row && field in row) skipped += 1
      continue
    }
    total += v
    counted += 1
  }
  return { total, counted, skipped }
}

/** 百分比：numerator / denominator × 100，返回字符串（保留 decimals 位）。 */
export function percent(numerator, denominator, decimals = 2) {
  if (denominator === 0n || denominator === null || numerator === null) return null
  return format((numerator * 100n * FACTOR) / denominator, decimals)
}

/** 比较两个缩放整数是否在容差内相等，用于行求和与服务端页脚交叉核对。 */
export function nearlyEqual(a, b, toleranceScaled = FACTOR / 100n) {
  if (a === null || b === null) return null
  const d = a > b ? a - b : b - a
  return d <= toleranceScaled
}

export { FACTOR }
