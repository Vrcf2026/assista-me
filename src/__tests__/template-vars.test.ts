import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { resolveTemplateVars, TEMPLATE_VARS } from "@/lib/template-vars";

describe("resolveTemplateVars", () => {
  // Fixar data para testes determinísticos
  const fixedDate = new Date("2026-09-02T10:30:00Z");

  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(fixedDate);
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  it("resolve {{nome_cliente}}", () => {
    const result = resolveTemplateVars("Olá {{nome_cliente}},", {
      nome_cliente: "Bombeiros de Montijo",
    });
    expect(result).toBe("Olá Bombeiros de Montijo,");
  });

  it("resolve {{numero_ticket}} com padding a 5 dígitos", () => {
    const result = resolveTemplateVars("Ticket {{numero_ticket}}", {
      numero_ticket: 42,
    });
    expect(result).toBe("Ticket #00042");
  });

  it("resolve {{titulo_ticket}}", () => {
    const result = resolveTemplateVars("Re: {{titulo_ticket}}", {
      titulo_ticket: "Impressora não funciona",
    });
    expect(result).toBe("Re: Impressora não funciona");
  });

  it("resolve {{data_hoje}} automaticamente (sem contexto)", () => {
    const result = resolveTemplateVars("Data: {{data_hoje}}", {});
    // Deve conter uma data no formato pt-PT (ex: "02/09/2026")
    expect(result).toMatch(/Data: \d{2}\/\d{2}\/\d{4}/);
  });

  it("resolve {{hora_atual}} automaticamente", () => {
    const result = resolveTemplateVars("Hora: {{hora_atual}}", {});
    expect(result).toMatch(/Hora: \d{2}:\d{2}/);
  });

  it("mantém variáveis não reconhecidas intactas", () => {
    const result = resolveTemplateVars("{{variavel_inexistente}}", {});
    expect(result).toBe("{{variavel_inexistente}}");
  });

  it("resolve múltiplas variáveis no mesmo texto", () => {
    const result = resolveTemplateVars(
      "Olá {{nome_cliente}}, o ticket {{numero_ticket}} foi recebido.",
      { nome_cliente: "ACME Lda", numero_ticket: 123 },
    );
    expect(result).toBe("Olá ACME Lda, o ticket #00123 foi recebido.");
  });

  it("quando nome_cliente é undefined, mantém placeholder", () => {
    const result = resolveTemplateVars("Olá {{nome_cliente}},", {});
    expect(result).toBe("Olá {{nome_cliente}},");
  });

  it("texto sem variáveis fica inalterado", () => {
    const text = "Mensagem sem variáveis.";
    const result = resolveTemplateVars(text, { nome_cliente: "Teste" });
    expect(result).toBe(text);
  });

  it("texto vazio retorna string vazia", () => {
    expect(resolveTemplateVars("", {})).toBe("");
  });

  it("resolve variáveis repetidas corretamente", () => {
    const result = resolveTemplateVars(
      "{{nome_cliente}} — {{nome_cliente}}",
      { nome_cliente: "VRCF" },
    );
    expect(result).toBe("VRCF — VRCF");
  });
});

describe("TEMPLATE_VARS", () => {
  it("contém pelo menos 6 variáveis", () => {
    expect(TEMPLATE_VARS.length).toBeGreaterThanOrEqual(6);
  });

  it("cada variável tem key, label e exemplo", () => {
    for (const v of TEMPLATE_VARS) {
      expect(v.key).toBeTruthy();
      expect(v.label).toBeTruthy();
      expect(v.exemplo).toBeTruthy();
    }
  });

  it("keys são únicos", () => {
    const keys = TEMPLATE_VARS.map((v) => v.key);
    const unique = new Set(keys);
    expect(unique.size).toBe(keys.length);
  });

  it("inclui as variáveis essenciais", () => {
    const keys = TEMPLATE_VARS.map((v) => v.key);
    expect(keys).toContain("nome_cliente");
    expect(keys).toContain("numero_ticket");
    expect(keys).toContain("titulo_ticket");
    expect(keys).toContain("data_hoje");
  });
});
