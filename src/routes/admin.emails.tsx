import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { RequireRole } from "@/components/RequireRole";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { formatDateTime } from "@/lib/format";
import { ArrowLeft, Mail, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/admin/emails")({
  component: AdminEmailsPage,
});

interface LogRow {
  id: string;
  message_id: string | null;
  template_name: string;
  recipient_email: string;
  status: string;
  error_message: string | null;
  created_at: string;
}

type Range = "24h" | "7d" | "30d";

function startOf(range: Range): Date {
  const now = new Date();
  if (range === "24h") return new Date(now.getTime() - 24 * 60 * 60 * 1000);
  if (range === "7d") return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
}

const STATUS_VARIANTS: Record<string, { cls: string; label: string }> = {
  sent: { cls: "bg-emerald-100 text-emerald-700 border-emerald-200", label: "Enviado" },
  pending: { cls: "bg-amber-100 text-amber-700 border-amber-200", label: "Pendente" },
  dlq: { cls: "bg-red-100 text-red-700 border-red-200", label: "Falhou" },
  failed: { cls: "bg-red-100 text-red-700 border-red-200", label: "Falhou" },
  suppressed: { cls: "bg-slate-100 text-slate-700 border-slate-200", label: "Suprimido" },
  bounced: { cls: "bg-red-100 text-red-700 border-red-200", label: "Devolvido" },
  complained: { cls: "bg-orange-100 text-orange-700 border-orange-200", label: "Spam" },
};

function StatusBadge({ status }: { status: string }) {
  const v = STATUS_VARIANTS[status] ?? { cls: "bg-slate-100 text-slate-700 border-slate-200", label: status };
  return <Badge variant="outline" className={v.cls}>{v.label}</Badge>;
}

function AdminEmailsPage() {
  return (
    <RequireRole role="admin" unauthenticatedRedirectTo="/login">
      <AppLayout><Dashboard /></AppLayout>
    </RequireRole>
  );
}

function Dashboard() {
  const [range, setRange] = useState<Range>("7d");
  const [template, setTemplate] = useState<string>("__all");
  const [status, setStatus] = useState<string>("__all");
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const since = startOf(range).toISOString();
    const { data, error } = await supabase
      .from("email_send_log")
      .select("*")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (!error) setRows((data ?? []) as LogRow[]);
    setLoading(false);
  };

  useEffect(() => { void load(); }, [range]);

  // Deduplicar por message_id (manter mais recente)
  const dedup = useMemo(() => {
    const map = new Map<string, LogRow>();
    for (const r of rows) {
      const key = r.message_id ?? r.id;
      if (!map.has(key)) map.set(key, r); // já vem ordenado desc
    }
    return Array.from(map.values());
  }, [rows]);

  const templates = useMemo(() => {
    const s = new Set(dedup.map((r) => r.template_name));
    return Array.from(s).sort();
  }, [dedup]);

  const filtered = useMemo(() => {
    return dedup.filter((r) =>
      (template === "__all" || r.template_name === template) &&
      (status === "__all" || r.status === status)
    );
  }, [dedup, template, status]);

  const stats = useMemo(() => {
    const acc = { total: 0, sent: 0, failed: 0, suppressed: 0, pending: 0 };
    for (const r of filtered) {
      acc.total++;
      if (r.status === "sent") acc.sent++;
      else if (r.status === "dlq" || r.status === "failed" || r.status === "bounced") acc.failed++;
      else if (r.status === "suppressed" || r.status === "complained") acc.suppressed++;
      else if (r.status === "pending") acc.pending++;
    }
    return acc;
  }, [filtered]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link to="/"><ArrowLeft className="h-4 w-4 mr-1" /> Voltar</Link>
          </Button>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Mail className="h-6 w-6 text-primary" /> Emails
          </h1>
        </div>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="h-4 w-4 mr-1" /> Actualizar
        </Button>
      </div>

      {/* Filtros */}
      <Card className="p-4">
        <div className="grid sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Intervalo</label>
            <Select value={range} onValueChange={(v) => setRange(v as Range)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="24h">Últimas 24h</SelectItem>
                <SelectItem value="7d">Últimos 7 dias</SelectItem>
                <SelectItem value="30d">Últimos 30 dias</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Template</label>
            <Select value={template} onValueChange={setTemplate}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">Todos</SelectItem>
                {templates.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Estado</label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">Todos</SelectItem>
                <SelectItem value="sent">Enviado</SelectItem>
                <SelectItem value="pending">Pendente</SelectItem>
                <SelectItem value="dlq">Falhou</SelectItem>
                <SelectItem value="suppressed">Suprimido</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total" value={stats.total} />
        <StatCard label="Enviados" value={stats.sent} accent="emerald" />
        <StatCard label="Falhados" value={stats.failed} accent="red" />
        <StatCard label="Suprimidos" value={stats.suppressed} accent="slate" />
      </div>

      {/* Tabela */}
      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-2">Quando</th>
                <th className="text-left px-4 py-2">Template</th>
                <th className="text-left px-4 py-2">Destinatário</th>
                <th className="text-left px-4 py-2">Estado</th>
                <th className="text-left px-4 py-2">Erro</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">A carregar…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">Sem registos no intervalo seleccionado.</td></tr>
              ) : filtered.slice(0, 200).map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-4 py-2 whitespace-nowrap text-xs text-muted-foreground">{formatDateTime(r.created_at)}</td>
                  <td className="px-4 py-2 font-mono text-xs">{r.template_name}</td>
                  <td className="px-4 py-2">{r.recipient_email}</td>
                  <td className="px-4 py-2"><StatusBadge status={r.status} /></td>
                  <td className="px-4 py-2 text-xs text-muted-foreground max-w-xs truncate" title={r.error_message ?? ""}>{r.error_message ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length > 200 && (
          <div className="px-4 py-2 border-t text-xs text-muted-foreground bg-secondary/30">
            A mostrar 200 de {filtered.length} registos. Refine os filtros para ver mais.
          </div>
        )}
      </Card>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent?: "emerald" | "red" | "slate" }) {
  const color =
    accent === "emerald" ? "text-emerald-600" :
    accent === "red" ? "text-red-600" :
    accent === "slate" ? "text-slate-600" : "text-foreground";
  return (
    <Card className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-semibold ${color}`}>{value}</div>
    </Card>
  );
}
