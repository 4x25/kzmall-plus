# AGENTS.md

## Context

- **Target users**: 个人经营者 (individual business operators) who already use the 快准车服 enterprise backend. This project layers personal/personalized features on top of their existing APIs.
- **Phase 1**: login, product inventory & sales volume tracking (库存销量盘点).

## Stack & Entrypoints

- **Runtime**: Cloudflare Workers (Workerd), deployed via Wrangler.
- **Frontend**: React SPA with React Router + TailwindCSS v4. Entry is `src/app/main.tsx` → `index.html`.
- **API**: Hono v4 in `src/index.tsx` (default export). `/api/*` remains the browser Cookie proxy, while login/logout interception, Agent credential management and `/agent-api/*` now contain security logic in `src/server/`. The Worker injects `sun: 5516` for both proxy modes.
- **Dev server**: `vite` (not `wrangler dev`). The `@cloudflare/vite-plugin` runs the Worker inside Workerd during `npm run dev`.
- **SPA routing**: `wrangler.jsonc` sets `assets.not_found_handling: "single-page-application"` so client-side routes work on Cloudflare.
- **Worker entry**: `src/index.tsx` — this is both the Wrangler `main` and the Vite entry for the Cloudflare plugin. Only API routes should be added here. Static asset routing explicitly runs the Worker first for `/api/*` and `/agent-api/*`.

## Architecture

```
src/
  index.tsx              ← Hono routes/error boundary (Worker entry)
  server/
    crypto.ts            ← HKDF, AES-256-GCM, HMAC and opaque tokens
    cookies.ts           ← server-side upstream Cookie jar
    management-session.ts ← encrypted HttpOnly management session
    management.ts        ← Agent credential CRUD handlers
    proxy.ts             ← browser/Agent proxy and one-time replay
    store.ts             ← encrypted KV account/token/index records
    upstream.ts          ← bounded bodies, upstream login and auth classifier
    errors.ts            ← sanitized errors and structured logs
    types.ts             ← persisted record schemas and validation
  app/
    main.tsx             ← React SPA entry (mounted by index.html)
    App.tsx              ← Router + route definitions
    lib/auth.ts          ← cookie-based auth helpers (isLoggedIn/clearAuth)
    styles/index.css     ← Tailwind v4 entry (@import "tailwindcss")
    layouts/
      AdminLayout.tsx    ← Sidebar + main content, responsive (mobile drawer)
    components/
      Sidebar.tsx        ← Navigation menu + logo
    pages/
      login.tsx          ← Login page
      dashboard.tsx      ← Dashboard overview
      inventory.tsx      ← Inventory & sales tracking
      agent-credentials.tsx ← Agent account/token management
```

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Dev server (Vite + Cloudflare Workerd) |
| `npm run build` | Production build |
| `npm run typecheck` | TypeScript check without output |
| `npm test` | Workerd/Vitest test suite |
| `npm run test:watch` | Watch tests |
| `npm run preview` | Build + local preview |
| `npm run deploy` | Build + deploy to Cloudflare |
| `npm run deploy:development` | Build + deploy isolated development Worker/KV |
| `npm run cf-typegen` | Generate `CloudflareBindings` type from `wrangler.jsonc` |

No lint or format command exists yet. Tests run inside Workerd through `@cloudflare/vitest-pool-workers`.

## Cloudflare Bindings

- After adding bindings (D1, KV, R2, env vars, etc.) to `wrangler.jsonc`, run `npm run cf-typegen` to update the `CloudflareBindings` type.
- Pass the generated type to Hono: `new Hono<{ Bindings: CloudflareBindings }>()`.
- Current vars: `KZ_API_BASE`, `APP_ENV`, and `AGENT_API_ENABLED`.
- KV binding: `AGENT_AUTH_KV`. Top-level production and `development` environments auto-provision separate namespaces; local Vite/Workerd data is local-only.
- Required Worker Secrets: `AGENT_CREDENTIAL_ROOT_KEY_V1` and `MANAGEMENT_SESSION_ROOT_KEY_V1`. Each is a distinct 32-byte base64url value. Never commit either value.
- `AGENT_API_ENABLED` is enabled for the validated production and `development` deployments. New environments must start at `false` until test-account validation is complete.

## Key Conventions

- **No SSR**: This is a pure SPA. All pages render client-side via React Router. Hono only serves API routes.
- **TailwindCSS v4 + daisyUI v5**: Uses `@import "tailwindcss"` (not `@tailwind` directives). Existing theme variables are defined via `@theme {}`; daisyUI components use the `kz-` prefix and the `kzmall` theme.
- **Static assets** go in `public/`.
- **Browser auth**: `AdminLayout` checks `isLoggedIn()` from `src/app/lib/auth.ts` (reads cookie `token`) and redirects to `/login` if false. Successful login also receives encrypted `kzp_mgmt` (`HttpOnly; Secure; SameSite=Strict`); old sessions must log in again before managing Agent credentials.
- **Agent auth**: Agent callers use `X-Credential: kza_v1_<opaque-token>` only at `/agent-api/*`. Never accept a username, password, Cookie or Authorization header from an Agent caller.
- **Credential secrecy**: Do not log usernames, passwords, Cookie values, Agent tokens/token hashes, request headers/bodies/query strings, business responses or raw decryption errors.

## 快准车服 Backend

- This project calls 快准车服 enterprise APIs for data. Phase 1 needs auth/login against those APIs, plus inventory/sales endpoints.
- Browser login flow: frontend `POST /api/passport/login/signIn` → Worker proxies to 快准车服 → Worker strips `domain=` from upstream cookies and, after a proven successful login, adds `kzp_mgmt` → the browser carries its fast-session Cookie through `/api/*`.
- Agent flow: `/agent-api/*` hashes the opaque token, decrypts the matching KV records, attaches the server-side Cookie jar and forwards with `redirect: "manual"`. Missing/near-expiry or explicitly invalid sessions trigger a fresh upstream login. The original request, including writes, is replayed at most once.
- Agent requests are limited to 4 MiB so their bytes can be replayed. Upstream responses remain streamed after a bounded 64 KiB authentication inspection.
- `/passport/login/signIn`, `/passport/login/signOut`, path traversal/cross-origin-shaped paths, `CONNECT`, and `TRACE` are forbidden through `/agent-api/*`.
- Agent tokens are permanent and full-permission until revoked/rotated or the account credential is deleted. Browser logout does not revoke them. KV propagation can take about 60 seconds; write replay can duplicate a successful operation.
- `KZ_API_BASE` is a wrangler var (default `https://dgj8.kzmall.cc/index.php`), overridable via `.dev.vars` or Cloudflare dashboard.
