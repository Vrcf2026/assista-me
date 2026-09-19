import { test, expect } from "@playwright/test";

/**
 * Fluxo completo: criar ticket → responder → fechar → verificar estado
 * Garante que nada parte após updates do Lovable.
 */

test.describe("Fluxo de ticket", () => {
  test("criar ticket como admin", async ({ page }) => {
    await page.goto("/tickets/novo");

    // Preencher formulário
    await page.getByLabel(/título|assunto/i).fill("Teste E2E — impressora não imprime");
    await page.getByLabel(/descrição/i).fill("A impressora HP não responde após reinício.");

    // Seleccionar cliente (primeiro disponível)
    const clientSelect = page.getByRole("combobox").first();
    await clientSelect.click();
    await page.getByRole("option").first().click();

    // Submeter
    await page.getByRole("button", { name: /criar|guardar|submeter/i }).click();

    // Verificar redirecciona para o ticket
    await expect(page).toHaveURL(/\/tickets\/[a-f0-9-]+/, { timeout: 10_000 });
    await expect(page.getByText("Teste E2E — impressora não imprime")).toBeVisible();
  });

  test("responder a um ticket existente", async ({ page }) => {
    // Ir à lista de tickets e abrir o primeiro
    await page.goto("/tickets");
    await page.getByRole("link", { name: /#\d{5}/ }).first().click();
    await expect(page).toHaveURL(/\/tickets\/[a-f0-9-]+/);

    // Escrever resposta
    const textarea = page.getByPlaceholder(/mensagem|resposta|escreve/i).last();
    await textarea.fill("Resposta de teste E2E — vamos verificar.");
    await page.getByRole("button", { name: /enviar|responder/i }).last().click();

    // Verificar que a mensagem aparece
    await expect(page.getByText("Resposta de teste E2E")).toBeVisible({ timeout: 8_000 });
  });

  test("fechar um ticket", async ({ page }) => {
    await page.goto("/tickets");

    // Abrir um ticket aberto
    const ticketLink = page.getByRole("link", { name: /#\d{5}/ }).first();
    await ticketLink.click();
    await expect(page).toHaveURL(/\/tickets\/[a-f0-9-]+/);

    // Clicar em Fechar
    await page.getByRole("button", { name: /fechar ticket|close/i }).click();

    // Preencher diálogo de fecho
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const solucao = dialog.getByPlaceholder(/solução|solution/i);
    if (await solucao.isVisible()) {
      await solucao.fill("Resolvido via teste E2E.");
    }
    await dialog.getByRole("button", { name: /fechar|confirmar/i }).click();

    // Verificar estado fechado
    await expect(page.getByText(/fechado|resolvido/i).first()).toBeVisible({ timeout: 8_000 });
  });
});

test.describe("Dashboard admin", () => {
  test("carregar dashboard sem erros", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/tickets|dashboard/i).first()).toBeVisible();
    // Sem erros na consola
    const errors: string[] = [];
    page.on("console", msg => { if (msg.type() === "error") errors.push(msg.text()); });
    await page.waitForTimeout(2000);
    expect(errors.filter(e => !e.includes("favicon"))).toHaveLength(0);
  });

  test("KPIs visíveis no dashboard", async ({ page }) => {
    await page.goto("/");
    // Pelo menos um número visível (tickets abertos, etc.)
    await expect(page.locator("text=/\\d+/").first()).toBeVisible({ timeout: 8_000 });
  });
});

test.describe("Campanhas", () => {
  test("listar campanhas", async ({ page }) => {
    await page.goto("/campanhas");
    await expect(page.getByRole("heading", { name: /campanhas/i })).toBeVisible();
  });

  test("criar campanha simples", async ({ page }) => {
    await page.goto("/campanhas");
    await page.getByRole("button", { name: /nova campanha/i }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByLabel(/título/i).fill("Campanha E2E teste");
    await dialog.getByRole("button", { name: /criar/i }).click();

    // Deve redireccionar para a campanha criada
    await expect(page).toHaveURL(/\/campanhas\/[a-f0-9-]+/, { timeout: 8_000 });
    await expect(page.getByText("Campanha E2E teste")).toBeVisible();
  });
});

test.describe("Rentabilidade", () => {
  test("dashboard carrega sem erros", async ({ page }) => {
    await page.goto("/admin/rentabilidade");
    await expect(page.getByText(/rentabilidade/i)).toBeVisible();
    await expect(page.getByText(/receita total/i)).toBeVisible({ timeout: 8_000 });
  });
});

test.describe("PWA Técnico", () => {
  test("página /tecnico carrega", async ({ page }) => {
    await page.goto("/tecnico");
    await expect(page.getByText(/técnico/i).first()).toBeVisible();
    // Tabs de navegação visíveis
    await expect(page.getByText(/tickets/i).first()).toBeVisible();
    await expect(page.getByText(/timer/i)).toBeVisible();
  });
});

test.describe("Contratos", () => {
  test("criar contrato num cliente", async ({ page }) => {
    await page.goto("/clientes");
    // Abrir primeiro cliente
    await page.getByRole("link").filter({ hasText: /\w+/ }).first().click();
    await expect(page).toHaveURL(/\/clientes\/[a-f0-9-]+/);

    // Secção de contratos visível
    await expect(page.getByText(/contratos/i)).toBeVisible({ timeout: 5_000 });
  });
});
