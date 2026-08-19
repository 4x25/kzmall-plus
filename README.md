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

- `/api/*`：统一代理入口。无 `X-Credential` 时使用浏览器 Cookie；有该请求头时使用 Agent Token 和服务端 Cookie jar。网页登录成功时还会签发 `kzp_mgmt` 管理 Cookie，并自动加密保存 Agent 所需的账号凭证。
- `/api/agent-credentials*`：管理当前登录账号的永久 Agent Token。

Agent 与网页复用完全相同的 `/api/<快准接口路径>`；Agent 只需额外携带 `X-Credential`，不会获得用户名、密码或快准 Cookie。

完整接入、安全边界和故障语义见 [项目 API 文档](docs/project-api/README.md)。
