import { defineConfig, devices } from '@playwright/test'
import { APP_PORT, APP_URL, FAKE_SERVICES_PORT, localSupabase } from './e2e/support/env'

// End-to-end tests run a production build against a local Supabase in Docker
// (`npm run e2e:db:start`) and a fake Anthropic API. See e2e/README.md.
const supabase = localSupabase()

export default defineConfig({
  testDir: './e2e',
  // Safe because every test gets its own user and household (e2e/support/fixtures.ts).
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: APP_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'] },
      grepInvert: /@mobile/,
    },
    {
      // Phone layouts (the planner's agenda and edit list). Tag a test `@mobile` to run it here instead.
      name: 'mobile',
      use: { ...devices['Pixel 7'] },
      grep: /@mobile/,
    },
  ],
  webServer: [
    {
      command: 'node e2e/support/fake-services.ts',
      url: `http://localhost:${FAKE_SERVICES_PORT}`,
      env: { PORT: String(FAKE_SERVICES_PORT) },
      reuseExistingServer: !process.env.CI,
    },
    {
      // Next 16 keeps `next dev` output in .next/dev, so this build doesn't disturb a running dev server.
      command: `npm run build && npm run start -- -p ${APP_PORT}`,
      url: APP_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 300_000,
      env: {
        // Every variable the app reads is set here, because `next build` and
        // `next start` also load .env.local — which points at staging.
        NEXT_PUBLIC_SUPABASE_URL: supabase.url,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: supabase.anonKey,
        SUPABASE_SERVICE_ROLE_KEY: supabase.serviceRoleKey,
        NEXT_PUBLIC_SITE_URL: APP_URL,
        ANTHROPIC_API_KEY: 'e2e-fake-key',
        ANTHROPIC_BASE_URL: `http://localhost:${FAKE_SERVICES_PORT}`,
        RECIPE_IMPORT_USE_AI: 'true',
        TAG_SUGGEST_USE_AI: 'true',
        NEXT_PUBLIC_POSTHOG_KEY: '',
        NEXT_PUBLIC_POSTHOG_HOST: '',
        ADMIN_EMAIL: 'e2e-admin@test.local',
        BIRTHDAY_USER: '',
        BIRTHDAY_DATE: '',
        BIRTHDAY_MESSAGE: '',
        NEXT_TELEMETRY_DISABLED: '1',
      },
    },
  ],
})
