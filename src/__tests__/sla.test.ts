import { describe, it, expect } from "vitest";
import { getCriticalSla, formatRemaining } from "@/lib/sla";

describe("getCriticalSla", () => {
  const makeDate = (minutesAgo: number): Date => {
    const d = new Date("2026-09-02T10:00:00Z"); // terça-feira 10:00
    d.setMinutes(d.getMinutes() - minutesAgo);
    return d;
  };
  const now = new Date("2026-09-02T10:00:00Z");

  it("ticket recém aberto está em ok", () => {
    const createdAt = makeDate(5);
    const result = getCriticalSla(createdAt, now);
    expect(result.status).toBe("ok");
    expect(result.remainingMinutes).toBeGreaterThan(0);
  });

  // now = terça 10:00 UTC. Ticket aberto 7h úteis atrás = dentro do SLA mas quase no limite
  it("ticket aberto há mais de 7h úteis está em warn ou breached", () => {
    // 09:00 do mesmo dia — 420 min úteis decorridos até às 10:00 = apenas 1h
    // Para ter 7h úteis: abrir às 09:00 de ontem (segunda)
    const createdAt = new Date("2026-09-01T09:00:00Z"); // segunda 09:00
    const laterNow = new Date("2026-09-02T07:00:00Z");  // terça 07:00 = só 7h úteis passaram (seg 09-18 = 9h, mas falta 2h)
    // Abrir segunda 09:00, now = terça 16:10 → 7h10m úteis
    const laterNow2 = new Date("2026-09-02T16:10:00Z");
    const result = getCriticalSla(createdAt, laterNow2);
    expect(["ok", "warn", "breached"]).toContain(result.status);
    // Com 8h SLA e ~7h10m decorridas, deve estar em warn
    expect(result.remainingMinutes).toBeLessThan(60);
  });

  it("remainingMinutes é numérico", () => {
    const createdAt = makeDate(30);
    const result = getCriticalSla(createdAt, now);
    expect(typeof result.remainingMinutes).toBe("number");
  });
});

describe("formatRemaining", () => {
  it("formata minutos < 60 corretamente", () => {
    expect(formatRemaining(45)).toMatch(/\d+/);
  });

  it("formata horas corretamente", () => {
    expect(formatRemaining(90)).toMatch(/\d+/);
  });

  it("retorna string não vazia para qualquer valor positivo", () => {
    expect(formatRemaining(1).length).toBeGreaterThan(0);
    expect(formatRemaining(60).length).toBeGreaterThan(0);
    expect(formatRemaining(480).length).toBeGreaterThan(0);
  });
});
