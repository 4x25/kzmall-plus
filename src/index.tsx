import { Hono } from 'hono'

type Bindings = {
  KZ_API_BASE: string
}

const app = new Hono<{ Bindings: Bindings }>()

app.get('/api/health', (c) => c.json({ status: 'ok' }))

app.post('/api/login', async (c) => {
  const body = await c.req.json<{ username?: string; password?: string }>().catch(() => null)
  if (!body?.username || !body?.password) {
    return c.json({ success: false, msg: '请输入账号和密码' }, 400)
  }

  const form = new URLSearchParams({
    username: body.username,
    userpwd: body.password,
    token: '',
    ispwd: '1'
  })

  try {
    const res = await fetch(`${c.env.KZ_API_BASE}/index.php/passport/login/signIn`, {
      method: 'POST',
      headers: {
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0',
        accept: 'application/json, text/javascript, */*; q=0.01',
        'content-type': 'application/x-www-form-urlencoded',
        dnt: '1',
        sun: '5516',
        referer: `${c.env.KZ_API_BASE}/index.php/passport/login/index`
      },
      body: form.toString()
    })

    const data = await res.json<{ success?: boolean; msg?: string }>().catch(() => null)
    if (!data) {
      return c.json({ success: false, msg: '上游服务返回异常' }, 502)
    }

    const newRes = c.json(data)

    const setCookies = res.headers.getAll?.('set-cookie') ?? []
    for (const sc of setCookies) {
      const rewritten = sc.replace(/;\s*domain=[^;]+/i, '')
      newRes.headers.append('set-cookie', rewritten)
    }

    return newRes
  } catch {
    return c.json({ success: false, msg: '网络错误，请稍后重试' }, 500)
  }
})

export default app