// Hook de timer automático por ticket.
// – Arranca ao montar (quando o admin abre o ticket)
// – Pausa se o utilizador ficar inativo mais de IDLE_TIMEOUT_MS
// – Persiste o estado em localStorage para sobreviver a reloads
// – Expõe: elapsed (seg), isRunning, pause, resume, save(desc), discard

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const IDLE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutos sem atividade → pausa
const STORAGE_KEY = (ticketId: string) => `ticket-timer:${ticketId}`;

interface StoredTimer {
  startedAt: number;   // timestamp ms quando o segmento atual começou
  accumulated: number; // segundos acumulados antes do segmento atual
  paused: boolean;
}

function readStore(ticketId: string): StoredTimer | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY(ticketId));
    return raw ? (JSON.parse(raw) as StoredTimer) : null;
  } catch {
    return null;
  }
}

function writeStore(ticketId: string, data: StoredTimer) {
  try {
    localStorage.setItem(STORAGE_KEY(ticketId), JSON.stringify(data));
  } catch {
    // quota exceeded — ignorar
  }
}

function clearStore(ticketId: string) {
  try {
    localStorage.removeItem(STORAGE_KEY(ticketId));
  } catch {
    // ignorar
  }
}

export function useTicketTimer(
  ticketId: string,
  tipoIntervencao: string,
  isAdmin: boolean,
) {
  const [elapsed, setElapsed] = useState(0); // segundos totais
  const [isRunning, setIsRunning] = useState(false);
  const [saving, setSaving] = useState(false);

  const storeRef = useRef<StoredTimer>({ startedAt: 0, accumulated: 0, paused: true });
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Inicializar a partir do localStorage ──────────────────────────────────
  useEffect(() => {
    if (!isAdmin) return;

    const stored = readStore(ticketId);
    if (stored) {
      storeRef.current = stored;
      if (!stored.paused) {
        const secSinceStart = Math.floor((Date.now() - stored.startedAt) / 1000);
        const total = stored.accumulated + secSinceStart;
        setElapsed(total);
        setIsRunning(true);
      } else {
        setElapsed(stored.accumulated);
        setIsRunning(false);
      }
    } else {
      // Primeira abertura: arrancar automaticamente
      const now = Date.now();
      const fresh: StoredTimer = { startedAt: now, accumulated: 0, paused: false };
      storeRef.current = fresh;
      writeStore(ticketId, fresh);
      setElapsed(0);
      setIsRunning(true);
    }

    return () => {
      // Ao desmontar: pausar e persistir
      const s = storeRef.current;
      if (!s.paused) {
        const secSinceStart = Math.floor((Date.now() - s.startedAt) / 1000);
        const updated: StoredTimer = {
          startedAt: 0,
          accumulated: s.accumulated + secSinceStart,
          paused: true,
        };
        storeRef.current = updated;
        writeStore(ticketId, updated);
      }
    };
  }, [ticketId, isAdmin]);

  // ── Tick a cada segundo ───────────────────────────────────────────────────
  useEffect(() => {
    if (!isAdmin) return;
    if (isRunning) {
      tickRef.current = setInterval(() => {
        const s = storeRef.current;
        const secSinceStart = Math.floor((Date.now() - s.startedAt) / 1000);
        setElapsed(s.accumulated + secSinceStart);
      }, 1000);
    }
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [isRunning, isAdmin]);

  // ── Deteção de inatividade ────────────────────────────────────────────────
  const resetIdleTimer = useCallback(() => {
    if (!isAdmin) return;
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      // Pausar por inatividade
      const s = storeRef.current;
      if (!s.paused) {
        const secSinceStart = Math.floor((Date.now() - s.startedAt) / 1000);
        const updated: StoredTimer = {
          startedAt: 0,
          accumulated: s.accumulated + secSinceStart,
          paused: true,
        };
        storeRef.current = updated;
        writeStore(ticketId, updated);
        setIsRunning(false);
        toast.info("Timer pausado por inatividade", { duration: 3000 });
      }
    }, IDLE_TIMEOUT_MS);
  }, [ticketId, isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    const events = ["mousemove", "keydown", "click", "scroll", "touchstart"];
    const handler = () => {
      // Se estava pausado por inatividade, retomar
      const s = storeRef.current;
      if (s.paused && elapsed > 0) {
        // Não retomar automaticamente — só reset do idle timer
      }
      resetIdleTimer();
    };
    events.forEach((e) => window.addEventListener(e, handler, { passive: true }));
    resetIdleTimer();
    return () => {
      events.forEach((e) => window.removeEventListener(e, handler));
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [resetIdleTimer, elapsed, isAdmin]);

  // ── Controles públicos ────────────────────────────────────────────────────
  const pause = useCallback(() => {
    const s = storeRef.current;
    if (s.paused) return;
    const secSinceStart = Math.floor((Date.now() - s.startedAt) / 1000);
    const updated: StoredTimer = {
      startedAt: 0,
      accumulated: s.accumulated + secSinceStart,
      paused: true,
    };
    storeRef.current = updated;
    writeStore(ticketId, updated);
    setIsRunning(false);
  }, [ticketId]);

  const resume = useCallback(() => {
    const s = storeRef.current;
    if (!s.paused) return;
    const updated: StoredTimer = {
      startedAt: Date.now(),
      accumulated: s.accumulated,
      paused: false,
    };
    storeRef.current = updated;
    writeStore(ticketId, updated);
    setIsRunning(true);
    resetIdleTimer();
  }, [ticketId, resetIdleTimer]);

  const save = useCallback(
    async (descricao: string) => {
      const mins = Math.round(elapsed / 60);
      if (mins < 1) {
        toast.error("Tempo insuficiente para registar (mínimo 1 minuto)");
        return;
      }
      setSaving(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Sem sessão");

        const today = new Date().toISOString().slice(0, 10);

        const { error: entryErr } = await supabase.from("time_entries").insert({
          ticket_id: ticketId,
          user_id: user.id,
          minutos: mins,
          descricao: descricao.trim() || null,
          data_trabalho: today,
          tipo_intervencao: tipoIntervencao as "remota" | "presencial" | "preventiva" | "critica",
          estado_faturacao: "pendente",
          nao_contabilizar: false,
        });
        if (entryErr) throw entryErr;

        // Atualizar total no ticket
        const { data: ticketData } = await supabase
          .from("tickets")
          .select("tempo_gasto_minutos")
          .eq("id", ticketId)
          .single();
        const currentMins = ticketData?.tempo_gasto_minutos ?? 0;
        await supabase
          .from("tickets")
          .update({ tempo_gasto_minutos: currentMins + mins })
          .eq("id", ticketId);

        clearStore(ticketId);
        toast.success(`Registado: ${mins} min`);
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Erro ao guardar");
      } finally {
        setSaving(false);
      }
    },
    [elapsed, ticketId, tipoIntervencao],
  );

  const discard = useCallback(() => {
    clearStore(ticketId);
    setElapsed(0);
    setIsRunning(false);
    storeRef.current = { startedAt: 0, accumulated: 0, paused: true };
  }, [ticketId]);

  return { elapsed, isRunning, saving, pause, resume, save, discard };
}
