// SLA com horas úteis (Lisboa): seg-sex, 09h-18h.
// Tickets críticos têm SLA de 8 horas úteis.
// Se aberto fora de horário, contagem inicia no próximo dia útil às 09h00.

export const BUSINESS_START_HOUR = 9;
export const BUSINESS_END_HOUR = 18;
export const BUSINESS_HOURS_PER_DAY = BUSINESS_END_HOUR - BUSINESS_START_HOUR; // 9
export const CRITICAL_SLA_HOURS = 8;

const DAY_MS = 24 * 60 * 60 * 1000;

function isWeekend(d: Date): boolean {
  const day = d.getDay();
  return day === 0 || day === 6;
}

/**
 * Devolve o início do próximo período útil a partir de `from`.
 * Se já estiver dentro de horas úteis, devolve `from` inalterado.
 */
export function nextBusinessStart(from: Date): Date {
  const d = new Date(from);
  // Se sábado/domingo ou antes das 09h, mover para 09h00 do próximo dia útil
  // Se depois das 18h, mover para 09h00 do dia útil seguinte
  while (true) {
    if (isWeekend(d)) {
      d.setDate(d.getDate() + 1);
      d.setHours(BUSINESS_START_HOUR, 0, 0, 0);
      continue;
    }
    const h = d.getHours() + d.getMinutes() / 60;
    if (h < BUSINESS_START_HOUR) {
      d.setHours(BUSINESS_START_HOUR, 0, 0, 0);
      return d;
    }
    if (h >= BUSINESS_END_HOUR) {
      d.setDate(d.getDate() + 1);
      d.setHours(BUSINESS_START_HOUR, 0, 0, 0);
      continue;
    }
    return d;
  }
}

/**
 * Soma `hours` horas úteis a partir de `start`.
 * `start` é primeiro normalizado para o próximo período útil.
 */
export function addBusinessHours(start: Date, hours: number): Date {
  let remainingMs = hours * 60 * 60 * 1000;
  let cursor = nextBusinessStart(start);
  while (remainingMs > 0) {
    const endOfDay = new Date(cursor);
    endOfDay.setHours(BUSINESS_END_HOUR, 0, 0, 0);
    const availableMs = endOfDay.getTime() - cursor.getTime();
    if (remainingMs <= availableMs) {
      return new Date(cursor.getTime() + remainingMs);
    }
    remainingMs -= availableMs;
    // saltar para o próximo dia útil às 09h
    const next = new Date(cursor);
    next.setDate(next.getDate() + 1);
    next.setHours(BUSINESS_START_HOUR, 0, 0, 0);
    cursor = nextBusinessStart(next);
  }
  return cursor;
}

/**
 * Calcula minutos úteis decorridos entre `start` e `now`.
 */
export function businessMinutesBetween(start: Date, now: Date): number {
  if (now <= start) return 0;
  let cursor = nextBusinessStart(start);
  if (cursor >= now) return 0;
  let totalMs = 0;
  while (cursor < now) {
    const endOfDay = new Date(cursor);
    endOfDay.setHours(BUSINESS_END_HOUR, 0, 0, 0);
    const segmentEnd = now < endOfDay ? now : endOfDay;
    totalMs += Math.max(0, segmentEnd.getTime() - cursor.getTime());
    if (segmentEnd >= now) break;
    const next = new Date(cursor);
    next.setDate(next.getDate() + 1);
    next.setHours(BUSINESS_START_HOUR, 0, 0, 0);
    cursor = nextBusinessStart(next);
  }
  return Math.floor(totalMs / 60000);
}

export interface SlaInfo {
  /** Tempo total do SLA, em minutos úteis. */
  totalMinutes: number;
  /** Minutos úteis já decorridos desde a abertura. */
  elapsedMinutes: number;
  /** Minutos úteis restantes (negativos = atrasado). */
  remainingMinutes: number;
  /** Data/hora prevista de vencimento. */
  dueAt: Date;
  /** 'ok' (>2h restantes), 'warn' (<=2h), 'breached' (vencido). */
  status: "ok" | "warn" | "breached";
}

export function getCriticalSla(openedAt: Date, now: Date = new Date()): SlaInfo {
  const totalMinutes = CRITICAL_SLA_HOURS * 60;
  const dueAt = addBusinessHours(openedAt, CRITICAL_SLA_HOURS);
  const elapsedMinutes = businessMinutesBetween(openedAt, now);
  const remainingMinutes = totalMinutes - elapsedMinutes;
  let status: SlaInfo["status"] = "ok";
  if (remainingMinutes <= 0) status = "breached";
  else if (remainingMinutes <= 120) status = "warn";
  return { totalMinutes, elapsedMinutes, remainingMinutes, dueAt, status };
}

export function formatRemaining(minutes: number): string {
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  const sign = minutes < 0 ? "-" : "";
  if (h === 0) return `${sign}${m}m`;
  return `${sign}${h}h${m > 0 ? ` ${m}m` : ""}`;
}
