import { Buffer } from 'node:buffer'
import { cloudflareTest } from '@cloudflare/vitest-pool-workers'
import { defineConfig } from 'vitest/config'

const testCredentialKey = Buffer.alloc(32, 17).toString('base64url')
const testManagementKey = Buffer.alloc(32, 23).toString('base64url')

process.env.AGENT_CREDENTIAL_ROOT_KEY_V1 ??= testCredentialKey
process.env.MANAGEMENT_SESSION_ROOT_KEY_V1 ??= testManagementKey

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: {
        kvNamespaces: ['AGENT_AUTH_KV'],
        bindings: {
          KZ_API_BASE: 'https://upstream.test/index.php',
          APP_ENV: 'test',
          AGENT_API_ENABLED: 'true',
          AGENT_CREDENTIAL_ROOT_KEY_V1: testCredentialKey,
          MANAGEMENT_SESSION_ROOT_KEY_V1: testManagementKey,
        },
      },
    }),
  ],
  test: {
    include: ['test/**/*.test.ts'],
  },
})
