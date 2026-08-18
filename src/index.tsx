import { Hono } from 'hono'
import { EncryptedRecordError, CryptoConfigurationError } from './server/crypto'
import { AppError, errorResponse, logEvent } from './server/errors'
import {
  createCredentialToken,
  deleteAccountCredential,
  getCredentialManagement,
  renameCredentialToken,
  revokeCredentialToken,
  rotateCredentialToken,
  updateAccountCredential,
} from './server/management'
import {
  handleAgentProxy,
  handleBrowserLogin,
  handleBrowserLogout,
  handleBrowserProxy,
} from './server/proxy'

type AppEnvironment = {
  Bindings: CloudflareBindings
  Variables: { requestId: string; startedAt: number }
}

const app = new Hono<AppEnvironment>()

app.use('*', async (c, next) => {
  c.set('requestId', crypto.randomUUID())
  c.set('startedAt', Date.now())
  await next()
  c.header('x-request-id', c.get('requestId'))
  logEvent('info', 'request_completed', {
    requestId: c.get('requestId'),
    method: c.req.method,
    path: new URL(c.req.url).pathname,
    durationMs: Date.now() - c.get('startedAt'),
    statusCategory: `${Math.floor(c.res.status / 100)}xx`,
  })
})

app.use('/api/*', async (c, next) => {
  if (c.req.raw.headers.has('x-credential')) {
    return handleAgentProxy(c.req.raw, c.env, c.get('requestId'))
  }
  await next()
})

app.post('/api/passport/login/signIn', (c) => (
  handleBrowserLogin(c.req.raw, c.env, c.get('requestId'))
))

app.post('/api/passport/login/signOut', (c) => (
  handleBrowserLogout(c.req.raw, c.env, c.get('requestId'))
))

app.get('/api/agent-credentials', (c) => (
  getCredentialManagement(c.req.raw, c.env, c.get('requestId'))
))

app.put('/api/agent-credentials/account', (c) => (
  updateAccountCredential(c.req.raw, c.env, c.get('requestId'))
))

app.delete('/api/agent-credentials/account', (c) => (
  deleteAccountCredential(c.req.raw, c.env, c.get('requestId'))
))

app.post('/api/agent-credentials', (c) => (
  createCredentialToken(c.req.raw, c.env, c.get('requestId'))
))

app.patch('/api/agent-credentials/:id', (c) => (
  renameCredentialToken(c.req.raw, c.env, c.get('requestId'), c.req.param('id'))
))

app.post('/api/agent-credentials/:id/rotate', (c) => (
  rotateCredentialToken(c.req.raw, c.env, c.get('requestId'), c.req.param('id'))
))

app.delete('/api/agent-credentials/:id', (c) => (
  revokeCredentialToken(c.req.raw, c.env, c.get('requestId'), c.req.param('id'))
))

app.all('/api/*', (c) => (
  handleBrowserProxy(c.req.raw, c.env, c.get('requestId'))
))

app.onError((error, c) => {
  const requestId = c.get('requestId') || crypto.randomUUID()
  const path = new URL(c.req.url).pathname
  if (error instanceof AppError) {
    logEvent(error.status >= 500 ? 'error' : 'info', 'request_rejected', {
      requestId,
      method: c.req.method,
      path,
      durationMs: Date.now() - (c.get('startedAt') || Date.now()),
      status: error.status,
      statusCategory: `${Math.floor(error.status / 100)}xx`,
      code: error.code,
    })
    return errorResponse(error, requestId)
  }

  if (error instanceof EncryptedRecordError || error instanceof CryptoConfigurationError) {
    logEvent('error', 'credential_store_unavailable', {
      requestId,
      method: c.req.method,
      path,
      durationMs: Date.now() - (c.get('startedAt') || Date.now()),
      statusCategory: '5xx',
      errorType: error.name,
    })
    return errorResponse(
      new AppError(503, 'CREDENTIAL_STORE_UNAVAILABLE', '凭证存储暂时不可用'),
      requestId,
    )
  }

  logEvent('error', 'unhandled_request_error', {
    requestId,
    method: c.req.method,
    path,
    durationMs: Date.now() - (c.get('startedAt') || Date.now()),
    statusCategory: '5xx',
    errorType: error instanceof Error ? error.name : 'UnknownError',
  })
  return errorResponse(new AppError(500, 'INTERNAL_ERROR', '服务内部错误'), requestId)
})

export default app
