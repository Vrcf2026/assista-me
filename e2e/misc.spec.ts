import { test, expect } from "@playwright/test";

test.describe("Calendário", () => {
  test("calendário carrega com vistas", async ({ page }) => {
    await page.goto("/calendario");
    await expect(page.getByRole("heading", { name: /calendário/i })).toBeVisible();

    // Botões de vista
    await expect(page.getByRole("button", { name: /mês/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /semana/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /dia/i })).toBeVisible();

    // Trocar para vista semana
    await page.getByRole("button", { name: /semana/i }).click();
    await expect(page.getByText(/seg|ter|qua/i).first()).toBeVisible();
  });
});

test.describe("Incidentes críticos", () => {
  test("página de incidentes carrega", async ({ page }) => {
    await page.goto("/incidentes");
    await expect(page.getByRole("heading", { name: /incidentes/i })).toBeVisible();
    // Estado verde ou lista de incidentes
    const semIncidentes = page.getByText(/todos os sistemas operacionais/i);
    const listaIncidentes = page.getByText(/em curso/i);
    await expect(semIncidentes.or(listaIncidentes)).toBeVisible({ timeout: 8_000 });
  });
});

test.describe("Preventiva", () => {
  test("página de preventiva carrega", async ({ page }) => {
    await page.goto("/preventiva");
    await expect(page.getByText(/preventiva|manutenção/i).first()).toBeVisible();
  });
});

test.describe("Admin — Checklists", () => {
  test("página de templates de checklist carrega", async ({ page }) => {
    await page.goto("/admin/checklists");
    await expect(page.getByRole("heading", { name: /checklists/i })).toBeVisible();
  });

  test("criar template de checklist", async ({ page }) => {
    await page.goto("/admin/checklists");

    await page.getByLabel(/nome do template/i).fill("Template E2E teste");
    // Preencher primeiro item
    await page.getByPlaceholder(/item 1/i).first().fill("Verificar equipamento");
    await page.getByRole("button", { name: /criar template/i }).click();

    // Verificar que aparece na lista
    await expect(page.getByText("Template E2E teste")).toBeVisible({ timeout: 5_000 });
  });
});

test.describe("Faturação e orçamentos", () => {
  test("faturação carrega", async ({ page }) => {
    await page.goto("/admin/faturacao");
    await expect(page.getByText(/faturação|faturar/i).first()).toBeVisible();
  });

  test("orçamentos carregam", async ({ page }) => {
    await page.goto("/orcamentos");
    await expect(page.getByText(/orçamento/i).first()).toBeVisible();
  });
});

test.describe("Segurança — rotas protegidas", () => {
  test("dashboard admin não acessível sem sessão", async ({ browser }) => {
    // Contexto sem autenticação
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto("/admin/rentabilidade");
    // Deve redireccionar para login
    await expect(page).toHaveURL(/\/login/, { timeout: 8_000 });
    await context.close();
  });

  test("incidentes não acessíveis sem sessão", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto("/incidentes");
    await expect(page).toHaveURL(/\/login/, { timeout: 8_000 });
    await context.close();
  });
});
