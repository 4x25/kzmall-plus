#!/usr/bin/env node
/**
 * kz-doctor —— 连通性与配置自检，在真正取业务数据之前跑一次。
 *
 * 它只调用两个最小的主数据端点，用来分别验证 GET 和 POST(零字节表单) 两条线路，
 * 并且从不打印 Token 本身（只报告"存在/前缀/长度"这类不足以复用的特征）。
 *
 *   node kz-doctor.mjs
 */

import { callEndpoint, redact, loadConfig } from './kz-http.mjs'

const checks = []
const record = (name, ok, detail, fix) => checks.push({ check: name, ok, detail: detail ?? null, fix: fix ?? null })

const [major] = process.versions.node.split('.').map(Number)
record('Node 版本 ≥ 18', major >= 18, `当前 ${process.versions.node}`, major >= 18 ? null : '请升级 Node（需要内置 fetch）。')

let cfg = null
try {
  cfg = loadConfig()
  record('环境变量 KZP_BASE_URL', true, cfg.baseUrl)
  // 只暴露不足以重建凭证的特征：前缀 + 长度
  record('环境变量 KZP_AGENT_TOKEN', true, `已设置（kza_v1_ 前缀，长度 ${cfg.token.length}）`)
} catch (err) {
  record('环境变量', false, redact(err.message), '在运行环境里设置 KZP_BASE_URL 与 KZP_AGENT_TOKEN；Token 不要写进文件或命令行。')
}

if (cfg) {
  for (const [key, params, opts] of [
    ['brand-list', {}, { rows: 1 }],
    ['store-list', {}, {}],
  ]) {
    try {
      const res = await callEndpoint(key, params, opts)
      const n = Array.isArray(res.rows) ? res.rows.length : 0
      record(`只读探活 ${key}`, true, `HTTP 线路与成功谓词均通过，取到 ${n} 行，${res.meta.bytes} 字节`)
    } catch (err) {
      record(`只读探活 ${key}`, false, redact(err.message), err.code === 'INVALID_AGENT_CREDENTIAL' ? '请让用户在 kzmall-plus 重新生成 Agent Token。' : null)
    }
  }
}

const ok = checks.every((c) => c.ok)
console.log(
  JSON.stringify(
    {
      ready: ok,
      checks,
      next: ok
        ? '自检通过。用 node kz-fetch.mjs --list 查看可调用端点。'
        : '先解决上面 ok=false 的项；未通过时不要开始业务取数，避免把配置错误解释成"没有数据"。',
    },
    null,
    2,
  ),
)
process.exit(ok ? 0 : 1)
