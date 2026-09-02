import { describe, it, expect } from "vitest";
import { calcHealthScore, type HealthInput } from "@/lib/health-score";

const baseInput: HealthInput = {
  ticketsTotal: 0,
  ticketsFechados: 0,
  ticketsAbertos: 0,
  satisfacaoMedia: null,
  satisfacaoCount: 0,
  tempoMedioRespostaMin: null,
  horasContratoMes: null,
  horasUsadasUlt30: 0,
};

describe("calcHealthScore", () => {
  describe("cliente sem actividade (0 tickets)", () => {
    it("deve retornar score alto (>=80) e nível saudável", () => {
      const result = calcHealthScore(baseInput);
      expect(result.score).toBeGreaterThanOrEqual(80);
      expect(result.level).toBe("saudavel");
    });
  });

  describe("componente A — frequência de tickets", () => {
    it("0 tickets = 30 pontos de frequência", () => {
      const r = calcHealthScore({ ...baseInput, ticketsTotal: 0 });
      expect(r.breakdown.frequencia).toBe(30);
    });

    it("30+ tickets = 0 pontos de frequência", () => {
      const r = calcHealthScore({ ...baseInput, ticketsTotal: 30 });
      expect(r.breakdown.frequencia).toBe(0);
    });

    it("15 tickets = 15 pontos de frequência", () => {
      const r = calcHealthScore({ ...baseInput, ticketsTotal: 15 });
      expect(r.breakdown.frequencia).toBe(15);
    });

    it("volume alto (>=20) gera insight", () => {
      const r = calcHealthScore({ ...baseInput, ticketsTotal: 20 });
      expect(r.insights.some((i) => i.includes("Volume alto"))).toBe(true);
    });
  });

  describe("componente B — taxa de resolução", () => {
    it("100% resolvidos = 25 pontos", () => {
      const r = calcHealthScore({
        ...baseInput, ticketsTotal: 10, ticketsFechados: 10,
      });
      expect(r.breakdown.resolucao).toBe(25);
    });

    it("0% resolvidos = 0 pontos", () => {
      const r = calcHealthScore({
        ...baseInput, ticketsTotal: 10, ticketsFechados: 0, ticketsAbertos: 10,
      });
      expect(r.breakdown.resolucao).toBe(0);
    });

    it("50% resolvidos = ~12-13 pontos", () => {
      const r = calcHealthScore({
        ...baseInput, ticketsTotal: 10, ticketsFechados: 5, ticketsAbertos: 5,
      });
      expect(r.breakdown.resolucao).toBeGreaterThanOrEqual(12);
      expect(r.breakdown.resolucao).toBeLessThanOrEqual(13);
    });

    it(">5 tickets em aberto gera insight", () => {
      const r = calcHealthScore({
        ...baseInput, ticketsTotal: 10, ticketsAbertos: 6,
      });
      expect(r.insights.some((i) => i.includes("tickets em aberto"))).toBe(true);
    });
  });

  describe("componente C — satisfação", () => {
    it("sem dados = 10 pontos (neutro)", () => {
      const r = calcHealthScore({ ...baseInput, satisfacaoMedia: null });
      expect(r.breakdown.satisfacao).toBe(10);
    });

    it("5 estrelas = 20 pontos", () => {
      const r = calcHealthScore({
        ...baseInput, satisfacaoMedia: 5, satisfacaoCount: 10,
      });
      expect(r.breakdown.satisfacao).toBe(20);
    });

    it("1 estrela = 0 pontos", () => {
      const r = calcHealthScore({
        ...baseInput, satisfacaoMedia: 1, satisfacaoCount: 5,
      });
      expect(r.breakdown.satisfacao).toBe(0);
    });

    it("satisfação < 3 gera insight", () => {
      const r = calcHealthScore({
        ...baseInput, satisfacaoMedia: 2.5, satisfacaoCount: 3,
      });
      expect(r.insights.some((i) => i.includes("Satisfação baixa"))).toBe(true);
    });
  });

  describe("componente D — tempo de resposta", () => {
    it("sem dados = 10 pontos (neutro)", () => {
      const r = calcHealthScore({ ...baseInput, tempoMedioRespostaMin: null });
      expect(r.breakdown.resposta).toBe(10);
    });

    it("<= 30 min = 15 pontos", () => {
      const r = calcHealthScore({ ...baseInput, tempoMedioRespostaMin: 20 });
      expect(r.breakdown.resposta).toBe(15);
    });

    it("> 24h = 0 pontos e insight", () => {
      const r = calcHealthScore({ ...baseInput, tempoMedioRespostaMin: 1500 }); // 25h
      expect(r.breakdown.resposta).toBe(0);
      expect(r.insights.some((i) => i.includes("lentas"))).toBe(true);
    });
  });

  describe("componente E — contrato de horas", () => {
    it("sem contrato = 5 pontos (neutro)", () => {
      const r = calcHealthScore({ ...baseInput, horasContratoMes: null });
      expect(r.breakdown.contrato).toBe(5);
    });

    it("50% usado = 8 ou 10 pontos (depende do limiar exacto)", () => {
      const r = calcHealthScore({
        ...baseInput, horasContratoMes: 10, horasUsadasUlt30: 5,
      });
      // pct = 0.5, que não é > 0.5, logo cai no else → 10 pts
      expect(r.breakdown.contrato).toBeGreaterThanOrEqual(8);
      expect(r.breakdown.contrato).toBeLessThanOrEqual(10);
    });

    it("60% usado = 8 pontos", () => {
      const r = calcHealthScore({
        ...baseInput, horasContratoMes: 10, horasUsadasUlt30: 6,
      });
      expect(r.breakdown.contrato).toBe(8);
    });

    it("excedido (>120%) = 0 pontos e insight", () => {
      const r = calcHealthScore({
        ...baseInput, horasContratoMes: 10, horasUsadasUlt30: 13,
      });
      expect(r.breakdown.contrato).toBe(0);
      expect(r.insights.some((i) => i.includes("excedido"))).toBe(true);
    });
  });

  describe("níveis de classificação", () => {
    it("score >= 80 → saudavel", () => {
      const r = calcHealthScore(baseInput);
      expect(r.score).toBeGreaterThanOrEqual(80);
      expect(r.level).toBe("saudavel");
      expect(r.label).toBe("Saudável");
    });

    it("score em risco com muitos problemas combinados", () => {
      const r = calcHealthScore({
        ticketsTotal: 30,
        ticketsFechados: 0,
        ticketsAbertos: 30,
        satisfacaoMedia: 1,
        satisfacaoCount: 5,
        tempoMedioRespostaMin: 1500,
        horasContratoMes: 10,
        horasUsadasUlt30: 15,
      });
      expect(r.score).toBeLessThan(55);
      expect(r.level).toBe("risco");
    });

    it("score nunca ultrapassa 100", () => {
      const r = calcHealthScore(baseInput);
      expect(r.score).toBeLessThanOrEqual(100);
    });

    it("score nunca é negativo", () => {
      const r = calcHealthScore({
        ticketsTotal: 50, ticketsFechados: 0, ticketsAbertos: 50,
        satisfacaoMedia: 1, satisfacaoCount: 10,
        tempoMedioRespostaMin: 9999,
        horasContratoMes: 5, horasUsadasUlt30: 100,
      });
      expect(r.score).toBeGreaterThanOrEqual(0);
    });
  });

  describe("insights", () => {
    it("sempre tem pelo menos um insight", () => {
      const r = calcHealthScore(baseInput);
      expect(r.insights.length).toBeGreaterThan(0);
    });

    it("cliente saudável tem 'Tudo dentro do esperado'", () => {
      const r = calcHealthScore(baseInput);
      expect(r.insights).toContain("Tudo dentro do esperado");
    });
  });
});
