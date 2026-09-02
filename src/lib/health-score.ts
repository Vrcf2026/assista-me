/**
 * Health Score por cliente — 0 a 100 pontos.
 *
 * Calculado a partir de dados dos últimos 90 dias:
 *
 * COMPONENTES (total 100 pts):
 *  A) Frequência de tickets            (30 pts) — mais tickets = menos saúde
 *  B) Taxa de resolução                (25 pts) — % tickets resolvidos vs abertos
 *  C) Satisfação média                 (20 pts) — rating médio das avaliações
 *  D) Tempo médio de resposta do admin (15 pts) — rapidez no primeiro contacto
 *  E) Uso do contrato de horas         (10 pts) — saldo positivo = saudável
 *
 * NÍVEL:
 *  >= 80 → verde  "Saudável"
 *  >= 55 → âmbar  "Atenção"
 *   < 55 → vermelho "Em risco"
 */

export interface HealthInput {
  ticketsTotal: number;          // tickets criados nos últimos 90 dias
  ticketsFechados: number;       // tickets fechados nos últimos 90 dias
  ticketsAbertos: number;        // tickets ainda em aberto
  satisfacaoMedia: number | null; // 1–5 ou null se sem dados
  satisfacaoCount: number;
  tempoMedioRespostaMin: number | null; // minutos até primeira resposta do admin
  horasContratoMes: number | null;      // horas contratadas/mês (null = sem contrato)
  horasUsadasUlt30: number;            // horas registadas no último mês
}

export interface HealthScore {
  score: number;         // 0–100
  level: "saudavel" | "atencao" | "risco";
  label: string;
  color: string;         // Tailwind text color class
  bgColor: string;       // Tailwind bg color class
  borderColor: string;   // Tailwind border color class
  breakdown: {
    frequencia: number;   // 0–30
    resolucao: number;    // 0–25
    satisfacao: number;   // 0–20
    resposta: number;     // 0–15
    contrato: number;     // 0–10
  };
  insights: string[];    // frases curtas de diagnóstico
}

export function calcHealthScore(input: HealthInput): HealthScore {
  const insights: string[] = [];

  // ── A) Frequência de tickets (30 pts) ──────────────────────────────────
  // Referência: 0 tickets = 30 pts | 5 = 20 pts | 15 = 10 pts | 30+ = 0 pts
  let frequencia = 30;
  if (input.ticketsTotal >= 30) {
    frequencia = 0;
  } else if (input.ticketsTotal > 0) {
    frequencia = Math.max(0, Math.round(30 - input.ticketsTotal));
  }
  if (input.ticketsTotal >= 20) {
    insights.push(`Volume alto: ${input.ticketsTotal} tickets em 90 dias`);
  }

  // ── B) Taxa de resolução (25 pts) ──────────────────────────────────────
  let resolucao = 25;
  if (input.ticketsTotal > 0) {
    const taxa = input.ticketsFechados / input.ticketsTotal;
    resolucao = Math.round(taxa * 25);
  }
  if (input.ticketsAbertos > 5) {
    insights.push(`${input.ticketsAbertos} tickets em aberto`);
  }

  // ── C) Satisfação média (20 pts) ───────────────────────────────────────
  let satisfacao = 10; // neutro se sem dados
  if (input.satisfacaoMedia !== null && input.satisfacaoCount > 0) {
    // 1 estrela = 4 pts | 3 = 12 pts | 5 = 20 pts
    satisfacao = Math.round(((input.satisfacaoMedia - 1) / 4) * 20);
    if (input.satisfacaoMedia < 3) {
      insights.push(`Satisfação baixa: ${input.satisfacaoMedia.toFixed(1)}/5`);
    }
  }

  // ── D) Tempo médio de resposta (15 pts) ────────────────────────────────
  // < 30 min = 15 pts | 2h = 10 pts | 8h = 5 pts | > 24h = 0 pts
  let resposta = 10; // neutro se sem dados
  if (input.tempoMedioRespostaMin !== null) {
    const h = input.tempoMedioRespostaMin / 60;
    if (h <= 0.5) resposta = 15;
    else if (h <= 2) resposta = 12;
    else if (h <= 8) resposta = 8;
    else if (h <= 24) resposta = 4;
    else {
      resposta = 0;
      insights.push("Respostas lentas (> 24h em média)");
    }
  }

  // ── E) Uso do contrato de horas (10 pts) ───────────────────────────────
  let contrato = 5; // neutro se sem contrato
  if (input.horasContratoMes !== null && input.horasContratoMes > 0) {
    const saldo = input.horasContratoMes - input.horasUsadasUlt30;
    const pct = input.horasUsadasUlt30 / input.horasContratoMes;
    if (pct > 1.2) {
      contrato = 0;
      insights.push("Contrato de horas excedido");
    } else if (pct > 0.9) {
      contrato = 4;
      insights.push(`Contrato quase esgotado (${Math.round(saldo * 60)} min restantes)`);
    } else if (pct > 0.5) {
      contrato = 8;
    } else {
      contrato = 10;
    }
  }

  const score = Math.min(100, Math.max(0, frequencia + resolucao + satisfacao + resposta + contrato));

  let level: HealthScore["level"];
  let label: string;
  let color: string;
  let bgColor: string;
  let borderColor: string;

  if (score >= 80) {
    level = "saudavel";
    label = "Saudável";
    color = "text-emerald-600 dark:text-emerald-400";
    bgColor = "bg-emerald-500/10";
    borderColor = "border-emerald-500/30";
  } else if (score >= 55) {
    level = "atencao";
    label = "Atenção";
    color = "text-amber-600 dark:text-amber-400";
    bgColor = "bg-amber-500/10";
    borderColor = "border-amber-500/30";
  } else {
    level = "risco";
    label = "Em risco";
    color = "text-red-600 dark:text-red-400";
    bgColor = "bg-red-500/10";
    borderColor = "border-red-500/30";
  }

  if (insights.length === 0) {
    insights.push("Tudo dentro do esperado");
  }

  return {
    score,
    level,
    label,
    color,
    bgColor,
    borderColor,
    breakdown: { frequencia, resolucao, satisfacao, resposta, contrato },
    insights,
  };
}

export function levelEmoji(level: HealthScore["level"]): string {
  return level === "saudavel" ? "🟢" : level === "atencao" ? "🟡" : "🔴";
}
