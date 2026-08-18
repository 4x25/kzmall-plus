# kzmall-plus

面向快准车服个人经营者的 React SPA。Cloudflare Worker 同时提供浏览器 Cookie 代理和面向 AI Agent 的加密凭证网关。

## 本地开发

```bash
npm install
cp .dev.vars.example .dev.vars
npm run dev
```

在 `.dev.vars` 中填写两个独立的 32 字节 base64url root key。可分别运行下面的命令生成：

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

不要复用两枚 key，也不要提交 `.dev.vars`。本地 Workerd 使用独立的本地 KV 数据；生产与 `development` 部署环境也各自自动配置独立的 `AGENT_AUTH_KV` namespace。

## 校验与部署

```bash
npm test
npm run typecheck
npm run cf-typegen
npm run build
```

首次部署前分别配置 secrets：

```bash
npx wrangler secret put AGENT_CREDENTIAL_ROOT_KEY_V1 --config wrangler.jsonc
npx wrangler secret put MANAGEMENT_SESSION_ROOT_KEY_V1 --config wrangler.jsonc

npx wrangler secret put AGENT_CREDENTIAL_ROOT_KEY_V1 --config wrangler.jsonc --env development
npx wrangler secret put MANAGEMENT_SESSION_ROOT_KEY_V1 --config wrangler.jsonc --env development
```

部署命令：

```bash
npm run deploy:development
npm run deploy
```

`AGENT_API_ENABLED` 在已验证的 production 与 `development` 环境中为 `true`。新增环境应先保持 `false`，完成测试账号验证后再开启。

## 接口入口

- `/api/*`：浏览器会话代理；登录成功时额外签发 12 小时以内的 `kzp_mgmt` 管理 Cookie。
- `/api/agent-credentials*`：绑定加密账号凭证及管理永久 Agent Token。
- `/agent-api/*`：Agent 全权限代理，使用 `X-Credential`，不会向 Agent 暴露用户名、密码或快准 Cookie。

完整接入、安全边界和故障语义见 [Agent 凭证网关文档](docs/api/agent-gateway.md)。
