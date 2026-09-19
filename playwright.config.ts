import { defineConfig, devices } from "@playwright/test";

/**
 * Testes E2E do assista-me.
 * Correr: npx playwright test
 * Com UI: npx playwright test --ui
 * Ver relatório: npx playwright show-report
 */

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["html", { open: "never" }], ["list"]],

  use: {
    baseURL: process.env.BASE_URL ?? "https://tickets.vrcf.info",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    locale: "pt-PT",
    timezoneId: "Europe/Lisbon",
  },

  projects: [
    // Setup — autenticação (cria ficheiros de sessão)
    {
      name: "setup-admin",
      testMatch: "**/auth.setup.ts",
    },

    // Testes que precisam de sessão admin
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/admin.json",
      },
      dependencies: ["setup-admin"],
    },

    // Testes mobile (PWA técnico e cliente)
    {
      name: "mobile",
      use: {
        ...devices["iPhone 14"],
        storageState: "e2e/.auth/admin.json",
      },
      dependencies: ["setup-admin"],
    },
  ],
});
