import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Bot,
  Check,
  Copy,
  Loader2,
  Pencil,
  RefreshCw,
  RotateCw,
  ShieldAlert,
  Trash2,
  X,
} from 'lucide-react'

interface AccountMetadata {
  credentialConfigured: boolean
}

interface TokenMetadata {
  id: string
  name: string
  tokenHint: string
  permissions: 'full-proxy'
  createdAt: number
  updatedAt: number
}

interface ManagementSnapshot {
  account: AccountMetadata
  tokens: TokenMetadata[]
  limits: { maxTokens: number }
}

interface TokenSecretResponse {
  token: string
  metadata: TokenMetadata
}

interface ApiErrorBody {
  error?: { code?: string; message?: string; requestId?: string }
}

interface SecretState {
  title: string
  value: string
}

class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
    this.name = 'ApiError'
  }
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: 'same-origin', ...init })
  const text = await response.text()
  if (!response.ok) {
    let message = `请求失败（${response.status}）`
    try {
      const body = JSON.parse(text) as ApiErrorBody
      if (body.error?.message) message = body.error.message
    } catch {
      // Keep the sanitized status-only fallback.
    }
    throw new ApiError(message, response.status)
  }
  return (text ? JSON.parse(text) : undefined) as T
}

function jsonInit(method: string, body: Record<string, unknown>): RequestInit {
  return {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }
}

function formatTime(value: number | null): string {
  if (value === null) return '尚未验证'
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export function AgentCredentialsPage() {
  const [snapshot, setSnapshot] = useState<ManagementSnapshot | null>(null)
  const [newTokenName, setNewTokenName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [busy, setBusy] = useState<string | null>('load')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [secret, setSecret] = useState<SecretState | null>(null)
  const secretDialog = useRef<HTMLDialogElement>(null)

  const load = useCallback(async () => {
    setBusy('load')
    setError('')
    try {
      setSnapshot(await apiRequest<ManagementSnapshot>('/api/agent-credentials'))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '加载 Agent Token 失败')
    } finally {
      setBusy(null)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (secret) secretDialog.current?.showModal()
  }, [secret])

  const runAction = async (key: string, action: () => Promise<void>) => {
    setBusy(key)
    setError('')
    setNotice('')
    try {
      await action()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '操作失败')
    } finally {
      setBusy(null)
    }
  }

  const createToken = async (event: React.FormEvent) => {
    event.preventDefault()
    const name = newTokenName.trim()
    if (!name) {
      setError('请输入 Token 名称')
      return
    }
    if (!window.confirm('此 Token 永久有效且拥有完整快准账号权限，写请求可能自动重放一次。继续创建吗？')) return
    await runAction('create', async () => {
      const created = await apiRequest<TokenSecretResponse>(
        '/api/agent-credentials',
        jsonInit('POST', { name }),
      )
      setNewTokenName('')
      setSecret({ title: `Token「${created.metadata.name}」已创建`, value: created.token })
      await load()
    })
  }

  const saveName = async (tokenId: string) => {
    const name = editingName.trim()
    if (!name) {
      setError('Token 名称不能为空')
      return
    }
    await runAction(`rename:${tokenId}`, async () => {
      await apiRequest(`/api/agent-credentials/${tokenId}`, jsonInit('PATCH', { name }))
      setEditingId(null)
      setEditingName('')
      setNotice('Token 名称已更新')
      await load()
    })
  }

  const rotateToken = async (token: TokenMetadata) => {
    if (!window.confirm(`轮换「${token.name}」后，旧 Token 将失效。继续吗？`)) return
    await runAction(`rotate:${token.id}`, async () => {
      const rotated = await apiRequest<TokenSecretResponse>(
        `/api/agent-credentials/${token.id}/rotate`,
        jsonInit('POST', {}),
      )
      setSecret({ title: `Token「${rotated.metadata.name}」已轮换`, value: rotated.token })
      await load()
    })
  }

  const revokeToken = async (token: TokenMetadata) => {
    if (!window.confirm(`确定撤销「${token.name}」吗？该操作不可恢复。`)) return
    await runAction(`revoke:${token.id}`, async () => {
      await apiRequest(`/api/agent-credentials/${token.id}`, jsonInit('DELETE', {}))
      setNotice('Token 已撤销；受 KV 一致性影响，全球生效最长可能需要约 60 秒')
      await load()
    })
  }

  const copySecret = async () => {
    if (!secret) return
    try {
      await navigator.clipboard.writeText(secret.value)
      setNotice('Token 已复制到剪贴板')
    } catch {
      setError('无法自动复制，请手动选择 Token')
    }
  }

  const closeSecret = () => {
    secretDialog.current?.close()
    setSecret(null)
  }

  const accountReady = snapshot?.account.credentialConfigured ?? false
  const tokenCount = snapshot?.tokens.length ?? 0

  return (
    <div id="agent-credentials-root" data-theme="kzmall" className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Bot className="size-6" />
            Agent Token 管理
          </h1>
          <p className="mt-1 text-sm text-base-content/60">为 AI Agent 创建独立于网页登录状态的快准接口凭证</p>
        </div>
        <button type="button" className="kz-btn kz-btn-sm" disabled={busy === 'load'} onClick={() => void load()}>
          <RefreshCw className={`size-4 ${busy === 'load' ? 'animate-spin' : ''}`} />
          刷新
        </button>
      </div>

      {error && (
        <div role="alert" className="kz-alert kz-alert-error">
          <X className="size-5" />
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div role="status" className="kz-alert kz-alert-success">
          <Check className="size-5" />
          <span>{notice}</span>
        </div>
      )}

      <section className="kz-card kz-card-border bg-base-100">
        <div className="kz-card-body">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="kz-card-title text-lg">Agent Token</h2>
                <p className="mt-1 text-sm text-base-content/60">{tokenCount} / {snapshot?.limits.maxTokens ?? 10} 枚；原文仅创建或轮换时显示一次</p>
              </div>
            </div>

            <form className="mt-4 flex flex-col gap-3 sm:flex-row" onSubmit={(event) => void createToken(event)}>
              <input
                className="kz-input min-w-0 flex-1"
                value={newTokenName}
                onChange={(event) => setNewTokenName(event.target.value)}
                placeholder="例如：库存分析 Agent"
                maxLength={64}
                disabled={!accountReady || busy !== null}
              />
              <button type="submit" className="kz-btn kz-btn-primary" disabled={!accountReady || busy !== null || !newTokenName.trim()}>
                {busy === 'create' && <Loader2 className="size-4 animate-spin" />}
                创建 Token
              </button>
            </form>

            {busy === 'load' && !snapshot ? (
              <div className="flex items-center justify-center gap-2 py-12 text-base-content/60"><Loader2 className="size-5 animate-spin" />加载中…</div>
            ) : snapshot === null ? null : !accountReady ? (
              <p role="status" className="mt-5 text-sm text-warning">当前登录尚未同步 Agent 凭证，请退出后重新登录一次。</p>
            ) : snapshot?.tokens.length === 0 ? (
              <div className="py-12 text-center text-sm text-base-content/60">尚未创建 Agent Token</div>
            ) : (
              <div className="mt-5 overflow-x-auto">
                <table className="kz-table kz-table-sm">
                  <thead><tr><th>名称</th><th>凭证尾号</th><th>创建时间</th><th>更新时间</th><th className="text-right">操作</th></tr></thead>
                  <tbody>
                    {snapshot?.tokens.map((token) => (
                      <tr key={token.id}>
                        <td>
                          {editingId === token.id ? (
                            <div className="flex min-w-52 items-center gap-2">
                              <input className="kz-input kz-input-sm min-w-0" value={editingName} maxLength={64} onChange={(event) => setEditingName(event.target.value)} />
                              <button type="button" className="kz-btn kz-btn-square kz-btn-sm" aria-label="保存名称" disabled={busy !== null} onClick={() => void saveName(token.id)}><Check className="size-4" /></button>
                              <button type="button" className="kz-btn kz-btn-square kz-btn-ghost kz-btn-sm" aria-label="取消编辑" onClick={() => setEditingId(null)}><X className="size-4" /></button>
                            </div>
                          ) : <span className="font-medium">{token.name}</span>}
                        </td>
                        <td><code className="rounded bg-base-200 px-2 py-1 text-xs">••••••{token.tokenHint}</code></td>
                        <td className="whitespace-nowrap text-base-content/60">{formatTime(token.createdAt)}</td>
                        <td className="whitespace-nowrap text-base-content/60">{formatTime(token.updatedAt)}</td>
                        <td>
                          <div className="flex justify-end gap-1">
                            <button type="button" className="kz-btn kz-btn-square kz-btn-ghost kz-btn-sm" aria-label="修改名称" disabled={busy !== null} onClick={() => { setEditingId(token.id); setEditingName(token.name) }}><Pencil className="size-4" /></button>
                            <button type="button" className="kz-btn kz-btn-square kz-btn-ghost kz-btn-sm" aria-label="轮换 Token" disabled={busy !== null} onClick={() => void rotateToken(token)}>{busy === `rotate:${token.id}` ? <Loader2 className="size-4 animate-spin" /> : <RotateCw className="size-4" />}</button>
                            <button type="button" className="kz-btn kz-btn-square kz-btn-ghost kz-btn-sm text-error" aria-label="撤销 Token" disabled={busy !== null} onClick={() => void revokeToken(token)}>{busy === `revoke:${token.id}` ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </div>
      </section>

      <dialog
        id="agent-token-secret-dialog"
        ref={secretDialog}
        className="kz-modal"
        aria-labelledby="agent-token-secret-dialog-title"
        onClose={() => setSecret(null)}
      >
        <div className="kz-modal-box">
          <h3 id="agent-token-secret-dialog-title" className="text-lg font-bold">{secret?.title}</h3>
          <div role="alert" className="kz-alert kz-alert-warning mt-4">
            <ShieldAlert className="size-5" />
            <span>请立即复制并妥善保管。关闭后服务端无法再次展示原文。</span>
          </div>
          <textarea className="kz-textarea mt-4 min-h-28 w-full resize-none bg-base-200 font-mono text-sm" readOnly value={secret?.value ?? ''} onFocus={(event) => event.currentTarget.select()} />
          <div className="kz-modal-action">
            <button type="button" className="kz-btn" onClick={() => void copySecret()}><Copy className="size-4" />复制 Token</button>
            <button type="button" className="kz-btn" onClick={closeSecret}>我已保存并关闭</button>
          </div>
        </div>
        <form method="dialog" className="kz-modal-backdrop"><button type="submit">关闭</button></form>
      </dialog>
    </div>
  )
}
