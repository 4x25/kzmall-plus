# AGENTS.md

## Context

- **Target users**: 个人经营者 (individual business operators) who already use the 快准车服 enterprise backend. This project layers personal/personalized features on top of their existing APIs.
- **Phase 1**: login, product inventory & sales volume tracking (库存销量盘点).

## Stack & Entrypoints

- **Runtime**: Cloudflare Workers (Workerd), deployed via Wrangler.
- **Frontend**: React SPA with React Router + TailwindCSS v4. Entry is `src/app/main.tsx` → `index.html`.
- **API**: Hono v4 in `src/index.tsx` (default export). API routes live under `/api/*`. No SSR.
- **Dev server**: `vite` (not `wrangler dev`). The `@cloudflare/vite-plugin` runs the Worker inside Workerd during `npm run dev`.
- **SPA routing**: `wrangler.jsonc` sets `assets.not_found_handling: "single-page-application"` so client-side routes work on Cloudflare.
- **Worker entry**: `src/index.tsx` — this is both the Wrangler `main` and the Vite entry for the Cloudflare plugin. Only API routes should be added here.

## Architecture

```
src/
  index.tsx              ← Hono API (Worker entry, default export)
  app/
    main.tsx             ← React SPA entry (mounted by index.html)
    App.tsx              ← Router + route definitions
    lib/auth.ts          ← localStorage auth helpers (isLoggedIn/setLoggedIn/clearAuth)
    styles/index.css     ← Tailwind v4 entry (@import "tailwindcss")
    layouts/
      AdminLayout.tsx    ← Sidebar + main content, responsive (mobile drawer)
    components/
      Sidebar.tsx        ← Navigation menu + logo
    pages/
      login.tsx          ← Login page
      dashboard.tsx      ← Dashboard overview
      inventory.tsx      ← Inventory & sales tracking
```

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Dev server (Vite + Cloudflare Workerd) |
| `npm run build` | Production build |
| `npm run preview` | Build + local preview |
| `npm run deploy` | Build + deploy to Cloudflare |
| `npm run cf-typegen` | Generate `CloudflareBindings` type from `wrangler.jsonc` |

**No lint, format, or test commands exist yet.** Set up (e.g. ESLint, Prettier/Biome, Vitest) before running CI.

## Cloudflare Bindings

- After adding bindings (D1, KV, R2, env vars, etc.) to `wrangler.jsonc`, run `npm run cf-typegen` to update the `CloudflareBindings` type.
- Pass the generated type to Hono: `new Hono<{ Bindings: CloudflareBindings }>()`.
- Current vars: `KZ_API_BASE` (快准车服 API base URL).

## Key Conventions

- **No SSR**: This is a pure SPA. All pages render client-side via React Router. Hono only serves API routes.
- **TailwindCSS v4**: Uses `@import "tailwindcss"` (not `@tailwind` directives). Theme variables defined via `@theme {}` in `src/app/styles/index.css`.
- **Static assets** go in `public/`.
- **Auth**: `AdminLayout` checks `isLoggedIn()` from `src/app/lib/auth.ts` (reads cookie `token`) and redirects to `/login` if false. Logout clears the `token` cookie via `clearAuth()`.
- **Mobile sidebar**: Controlled via `sidebarOpen` state in `AdminLayout`, with overlay backdrop. Click a nav link closes it via `onClose` prop.

## 快准车服 Backend

- This project calls 快准车服 enterprise APIs for data. Phase 1 needs auth/login against those APIs, plus inventory/sales endpoints.
- Login flow: frontend `POST /api/login` → Worker proxies to 快准车服 `POST /index.php/passport/login/signIn` → Worker strips `domain=` from set-cookie headers and forwards them to browser → browser stores cookies under our domain → subsequent API calls carry these cookies back to Worker, which forwards them to 快准车服.
- `sun` header value (`5516`) is hardcoded in the Worker, not configurable via env var.
- `KZ_API_BASE` is a wrangler var (default `https://dgj8.kzmall.cc`), overridable via `.dev.vars` or Cloudflare dashboard.