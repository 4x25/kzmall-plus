# kzmall-plus AI Agent 凭证网关

本文档描述 kzmall-plus Worker 自有的代理、认证、凭证管理和错误协议。被代理的快准车服上游查询接口契约见[快准接口文档](../api/README.md)。

## 接入方式

正常登录系统成功后，Worker 会复用这次快准登录结果，自动加密保存当前账号、密码和 Cookie jar，不会再发起一次登录。随后可直接在“Agent Token”页面创建命名 Token；Token 原文仅在创建或轮换成功的响应中显示一次。若会话在该功能上线前已登录，需要退出后重新登录一次完成自动同步。

Agent 请求格式：

```http
POST /api/<快准接口路径>?<原查询参数>
X-Credential: kza_v1_<43位base64url>
Content-Type: application/json
```

`/api/<path>` 映射到 `${KZ_API_BASE}/<path>`。是否存在 `X-Credential` 决定请求走 Agent 认证还是浏览器 Cookie 代理；空的 `X-Credential` 也会进入 Agent 模式并被拒绝。查询参数的顺序和重复键会保留。除 `CONNECT`、`TRACE`、快准登录/退出路径和本地 Agent 凭证管理路径外，标准 HTTP 方法和业务路径均可转发。

示例：

```bash
curl 'https://<应用域名>/api/report/invBalance?action=detail' \
  -H 'X-Credential: <创建时显示的Agent-Token>'
```

不要把 Token 放入 URL、提示词、日志、截图、代码仓库或浏览器存储。Agent 不应发送 `Cookie` 或 `Authorization`；即使发送，网关也会丢弃这些头。

## 权限与生命周期

- Token 永久有效，拥有对应快准账号的完整业务接口权限。
- 网页退出只清除网页 Cookie，不影响 Agent Token。
- 每个账号最多 10 枚命名 Token。
- 轮换会签发新原文并撤销旧值；撤销、轮换及全部删除受 Cloudflare KV 最终一致性影响，全球生效最长可能约 60 秒。
- 删除账号凭证会撤销该账号全部 Agent Token，并删除加密保存的密码和 Cookie jar。

Token 本身是 32 字节安全随机不透明值。KV 只保存 Token 的 SHA-256 索引，以及 AES-256-GCM 加密后的账号、密码、Cookie jar 和元数据；原始 Token 不会持久化。

## 自动登录与重放

网关在快准 Cookie 缺失或进入到期前 5 分钟窗口时主动重新登录。遇到明确的 401、登录重定向、结构化登录响应、登录表单、快准当前使用的单脚本登录跳转或 `token` Cookie 删除时，会重新登录并将原请求完整重放一次。单脚本规则来自 2026-08-17 专用测试账号的真实无效 Cookie 响应，并以脱敏 fixture 固化。

所有方法都会重放，包括 `POST`、`PUT`、`PATCH` 和 `DELETE`。快准接口没有统一幂等键，因此首次请求已生效但响应被误判为登录失效时，写操作可能重复执行。Agent 调用写接口前必须显式确认业务影响；能够提供业务幂等字段时应始终提供。

请求体为了支持重放会在 Worker 内存中缓存，上限为 4 MiB。超过上限返回 `413 REQUEST_BODY_TOO_LARGE`。第二次请求仍被判定为会话失效时返回 `502 UPSTREAM_AUTH_FAILED`，不会继续循环。

## 请求与响应隔离

网关会移除 Agent 提供的以下信息：

- `Cookie`、`Authorization`、`X-Credential`
- `Host`、`Origin`、`Referer`
- `CF-*`、`Forwarded`、`X-Forwarded-*`
- `X-HTTP-Method-Override` 及 hop-by-hop headers

随后注入服务端 Cookie jar 和固定 `sun: 5516`。上游响应的 `Set-Cookie` 只用于更新加密 Cookie jar，永远不会下发给 Agent；CORS 响应头也会移除，因此该入口不提供跨域浏览器调用能力。业务响应的状态码、正文和其余端到端响应头保持不变。

## 网关错误

网关自身错误统一为：

```json
{
  "error": {
    "code": "INVALID_AGENT_CREDENTIAL",
    "message": "凭证无效或已撤销",
    "requestId": "<uuid>"
  }
}
```

常见错误：

| HTTP | code | 含义 |
|---:|---|---|
| 400 | `INVALID_UPSTREAM_PATH` | 路径为空、非法编码、路径穿越或形似跨域 URL |
| 401 | `INVALID_AGENT_CREDENTIAL` | Token 无效、已撤销或账号凭证已删除（响应消息为“凭证无效或已撤销”） |
| 403 | `UPSTREAM_AUTH_PATH_FORBIDDEN` | Agent 请求命中快准登录或退出路径 |
| 403 | `AGENT_MANAGEMENT_PATH_FORBIDDEN` | Agent 请求命中本地 Token 管理路径 |
| 405 | `METHOD_NOT_ALLOWED` | 使用了 `CONNECT` 或 `TRACE` |
| 413 | `REQUEST_BODY_TOO_LARGE` | 请求体超过 4 MiB |
| 502 | `UPSTREAM_UNAVAILABLE` | 快准网络或响应流暂时不可用 |
| 502 | `UPSTREAM_REAUTH_FAILED` | 保存的快准密码失效，需要退出后重新登录以更新 |
| 502 | `UPSTREAM_AUTH_FAILED` | 自动登录后的单次重放仍被拒绝 |
| 503 | `AGENT_API_DISABLED` | 当前环境未启用 Agent 入口 |
| 503 | `UPSTREAM_REAUTH_COOLDOWN` | 登录失败后的 30 秒冷却期，可读取 `Retry-After` |
| 503 | `CREDENTIAL_STORE_UNAVAILABLE` | KV 密文损坏、key/kid 不匹配或加密配置不可用 |

快准正常业务响应不会包装成上述结构。调用方应先根据是否存在顶层 `error` 和 HTTP 状态区分网关错误，再按对应快准接口契约处理业务响应。

## 管理接口

以下接口只允许带有效 `kzp_mgmt` HttpOnly Cookie 的同源网页会话调用。修改接口还必须携带同源 `Origin` 和 `Content-Type: application/json`。

| 方法与路径 | JSON 请求 | 行为 |
|---|---|---|
| `GET /api/agent-credentials` | — | 返回脱敏账号状态和 Token 元数据 |
| `PUT /api/agent-credentials/account` | `{ "password": "..." }` | 兼容/运维接口：登录快准并加密保存或更新凭证（常规页面不使用） |
| `DELETE /api/agent-credentials/account` | `{}` | 兼容/运维接口：删除凭证并撤销全部 Token（常规页面不使用） |
| `POST /api/agent-credentials` | `{ "name": "..." }` | 创建 Token，原文仅本次返回 |
| `PATCH /api/agent-credentials/:id` | `{ "name": "..." }` | 修改名称 |
| `POST /api/agent-credentials/:id/rotate` | `{}` | 轮换，原文仅本次返回 |
| `DELETE /api/agent-credentials/:id` | `{}` | 撤销指定 Token |

## 运维边界

- 已验证的 production 与 `development` 环境启用 `AGENT_API_ENABLED`；新增环境必须先保持 `false`，在测试账号完成过期响应验证后再开启。
- `AGENT_CREDENTIAL_ROOT_KEY_V1` 与 `MANAGEMENT_SESSION_ROOT_KEY_V1` 必须是不同的 32 字节 base64url Worker Secret。
- `APP_ENV` 参与 HKDF 与密文 AAD；已写入数据后不能随意修改，否则旧记录会受控地解密失败。
- 不同环境必须使用不同 KV namespace 和 root key。不能把生产 KV 复制到开发环境使用。
- 当前不使用 Durable Objects。单 isolate 会合并已经并发的登录刷新；跨 isolate/机房仍可能重复登录并以最后一次 KV 写入为准。
- 自定义日志仅记录 requestId、方法、无查询参数路径、耗时、状态类别及刷新/重放事件，不记录请求头、正文、查询参数、业务响应、用户名、Cookie、Token 或 Token hash。
