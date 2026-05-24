import { Hono } from 'hono'

type Bindings = {
  KZ_API_BASE: string
}

const FORWARD_HEADERS = ['cookie', 'content-type', 'accept', 'authorization', 'user-agent', 'accept-language']

const app = new Hono<{ Bindings: Bindings }>()

app.use('/api/*', async (c) => {
  const url = new URL(c.req.url)
  const apiPath = url.pathname.replace(/^\/api\/?/, '')
  const qs = url.search
  const targetUrl = `${c.env.KZ_API_BASE}/${apiPath}${qs}`

  const fwdHeaders = new Headers()
  for (const h of FORWARD_HEADERS) {
    const v = c.req.raw.headers.get(h)
    if (v) fwdHeaders.set(h, v)
  }
  fwdHeaders.set('sun', '5516')

  const res = await fetch(targetUrl, {
    method: c.req.method,
    headers: fwdHeaders,
    body: ['GET', 'HEAD'].includes(c.req.method) ? undefined : c.req.raw.body
  })

  const resHeaders = new Headers()
  for (const [key, value] of res.headers.entries()) {
    if (key !== 'set-cookie') {
      resHeaders.set(key, value)
    }
  }
  const setCookies = res.headers.getAll?.('set-cookie') ?? []
  for (const sc of setCookies) {
    resHeaders.append('set-cookie', sc.replace(/;\s*domain=[^;]+/i, ''))
  }

  return new Response(res.body, { status: res.status, headers: resHeaders })
})

export default app