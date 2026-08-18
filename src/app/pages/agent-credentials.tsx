import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Bot,
  Check,
  Copy,
  KeyRound,
  Loader2,
  Pencil,
  RefreshCw,
  RotateCw,
  ShieldAlert,
  Trash2,
  X,
} from 'lucide-react'

interface AccountMetadata {
  usernameHint: string
  credentialConfigured: boolean
  lastValidatedAt: number | null
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
  const [password, setPassword] = useState('')
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

  const bindCredential = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!password) {
      setError('请输入快准账号密码')
      return
    }
    await runAction('account', async () => {
      await apiRequest('/api/agent-credentials/account', jsonInit('PUT', { password }))
      setPassword('')
      setNotice('快准账号凭证已加密保存')
      await load()
    })
  }

  const createToken = async (event: React.FormEvent) => {
    event.preventDefault()
    const name = newTokenName.trim()
    if (!name) {
      setError('请输入 Token 名称')
      return
    }
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

  const deleteAll = async () => {
    if (!window.confirm('将撤销全部 Agent Token，并删除保存的快准密码与 Cookie。确定继续吗？')) return
    await runAction('delete-account', async () => {
      await apiRequest('/api/agent-credentials/account', jsonInit('DELETE', {}))
      setNotice('全部 Agent Token 和已保存凭证已删除')
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

      <div role="alert" className="kz-alert kz-alert-warning">
        <ShieldAlert className="size-5" />
        <div>
          <div className="font-semibold">这是永久有效的完整账号权限</div>
          <div className="text-sm opacity-80">持有 Token 的 Agent 可调用快准全部业务接口；会话失效后写请求也会自动重放一次。</div>
        </div>
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

      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <section className="kz-card kz-card-border bg-base-100">
          <div className="kz-card-body">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="kz-card-title text-lg"><KeyRound className="size-5" />快准账号凭证</h2>
                <p className="mt-1 text-sm text-base-content/60">密码只会在 Worker 中加密后写入 KV</p>
              </div>
              <span className={`kz-badge ${accountReady ? 'kz-badge-success' : 'kz-badge-warning'}`}>
                {accountReady ? '已绑定' : '未绑定'}
              </span>
            </div>

            <dl className="mt-4 grid gap-3 rounded-box bg-base-200 p-4 text-sm">
              <div className="flex justify-between gap-4"><dt className="text-base-content/60">当前账号</dt><dd>{snapshot?.account.usernameHint ?? '—'}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-base-content/60">最近验证</dt><dd>{formatTime(snapshot?.account.lastValidatedAt ?? null)}</dd></div>
            </dl>

            <form className="mt-4 space-y-3" onSubmit={(event) => void bindCredential(event)}>
              <label className="block text-sm font-medium" htmlFor="agent-account-password">快准账号密码</label>
              <input
                id="agent-account-password"
                type="password"
                className="kz-input w-full"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={accountReady ? '输入密码以更新已保存凭证' : '输入密码以绑定账号'}
                disabled={busy !== null}
              />
              <button type="submit" className="kz-btn w-full" disabled={busy !== null || !password}>
                {busy === 'account' && <Loader2 className="size-4 animate-spin" />}
                {accountReady ? '验证并更新凭证' : '验证并保存凭证'}
              </button>
            </form>

            {accountReady && (
              <div className="kz-card-actions mt-5 border-t border-base-300 pt-5">
                <button type="button" className="kz-btn kz-btn-error kz-btn-outline kz-btn-sm" disabled={busy !== null} onClick={() => void deleteAll()}>
                  <Trash2 className="size-4" />撤销全部并删除凭证
                </button>
              </div>
            )}
          </div>
        </section>

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

            {!accountReady ? (
              <div role="status" className="kz-alert mt-5"><KeyRound className="size-5" /><span>请先验证并保存快准账号凭证</span></div>
            ) : busy === 'load' && !snapshot ? (
              <div className="flex items-center justify-center gap-2 py-12 text-base-content/60"><Loader2 className="size-5 animate-spin" />加载中…</div>
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
      </div>

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
