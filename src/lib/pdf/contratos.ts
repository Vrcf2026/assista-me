import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  setActiveBrand, getActiveBrand, getActiveLogo,
  addHeader, hexToRgb,
} from "./base";
import { supabase } from "@/integrations/supabase/client";
import { BRANDS } from "@/lib/brand";

interface Contrato {
  id: string;
  numero: string;
  tipo: string;
  data_inicio: string;
  data_fim: string | null;
  renovacao_automatica: boolean;
  aviso_renovacao_dias: number;
  valor_mensal: number | null;
  valor_total: number | null;
  horas_incluidas: number | null;
  tarifa_hora_extra: number | null;
  inclui: string | null;
  nao_inclui: string | null;
  condicoes: string | null;
  assinado_em: string | null;
  assinado_por_cliente: string | null;
  estado: string;
}

interface Cliente {
  nome: string;
  nif: string | null;
  morada: string | null;
  email_geral: string | null;
  tipo_cliente: string;
  marca: string;
}

const TIPO_LABEL: Record<string, string> = {
  avenca: "Avença Mensal",
  pontual: "Suporte Pontual",
  projeto: "Projeto",
  manutencao: "Manutenção",
};

function formatDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-PT", { day: "2-digit", month: "long", year: "numeric" });
}

function formatEuro(v: number | null): string {
  if (v === null || v === undefined) return "—";
  return v.toLocaleString("pt-PT", { style: "currency", currency: "EUR" });
}

export async function gerarContratoServicos(contratoId: string): Promise<void> {
  // Buscar dados
  const { data: contrato } = await supabase
    .from("contratos" as any)
    .select("*")
    .eq("id", contratoId)
    .single();

  if (!contrato) throw new Error("Contrato não encontrado");

  const { data: cliente } = await supabase
    .from("clients")
    .select("nome, nif, morada, email_geral, tipo_cliente, marca")
    .eq("id", (contrato as any).client_id)
    .single();

  if (!cliente) throw new Error("Cliente não encontrado");

  const c = contrato as unknown as Contrato;
  const cl = cliente as unknown as Cliente;

  await setActiveBrand(cl.marca);
  const brand = getActiveBrand();
  const logo = getActiveLogo();

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = 210;
  const margin = 18;
  let y = 0;

  // ── Cabeçalho ──────────────────────────────────────────────────────────────
  // Fundo escuro no topo
  doc.setFillColor(25, 25, 25);
  doc.rect(0, 0, pageW, 40, "F");

  if (logo) {
    try { doc.addImage(logo, "PNG", margin, 8, 22, 22); } catch { /* ignorar */ }
  }

  const [r, g, b] = hexToRgb(brand.color);
  doc.setTextColor(r, g, b);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text(brand.shortName, logo ? 44 : margin, 18);

  doc.setTextColor(200, 200, 200);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text(brand.address, logo ? 44 : margin, 24);
  doc.text(`NIF: ${brand.nif}  ·  ${brand.contactEmail}`, logo ? 44 : margin, 29);

  // Título do documento
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("CONTRATO DE PRESTAÇÃO DE SERVIÇOS", pageW - margin, 20, { align: "right" });
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(180, 180, 180);
  doc.text(`Ref: ${c.numero}`, pageW - margin, 27, { align: "right" });
  doc.text(`${TIPO_LABEL[c.tipo] ?? c.tipo}`, pageW - margin, 33, { align: "right" });

  y = 50;
  doc.setTextColor(30, 30, 30);

  // ── Partes ──────────────────────────────────────────────────────────────────
  // Fundo cinza claro para as partes
  doc.setFillColor(248, 248, 248);
  doc.setDrawColor(220, 220, 220);
  doc.roundedRect(margin, y, pageW - margin * 2, 38, 2, 2, "FD");

  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(100, 100, 100);
  doc.text("PRESTADOR DE SERVIÇOS", margin + 5, y + 7);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(30, 30, 30);
  doc.setFontSize(9);
  doc.text(brand.fullName, margin + 5, y + 14);
  doc.setFontSize(8);
  doc.setTextColor(80, 80, 80);
  doc.text(`NIF: ${brand.nif}`, margin + 5, y + 20);
  doc.text(brand.address, margin + 5, y + 26);
  doc.text(brand.contactEmail, margin + 5, y + 32);

  // Linha separadora vertical
  doc.setDrawColor(220, 220, 220);
  doc.line(pageW / 2, y + 2, pageW / 2, y + 36);

  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(100, 100, 100);
  doc.text("CLIENTE", pageW / 2 + 5, y + 7);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(30, 30, 30);
  doc.setFontSize(9);
  doc.text(cl.nome, pageW / 2 + 5, y + 14);
  doc.setFontSize(8);
  doc.setTextColor(80, 80, 80);
  if (cl.nif) doc.text(`NIF: ${cl.nif}`, pageW / 2 + 5, y + 20);
  if (cl.morada) doc.text(cl.morada.slice(0, 55), pageW / 2 + 5, y + 26);
  if (cl.email_geral) doc.text(cl.email_geral, pageW / 2 + 5, y + 32);

  y += 46;

  // ── Vigência ────────────────────────────────────────────────────────────────
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 30, 30);
  doc.text("1. VIGÊNCIA", margin, y);
  y += 6;

  const vigencia = [
    ["Início", formatDate(c.data_inicio)],
    ["Fim", c.data_fim ? formatDate(c.data_fim) : "Indeterminado"],
    ["Renovação automática", c.renovacao_automatica ? "Sim" : "Não"],
    ["Aviso de renovação", `${c.aviso_renovacao_dias} dias antes do fim`],
  ];

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [],
    body: vigencia,
    styles: { fontSize: 8, cellPadding: 3 },
    columnStyles: {
      0: { cellWidth: 55, fontStyle: "bold", fillColor: [245, 245, 245] },
      1: { cellWidth: "auto" },
    },
    theme: "grid",
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  // ── Condições financeiras ───────────────────────────────────────────────────
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 30, 30);
  doc.text("2. CONDIÇÕES FINANCEIRAS", margin, y);
  y += 6;

  const financeiro: string[][] = [];
  if (c.valor_mensal !== null) financeiro.push(["Valor mensal (c/ IVA)", formatEuro(c.valor_mensal)]);
  if (c.valor_total !== null) financeiro.push(["Valor total (c/ IVA)", formatEuro(c.valor_total)]);
  if (c.horas_incluidas !== null) financeiro.push(["Horas incluídas/mês", `${c.horas_incluidas}h`]);
  if (c.tarifa_hora_extra !== null) financeiro.push(["Hora extra (c/ IVA)", formatEuro(c.tarifa_hora_extra)]);

  if (financeiro.length > 0) {
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [],
      body: financeiro,
      styles: { fontSize: 8, cellPadding: 3 },
      columnStyles: {
        0: { cellWidth: 55, fontStyle: "bold", fillColor: [245, 245, 245] },
        1: { cellWidth: "auto", fontStyle: "bold" },
      },
      theme: "grid",
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // ── O que inclui ────────────────────────────────────────────────────────────
  if (c.inclui) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 30, 30);
    doc.text("3. O QUE ESTÁ INCLUÍDO", margin, y);
    y += 5;

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(50, 50, 50);
    const lines = doc.splitTextToSize(c.inclui, pageW - margin * 2);
    doc.text(lines, margin, y);
    y += lines.length * 4.5 + 6;
  }

  // ── O que não inclui ────────────────────────────────────────────────────────
  if (c.nao_inclui) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 30, 30);
    doc.text(`${c.inclui ? "4" : "3"}. O QUE NÃO ESTÁ INCLUÍDO`, margin, y);
    y += 5;

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(50, 50, 50);
    const lines = doc.splitTextToSize(c.nao_inclui, pageW - margin * 2);
    doc.text(lines, margin, y);
    y += lines.length * 4.5 + 6;
  }

  // ── Condições gerais ────────────────────────────────────────────────────────
  if (c.condicoes) {
    // Nova página se pouco espaço
    if (y > 230) { doc.addPage(); y = 20; }

    const secNum = [c.inclui, c.nao_inclui].filter(Boolean).length + 3;
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 30, 30);
    doc.text(`${secNum}. CONDIÇÕES GERAIS E SLA`, margin, y);
    y += 5;

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(50, 50, 50);
    const lines = doc.splitTextToSize(c.condicoes, pageW - margin * 2);
    doc.text(lines, margin, y);
    y += lines.length * 4.5 + 10;
  }

  // ── Assinaturas ─────────────────────────────────────────────────────────────
  if (y > 220) { doc.addPage(); y = 20; }

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 30, 30);
  doc.text("ASSINATURAS", margin, y);
  y += 8;

  const dataAssinatura = c.assinado_em
    ? formatDate(c.assinado_em)
    : `_______________________________`;

  // Colunas de assinatura
  const colW = (pageW - margin * 2) / 2 - 5;

  // Prestador
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(80, 80, 80);
  doc.text("Pelo Prestador:", margin, y);
  doc.setDrawColor(180, 180, 180);
  doc.line(margin, y + 18, margin + colW, y + 18);
  doc.setFontSize(7);
  doc.text(brand.fullName, margin, y + 23);
  doc.text(`Data: ${c.assinado_em ? dataAssinatura : "_______________________________"}`, margin, y + 28);

  // Cliente
  const cx2 = pageW / 2 + 5;
  doc.setFontSize(8);
  doc.text("Pelo Cliente:", cx2, y);
  doc.line(cx2, y + 18, cx2 + colW, y + 18);
  doc.setFontSize(7);
  doc.text(c.assinado_por_cliente ?? cl.nome, cx2, y + 23);
  doc.text(`Data: ${c.assinado_em ? dataAssinatura : "_______________________________"}`, cx2, y + 28);

  y += 38;

  // ── Rodapé ──────────────────────────────────────────────────────────────────
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `${brand.fullName}  ·  NIF ${brand.nif}  ·  ${brand.contactEmail}  ·  ${brand.contactPhone}`,
      pageW / 2, 290, { align: "center" }
    );
    doc.text(`Página ${i} de ${pageCount}  ·  ${c.numero}`, pageW / 2, 294, { align: "center" });
  }

  doc.save(`contrato-${c.numero.toLowerCase()}-${cl.nome.toLowerCase().replace(/\s+/g, "-")}.pdf`);
}
