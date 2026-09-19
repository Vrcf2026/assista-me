import { test as setup, expect } from "@playwright/test";
import path from "path";

/**
 * Setup: autentica como admin e guarda a sessão em e2e/.auth/admin.json
 * Corre antes de todos os outros testes.
 *
 * Variáveis de ambiente necessárias:
 *   E2E_ADMIN_EMAIL=vrcf.loja@gmail.com
 *   E2E_ADMIN_PASSWORD=...
 */

const AUTH_FILE = path.join(__dirname, ".auth/admin.json");

setup("autenticar como admin", async ({ page }) => {
  const email = process.env.E2E_ADMIN_EMAIL;
  const password = process.env.E2E_ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "Define E2E_ADMIN_EMAIL e E2E_ADMIN_PASSWORD nas variáveis de ambiente antes de correr os testes E2E."
    );
  }

  await page.goto("/login");

  // Preencher formulário de login
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password|palavra-passe/i).fill(password);
  await page.getByRole("button", { name: /entrar|login|sign in/i }).click();

  // Aguardar redireccionar para dashboard
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
  await expect(page.getByText(/dashboard|tickets/i).first()).toBeVisible();

  // Guardar sessão
  await page.context().storageState({ path: AUTH_FILE });
});
